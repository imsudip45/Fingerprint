"""
Fingerprint Backend - FastAPI WebSocket server.
Connects to Gemini Live API for real-time voice conversation with backend-driven orchestration.
"""
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from google.genai import types
from pydantic import BaseModel
import asyncio
import json
import os
import re
import time
import traceback
import uuid

from config import live_client, LIVE_MODEL
from prompts import SYSTEM_INSTRUCTION
from profile import authenticate_learner, create_learner_account, load_profile, save_profile, format_public_profile
from handlers import execute_action
from generators import analyze_visual_artifact, generate_image, generate_quiz
from planner import (
    BORED_EMOJI,
    CONFUSED_EMOJI,
    EXCITED_EMOJI,
    build_returning_learner_hint,
    detect_learning_style_signal,
    detect_topic_choice,
    plan_next_step,
    reflect_on_state,
)
from session_state import SessionState

app = FastAPI(title="Fingerprint Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
HAS_STATIC = os.path.isdir(STATIC_DIR)
if HAS_STATIC:
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="static-assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
else:
    @app.get("/")
    async def root():
        return {"message": "Fingerprint Backend is live!"}


class LearnerAuthRequest(BaseModel):
    learner_name: str
    pin: str


def _auth_response(profile: dict) -> dict:
    return {
        "learnerId": profile.get("learner_id"),
        "learnerName": profile.get("learner_name", ""),
    }


@app.post("/api/auth/create")
async def create_learner(request: LearnerAuthRequest):
    try:
        profile = create_learner_account(request.learner_name, request.pin)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return _auth_response(profile)


@app.post("/api/auth/login")
async def login_learner(request: LearnerAuthRequest):
    profile = authenticate_learner(request.learner_name, request.pin)
    if not profile:
        raise HTTPException(status_code=401, detail="Invalid learner name or PIN.")
    return _auth_response(profile)


@app.get("/api/profile/{learner_id}")
async def get_learner_profile(learner_id: str):
    clean_id = str(learner_id or "").strip()
    if not clean_id:
        raise HTTPException(status_code=400, detail="Missing learner id.")
    profile = load_profile(clean_id)
    if not profile.get("learner_id"):
        raise HTTPException(status_code=404, detail="Learner profile not found.")
    return format_public_profile(profile)


@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Frontend connected")

    interrupted = asyncio.Event()
    learner_id = websocket.query_params.get("learner_id") or f"learner-{str(uuid.uuid4())[:12]}"
    # Sanitize learner_id to prevent path traversal or Firestore injection
    learner_id = re.sub(r"[^a-zA-Z0-9_-]", "", learner_id)[:64] or f"learner-{str(uuid.uuid4())[:12]}"
    learner_name = re.sub(r"\s+", " ", str(websocket.query_params.get("learner_name") or "").strip())[:80]
    session_id = str(uuid.uuid4())[:8]
    profile = load_profile(learner_id)
    if learner_name:
        profile["learner_name"] = learner_name
    learner_name = str(profile.get("learner_name", "")).strip()
    session_state = SessionState(
        session_id=session_id,
        learner_id=learner_id,
        current_style=profile["learning_style"],
        style_confidence=profile.get("style_confidence", 0),
        interests=list(profile.get("interests", []))[-8:],
        mastery_map=dict(profile.get("mastery", {})),
    )
    ws_open = True

    async def safe_send_text(data: str):
        nonlocal ws_open
        if not ws_open:
            return
        try:
            await websocket.send_text(data)
        except Exception:
            ws_open = False

    async def safe_send_bytes(data: bytes):
        nonlocal ws_open
        if not ws_open:
            return
        try:
            await websocket.send_bytes(data)
        except Exception:
            ws_open = False

    plan_lock = asyncio.Lock()
    orchestrator_lock = asyncio.Lock()
    topic_detection_lock = asyncio.Lock()
    background_tasks: set[asyncio.Task] = set()
    _reflecting = False
    _updating_style = False

    def run_background(coro, label: str):
        if not ws_open:
            return
        task = asyncio.create_task(coro)
        background_tasks.add(task)

        def _done(t: asyncio.Task):
            background_tasks.discard(t)
            try:
                t.result()
            except asyncio.CancelledError:
                pass
            except Exception as err:
                print(f"Background task '{label}' failed: {err}")

        task.add_done_callback(_done)

    async def refresh_agent_plan(trigger: str, detail: str = ""):
        if not ws_open:
            return
        async with plan_lock:
            plan = await plan_next_step(session_state, profile, trigger, detail)
            session_state.set_plan(plan)
            await safe_send_text(json.dumps({"type": "agent_plan", "data": plan}))
            await safe_send_text(json.dumps({"type": "progress", "data": session_state.get_progress()}))
            if plan.get("rescue"):
                await safe_send_text(json.dumps({"type": "rescue", "data": True}))

    try:
        # NOTE: Native audio models do NOT support send_tool_response or
        # send_client_content mid-stream (causes 1008 policy violation).
        # Tools are executed directly by the backend planner instead.

        # Calculate recent struggles from lifetime memory (Firestore/local profile)
        recent_struggles = []
        for qr in reversed(profile.get("quiz_results", [])):
            if not qr.get("correct"):
                subtopic = qr.get("subtopic") or qr.get("topic")
                if subtopic and subtopic not in recent_struggles:
                    recent_struggles.append(subtopic)
            if len(recent_struggles) >= 3:
                break
                
        custom_system_instruction = SYSTEM_INSTRUCTION
        if recent_struggles:
            custom_system_instruction += f"\n\nMEMORY RECALL: The learner recently struggled with these topics: {', '.join(recent_struggles)}. If these come up, explicitly mention that you remember they found it tricky last time, and take it slow."

        live_session = None
        live_config_attempts = [
            types.LiveConnectConfig(
                response_modalities=["AUDIO"],
                input_audio_transcription=types.AudioTranscriptionConfig(),
                output_audio_transcription=types.AudioTranscriptionConfig(),
                system_instruction=types.Content(parts=[types.Part.from_text(text=custom_system_instruction)]),
            ),
            types.LiveConnectConfig(
                response_modalities=["AUDIO"],
                input_audio_transcription=types.AudioTranscriptionConfig(),
                system_instruction=types.Content(parts=[types.Part.from_text(text=custom_system_instruction)]),
            ),
            types.LiveConnectConfig(
                response_modalities=["AUDIO"],
                system_instruction=types.Content(parts=[types.Part.from_text(text=custom_system_instruction)]),
            ),
        ]

        session_ctx = None
        for i, live_config in enumerate(live_config_attempts):
            try:
                session_ctx = live_client.aio.live.connect(model=LIVE_MODEL, config=live_config)
                live_session = await session_ctx.__aenter__()
                print(f"Live API connected (config attempt {i+1}, session: {session_id}, learner: {learner_id})")
                break
            except Exception as config_err:
                print(f"Config attempt {i+1} failed: {config_err}")
                if i == len(live_config_attempts) - 1:
                    raise

        session = live_session

        try:
            turn_transcript = ""
            last_processed_input = ""

            async def send_system_instruction(text: str):
                """Try to inject a system-level hint into the Live session.
                Native audio models often reject this mid-stream, so we
                silently swallow errors to prevent session crashes."""
                if not ws_open or not text.strip():
                    return
                try:
                    await session.send_client_content(
                        turns=types.Content(
                            role="user",
                            parts=[types.Part.from_text(text=f"[System: {text}]")],
                        ),
                        turn_complete=True,
                    )
                except Exception as e:
                    print(f"[send_system_instruction] Suppressed error (native audio model limitation): {e}")

            def build_action_args(action: str, plan: dict) -> dict:
                lvc = session_state.latest_visual_context or {}
                focus = (
                    plan.get("focus")
                    or lvc.get("extracted_problem")
                    or lvc.get("reasoning_focus")
                    or session_state.last_quiz_subtopic
                    or session_state.topic
                    or "a fun starter concept"
                ).strip()
                focus_lower = focus.lower()

                if action == "generate_illustration":
                    style_hint = "diagram"
                    if any(k in focus_lower for k in ["equation", "fraction", "geometry", "graph", "math", "angle"]):
                        style_hint = "step_by_step"
                    elif session_state.current_style == "storyteller":
                        style_hint = "story_scene"
                    elif session_state.current_style == "analogist":
                        style_hint = "comparison"
                    return {"topic": focus, "style_hint": style_hint}

                if action == "generate_quiz":
                    return {"topic": focus, "difficulty": session_state.difficulty}

                if action == "search_and_display":
                    title = f"{(session_state.topic or focus).title()} facts"
                    return {"query": focus, "display_title": title[:40]}

                if action == "show_worked_example":
                    problem = (
                        lvc.get("extracted_problem")
                        or session_state.last_quiz_question
                        or f"A simple {session_state.difficulty} problem about {focus}"
                    )
                    return {"problem": problem, "topic": session_state.topic or focus}

                return {}

            async def maybe_execute_planned_action(trigger: str, detail: str = "", force: bool = False) -> bool:
                if not ws_open or not session_state.topic:
                    return False

                async with orchestrator_lock:
                    plan = session_state.current_plan or {}
                    if (action := plan.get("next_action")) not in {
                        "generate_illustration",
                        "generate_quiz",
                        "search_and_display",
                        "show_worked_example",
                    }:
                        if session_state.topic and session_state.turn_count >= 1:
                            if session_state.last_backend_action != "generate_illustration" and not session_state.cached_visual:
                                args = build_action_args("generate_illustration", plan)
                                async def warm_visual():
                                    try:
                                        print(f"[Warming] Pre-fetching image for: {args.get('topic', '')[:30]}...")
                                        res = await generate_image(args.get("topic", ""), args.get("style_hint", "diagram"))
                                        if res: 
                                            session_state.cached_visual = {"result": res, "topic": args.get("topic")}
                                            print("[Warming] Image pre-fetched successfully!")
                                    except Exception: pass
                                run_background(warm_visual(), "warm_visual")
                            elif session_state.last_backend_action != "generate_quiz" and not session_state.cached_quiz:
                                args = build_action_args("generate_quiz", plan)
                                async def warm_quiz():
                                    try:
                                        print(f"[Warming] Pre-fetching quiz for: {args.get('topic', '')[:30]}...")
                                        res = await generate_quiz(args.get("topic", ""), session_state.difficulty, session_state.get_asked_questions())
                                        if res: 
                                            session_state.cached_quiz = {"quiz": res, "topic": args.get("topic")}
                                            print("[Warming] Quiz pre-fetched successfully!")
                                    except Exception: pass
                                run_background(warm_quiz(), "warm_quiz")
                        return False

                    if not force:
                        if session_state.turn_count < 3:
                            return False  # Let the AI teach a few turns before generating UI content
                        if session_state.last_backend_action_turn == session_state.turn_count:
                            return False
                        if (
                            session_state.last_backend_action == action
                            and session_state.last_backend_action_turn >= 0
                            and (session_state.turn_count - session_state.last_backend_action_turn) < 2
                        ):
                            return False

                    # Execute the tool directly from the backend planner.
                    # Native audio models don't support tool calling or mid-stream
                    # text injection, so the backend drives UI actions directly.
                    assert isinstance(action, str)
                    args = build_action_args(action, plan)
                    result = await execute_action(
                        action, args, session_state, profile, safe_send_text
                    )
                    session_state.mark_backend_action(action)
                    await refresh_agent_plan("backend_action", f"{trigger}:{detail or action}")
                    # Give the tutor an explicit verbal instruction about what to do
                    # with the new UI content (quiz, visual, search results, etc.).
                    try:
                        your_task = (result or {}).get("your_task")
                    except Exception:
                        your_task = None
                    if your_task:
                        await send_system_instruction(str(your_task))
                    return True

            async def maybe_detect_topic_from_input(user_text: str):
                nonlocal last_processed_input
                if session_state.topic:
                    return

                cleaned = re.sub(r"\s+", " ", (user_text or "").strip())
                if len(normalized := cleaned.lower()) < 2 or normalized == last_processed_input:
                    return

                async with topic_detection_lock:
                    if session_state.topic:
                        return
                    last_processed_input = normalized
                    topic = await detect_topic_choice(session_state, profile, cleaned)

                    # If the model could not confidently pick a topic, fall back to a
                    # more conservative heuristic that tries to extract ONLY an
                    # explicit learning request (\"learn X\", \"study X\", etc.)
                    if not topic:
                        def _sanitize_topic(raw: str) -> str | None:
                            txt = (raw or "").strip().strip(" .!?\"'()[]{}")
                            if not txt:
                                return None

                            txt = re.sub(r"\s+", " ", txt).strip()

                            txt = re.sub(
                                r"^(?:about|more|on|the|a|an|this|that|some|please|pls|like)\s+",
                                "",
                                txt,
                                flags=re.IGNORECASE,
                            ).strip()

                            txt_lower = txt.lower()
                            if " and " in txt_lower and not any(
                                k in txt_lower for k in [" and how ", " and what ", " and why ", " and when "]
                            ):
                                left, _, _rest = txt.partition(" and ")
                                if left.strip():
                                    txt = left.strip()
                                    txt_lower = txt.lower()

                            txt = re.sub(
                                r"\s+(?:for me|for us|right now|today|please)$",
                                "",
                                txt,
                                flags=re.IGNORECASE,
                            ).strip()

                            bad = {
                                "yes",
                                "yeah",
                                "yep",
                                "ok",
                                "okay",
                                "sure",
                                "hello",
                                "hi",
                                "thanks",
                                "thank you",
                            }
                            if txt_lower in bad:
                                return None

                            words = txt.split()
                            if len(words) > 10:
                                txt = " ".join(words[:10]).strip()

                            if not any(ch.isalpha() for ch in txt):
                                return None

                            return txt[:80].title()

                        candidate = None

                        # Prefer the *last* explicit learning request in the utterance
                        patterns = [
                            r"(?:i\s+want\s+to\s+learn(?:\s+more)?(?:\s+about)?)\s+([^?.!]+)",
                            r"(?:i\s+wanna\s+learn(?:\s+more)?(?:\s+about)?)\s+([^?.!]+)",
                            r"(?:can\s+you\s+teach\s+me(?:\s+about)?)\s+([^?.!]+)",
                            r"(?:teach\s+me(?:\s+about)?)\s+([^?.!]+)",
                            r"(?:help\s+me\s+with)\s+([^?.!]+)",
                            r"(?:explain)\s+([^?.!]+)",
                            r"(?:learn(?:\s+more)?\s+about)\s+([^?.!]+)",
                            r"(?:learn)\s+([^?.!]+)",
                            r"(?:study)\s+([^?.!]+)",
                            r"(?:understand)\s+([^?.!]+)",
                            r"(?:topic\s+is)\s+([^?.!]+)",
                        ]
                        for pat in patterns:
                            for m in re.finditer(pat, normalized):
                                candidate = m.group(1)
                        if candidate:
                            topic = _sanitize_topic(candidate)

                    if not topic:
                        return

                    await execute_action(
                        "set_current_topic",
                        {"topic": topic},
                        session_state,
                        profile,
                        safe_send_text,
                    )
                    session_state.mark_backend_action("set_current_topic")
                    await refresh_agent_plan("topic_selected", topic)
                    executed = await maybe_execute_planned_action("topic_selected", topic)
                    if not executed:
                        plan_prompt = (session_state.current_plan or {}).get("coach_prompt", "")
                        await send_system_instruction(
                            f"The learner chose '{topic}'. Start teaching it now with a fun fact or a simple question. Planner: {plan_prompt}"
                        )

            async def maybe_update_learning_style(trigger: str):
                nonlocal _updating_style
                if _updating_style:
                    return
                _updating_style = True
                try:
                    style_signal = await detect_learning_style_signal(session_state, profile)
                    if not style_signal:
                        return
                    await execute_action(
                        "update_learning_style",
                        style_signal,
                        session_state,
                        profile,
                        safe_send_text,
                    )
                finally:
                    _updating_style = False

            async def reflect_and_adapt(trigger: str, detail: str = ""):
                nonlocal _reflecting
                if _reflecting:
                    return
                _reflecting = True
                try:
                    reflection = await reflect_on_state(session_state, profile, trigger, detail)
                    if not reflection:
                        return

                    session_state.set_reflection(reflection)
                    session_state.learner_state = reflection.get("learner_state", session_state.learner_state)
                    session_state.rescue_mode = bool(reflection.get("rescue", session_state.rescue_mode))
                    if summary := reflection.get("summary"):
                        await safe_send_text(json.dumps({
                            "type": "detection",
                            "data": f"Reflection: {summary}",
                        }))
                    if (style := reflection.get("style_signal")) in {"storyteller", "analogist", "visualizer", "teacher"} and reflection.get("style_confidence", 0) >= 45:
                        await execute_action(
                            "update_learning_style",
                            {
                                "style": style,
                                "confidence": reflection.get("style_confidence", 0),
                                "reason": reflection.get("style_reason", ""),
                            },
                            session_state,
                            profile,
                            safe_send_text,
                        )
                    await refresh_agent_plan("reflection", reflection.get("next_hint") or detail or trigger)
                finally:
                    _reflecting = False

            async def process_visual_input(payload: dict):
                label = str(payload.get("label") or "Worksheet upload")[:80]
                mime_type = str(payload.get("mime_type") or "image/jpeg")
                image_b64 = str(payload.get("data") or "")
                if not image_b64:
                    return

                await safe_send_text(json.dumps({
                    "type": "visual",
                    "data": {
                        "kind": "image",
                        "content": image_b64,
                        "mime_type": mime_type,
                        "prompt": label,
                        "title": label,
                        "source": "learner",
                    },
                }))
                await safe_send_text(json.dumps({"type": "agent_action", "data": "inspect_visual"}))
                await safe_send_text(json.dumps({"type": "detection", "data": f"Visual uploaded: {label}"}))

                analysis = await analyze_visual_artifact(image_b64, mime_type, label)
                await safe_send_text(json.dumps({"type": "agent_action", "data": None}))
                if not analysis:
                    await safe_send_text(json.dumps({
                        "type": "detection",
                        "data": "I can see the image, but I need a clearer photo or a short explanation.",
                    }))
                    return

                session_state.set_visual_context(analysis)
                await safe_send_text(json.dumps({"type": "artifact_analysis", "data": analysis}))
                await safe_send_text(json.dumps({
                    "type": "detection",
                    "data": f"Visual understood: {analysis.get('summary', '')[:80]}",
                }))

                detected_topic = str(analysis.get("detected_topic") or "").strip()
                if detected_topic and not session_state.topic:
                    await execute_action(
                        "set_current_topic",
                        {"topic": detected_topic},
                        session_state,
                        profile,
                        safe_send_text,
                    )
                    session_state.mark_backend_action("set_current_topic")

                focus = str(
                    analysis.get("reasoning_focus")
                    or analysis.get("extracted_problem")
                    or detected_topic
                    or label
                )[:140]
                await refresh_agent_plan("visual_input", focus)
                await maybe_update_learning_style("visual_input")
                await reflect_and_adapt("visual_input", focus)
                plan_prompt = (session_state.current_plan or {}).get("coach_prompt", "")
                await send_system_instruction(
                    f"The learner just uploaded an image called '{label}'. "
                    f"What you can rely on: {analysis.get('summary', '')} "
                    f"Help with: {focus}. "
                    f"Ask for clarification only if needed: {analysis.get('needs_clarification', False)}. "
                    f"Planner: {plan_prompt}. "
                    f"Visual guidance: {analysis.get('coach_prompt', '')}"
                )

            async def process_text_input(payload):
                user_text = payload if isinstance(payload, str) else str((payload or {}).get("text", ""))
                if not (cleaned := " ".join(user_text.strip().split())):
                    return

                session_state.add_learner_message(cleaned)
                await safe_send_text(json.dumps({
                    "type": "detection",
                    "data": f"Typed input received: {cleaned[:80]}",
                }))
                try:
                    await session.send_client_content(
                        turns=types.Content(
                            role="user",
                            parts=[types.Part.from_text(text=cleaned)],
                        ),
                        turn_complete=True,
                    )
                except Exception as e:
                    print(f"[process_text_input] Could not inject text into Live session: {e}")

                async def orchestrate_after_text():
                    await maybe_detect_topic_from_input(cleaned)
                    await maybe_update_learning_style("text_input")
                    await reflect_and_adapt("text_input", cleaned[:120])

                run_background(orchestrate_after_text(), "orchestrate_after_text")

            await safe_send_text(json.dumps({"type": "style", "data": session_state.current_style}))
            learner_label = learner_name or learner_id
            await safe_send_text(json.dumps({"type": "detection", "data": f"Learner profile ready: {learner_label}"}))
            await safe_send_text(json.dumps({"type": "progress", "data": session_state.get_progress()}))
            await refresh_agent_plan("session_start", "connection opened")

            memory_hint = build_returning_learner_hint(profile)
            learner_plan = session_state.current_plan or {}
            opening_instruction = (
                f"[System: The session just started for learner {learner_id}. "
                f"{f'The learner name is {learner_name}. ' if learner_name else ''}"
                "Say \"Hey! I'm Fingerprint\" then ask what they would like to learn. "
                "Suggest 2-3 fun topic examples from different subjects like math, science, and history. "
                "Turn 1 - focus on a warm greeting and topic discovery only. Do not call the child by pet names. "
                f"Planner note: {learner_plan.get('coach_prompt', '')} {memory_hint}]"
            )
            await session.send_client_content(
                turns=types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=opening_instruction)],
                ),
                turn_complete=True,
            )

            async def receive_from_frontend():
                nonlocal ws_open
                try:
                    while True:
                        message = await websocket.receive()
                        if "bytes" in message:
                            await session.send_realtime_input(
                                media=types.Blob(
                                    data=message["bytes"],
                                    mime_type="audio/pcm;rate=16000",
                                )
                            )
                        elif "text" in message:
                            try:
                                msg = json.loads(message["text"])
                                if msg.get("type") == "interrupt":
                                    print("[WS] Interrupt")
                                    interrupted.set()
                                    await safe_send_text(json.dumps({"type": "state", "data": "listening"}))
                                elif msg.get("type") == "quiz_answer":
                                    if not (q := msg.get("data", {})): return
                                    correct = q.get("correct", False)
                                    answer = q.get("answer", "")
                                    mark = "correct" if correct else "incorrect"
                                    print(f"[WS] Quiz: '{answer}' ({mark})")

                                    session_state.record_quiz(
                                        question=session_state.last_quiz_question,
                                        answer=answer,
                                        correct=correct,
                                    )
                                    session_state.add_learner_message(f"Quiz answer: {answer}")
                                    session_state.update_mastery(
                                        session_state.last_quiz_subtopic or session_state.topic or "",
                                        correct,
                                    )
                                    profile["mastery"] = session_state.mastery_map
                                    profile.setdefault("quiz_results", []).append({
                                        "answer": answer,
                                        "correct": correct,
                                        "turn": session_state.turn_count,
                                        "topic": session_state.topic,
                                        "subtopic": session_state.last_quiz_subtopic or session_state.topic,
                                    })
                                    save_profile(profile)

                                    await refresh_agent_plan("quiz_answer", f"{answer} ({mark})")
                                    await reflect_and_adapt("quiz_answer", f"{answer} ({mark})")

                                    context = session_state.get_context_for_model()
                                    plan_prompt = (session_state.current_plan or {}).get("coach_prompt", "")
                                    result_text = (
                                        f"The child answered the quiz. They chose '{answer}'. "
                                        f"{'CORRECT - celebrate enthusiastically.' if correct else 'WRONG - gently explain the right answer.'} "
                                        f"[Session: {context}] "
                                        f"[Planner: {plan_prompt}] Continue teaching the next best aspect of the topic."
                                    )
                                    await session.send_client_content(
                                        turns=types.Content(
                                            role="user",
                                            parts=[types.Part.from_text(text=result_text)],
                                        ),
                                        turn_complete=True,
                                    )

                                elif msg.get("type") == "reaction":
                                    emoji = msg.get("data", "")
                                    reaction_map = {
                                        EXCITED_EMOJI: "The child tapped the excited reaction. Go deeper with a concrete wow moment or real-world example.",
                                        CONFUSED_EMOJI: "The child tapped confused. Stop and re-explain the last concept much more simply using a different approach.",
                                        BORED_EMOJI: "The child tapped bored. Switch to something interactive immediately and reset the energy.",
                                    }
                                    session_state.note_reaction(emoji)
                                    print(f"[WS] Reaction: {emoji}")
                                    await refresh_agent_plan("reaction", emoji)
                                    executed = await maybe_execute_planned_action("reaction", emoji, force=True)
                                    if not executed:
                                        plan_prompt = (session_state.current_plan or {}).get("coach_prompt", "")
                                        hint = reaction_map.get(emoji, f"The child reacted: {emoji}")
                                        await session.send_client_content(
                                            turns=types.Content(
                                                role="user",
                                                parts=[types.Part.from_text(text=f"[System: IMPORTANT - {hint} Planner: {plan_prompt}]")],
                                            ),
                                            turn_complete=True,
                                        )

                                elif msg.get("type") == "subtopic_click":
                                    sub = msg.get("data", "")
                                    if sub:
                                        print(f"[WS] Subtopic click: {sub}")
                                        session_state.add_subtopic(sub)
                                        await refresh_agent_plan("subtopic_click", sub)
                                        executed = await maybe_execute_planned_action("subtopic_click", sub, force=True)
                                        if not executed:
                                            plan_prompt = (session_state.current_plan or {}).get("coach_prompt", "")
                                            await session.send_client_content(
                                                turns=types.Content(
                                                    role="user",
                                                    parts=[types.Part.from_text(
                                                        text=(
                                                            f"[System: The child tapped the subtopic '{sub}'. "
                                                            f"Teach them about this now. Start with a fun fact or question. Planner: {plan_prompt}]"
                                                        )
                                                    )],
                                                ),
                                                turn_complete=True,
                                            )

                                elif msg.get("type") == "visual_input":
                                    await process_visual_input(msg.get("data", {}))

                                elif msg.get("type") == "text_input":
                                    await process_text_input(msg.get("data", ""))

                            except json.JSONDecodeError:
                                pass
                except WebSocketDisconnect:
                    print("Frontend disconnected")
                    ws_open = False
                except Exception as e:
                    message = str(e)
                    if "disconnect message has been received" in message.lower():
                        ws_open = False
                        return
                    print(f"Receive error: {e}")

            async def send_to_frontend():
                nonlocal turn_transcript

                try:
                    while True:
                        async for response in session.receive():
                            if not ws_open:
                                return

                            if response.server_content and response.server_content.model_turn:
                                interrupted.clear()
                                for part in response.server_content.model_turn.parts:
                                    if interrupted.is_set():
                                        continue
                                    if part.inline_data:
                                        await safe_send_bytes(part.inline_data.data)
                                    if part.text:
                                        clean = re.sub(r'\*\*[^*]+\*\*\s*', '', part.text)
                                        clean = re.sub(r'^#+\s+.*$', '', clean, flags=re.MULTILINE).strip()
                                        if clean:
                                            turn_transcript += clean
                                            await safe_send_text(json.dumps({"type": "transcript", "data": clean}))

                            if response.server_content and response.server_content.output_transcription:
                                if caption := response.server_content.output_transcription.text:
                                    await safe_send_text(json.dumps({"type": "caption", "data": caption}))

                            if (sc := response.server_content) and (it := getattr(sc, "input_transcription", None)) and getattr(it, "text", None):
                                raw_text = it.text.strip()
                                txt = raw_text.lower()
                                session_state.add_learner_message(raw_text)
                                confused_signals = ["huh", "what", "i don't get it", "i don't understand", "confused", "wait what", "um", "uh"]
                                if any(s in txt for s in confused_signals) and len(txt) < 30:
                                    session_state.learner_state = "confused"
                                    session_state.rescue_mode = True
                                    await safe_send_text(json.dumps({
                                        "type": "detection",
                                        "data": "Possible confusion detected - adapting",
                                    }))
                                await maybe_detect_topic_from_input(raw_text)

                            if response.server_content and response.server_content.turn_complete:
                                session_state.turn_count += 1
                                turn_transcript = ""
                                interrupted.clear()
                                await safe_send_text(json.dumps({"type": "turn_complete"}))
                                async def post_turn_orchestration():
                                    await maybe_update_learning_style("turn_complete")
                                    await reflect_and_adapt("turn_complete", session_state.topic or "")
                                    await refresh_agent_plan("turn_complete", session_state.topic or "")
                                    executed = await maybe_execute_planned_action("turn_complete")
                                    if not executed and session_state.topic:
                                        plan_prompt = (session_state.current_plan or {}).get("coach_prompt", "")
                                        if plan_prompt:
                                            await send_system_instruction(f"Planner: {plan_prompt}")

                                run_background(post_turn_orchestration(), "post_turn_orchestration")
                                print(f"Turn {session_state.turn_count} complete")

                except Exception as e:
                    print(f"Gemini error: {e}")
                    traceback.print_exc()
                    await safe_send_text(json.dumps({
                        "type": "error",
                        "data": "Connection lost - please reconnect",
                    }))

            receive_task = asyncio.create_task(receive_from_frontend())
            send_task = asyncio.create_task(send_to_frontend())
            await asyncio.gather(receive_task, send_task)
        finally:
            for task in list(background_tasks):
                task.cancel()
            if background_tasks:
                await asyncio.gather(*background_tasks, return_exceptions=True)
            if session_ctx:
                try:
                    await session_ctx.__aexit__(None, None, None)
                except Exception:
                    pass

    except Exception as e:
        print(f"Connection failed: {e}")
        traceback.print_exc()
    finally:
        if session_state.turn_count > 0:
            summary = session_state.get_session_summary()
            profile["session_count"] = profile.get("session_count", 0) + 1
            profile["learning_style"] = session_state.current_style
            profile["style_confidence"] = session_state.style_confidence
            profile["mastery"] = session_state.mastery_map
            profile["interests"] = list(dict.fromkeys((profile.get("interests", []) + session_state.interests)))[-16:]
            profile["session_summary"] = summary
            profile.setdefault("recent_summaries", []).append(summary)
            profile["recent_summaries"] = profile["recent_summaries"][-10:]
            if session_state.topic:
                profile.setdefault("lesson_history", []).append({
                    "topic": session_state.topic,
                    "ended_at": time.time(),
                    "mastery": summary.get("mastery", 0),
                    "learner_state": summary.get("learnerState"),
                })
            save_profile(profile)
            print(f"Profile saved (session {session_id}, learner {learner_id}, {session_state.turn_count} turns)")
            # Send session summary to frontend before closing
            try:
                await websocket.send_text(json.dumps({"type": "session_summary", "data": summary}))
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass


if HAS_STATIC:
    @app.get("/{path:path}")
    async def serve_spa(path: str):
        file_path = os.path.join(STATIC_DIR, path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
