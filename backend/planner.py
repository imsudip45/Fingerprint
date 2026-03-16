"""
Agent planning and reflection helpers.
"""
import asyncio
import json
from typing import Any

from google.genai import types

from config import std_client, PLANNER_MODEL
from json_utils import parse_model_json


PLAN_PROMPT = """You are the planning brain for Fingerprint, a live AI tutor for children.
Return ONLY a JSON object with this shape:
{
  "goal": "short sentence",
  "focus": "specific concept to teach next",
  "next_action": "ask_topic|explain|generate_illustration|search_and_display|generate_quiz|show_worked_example",
  "reason": "why this is the right next move",
  "confidence": 0,
  "requires_visual_grounding": false,
  "expected_outcome": "what should happen next",
  "fallback_if_failed": "backup move if this does not work",
  "learner_state": "discovering|engaged|progressing|confused|disengaged",
  "rescue": true,
  "parent_note": "short parent-safe summary",
  "coach_prompt": "brief instruction for the live tutor"
}

Rules:
- Think like a real teacher. Your primary job is to TEACH, not to spam tools.
- PACING IS CRITICAL:
  * For the first 2-3 turns after a topic is chosen, prefer "explain" to let the tutor build rapport and introduce the concept.
  * Only suggest a tool (quiz, illustration, search, worked_example) after the tutor has explained the concept for at least 2 turns.
  * Never suggest the same tool type twice in a row. Vary your choices.
  * Space out tool usage: after using a tool, prefer 2-3 "explain" turns before the next tool.
- TOOL SELECTION GUIDE (when the moment is right):
  * generate_quiz: Use ONLY after the tutor has taught enough for the learner to answer. Great for checking understanding after 3-4 turns of teaching.
  * generate_illustration: Use when a concept is visual (anatomy, space, geometry) and the learner would benefit from seeing it.
  * search_and_display: Use when the learner asks a factual question or when you want to show surprising real-world data.
  * show_worked_example: Use ONLY for math/science problems that need step-by-step solutions.
- Prefer rescue=true when the learner seems confused or disengaged.
- Focus on one clear next move, not a whole lesson.
- Use any uploaded visual context when it is relevant.
- The coach_prompt must tell the live tutor exactly how to teach next.
- Be age-appropriate, specific, and calm.
- Never suggest unsafe content or open-ended web exploration without educational framing."""

STYLE_DETECTION_PROMPT = """Infer the learner's teaching preference from recent evidence.
Return ONLY a JSON object with this shape:
{
  "style": "storyteller|analogist|visualizer|teacher|unknown",
  "confidence": 0,
  "reason": "brief explanation"
}

Rules:
- storyteller: asks for stories, imaginative framing, or narrative examples
- analogist: asks what something is like, comparisons, or real-world parallels
- visualizer: wants to see, draw, look at diagrams, or understand from images
- teacher: explains back, paraphrases, or wants to teach it back
- Use unknown if evidence is weak."""

REFLECTION_PROMPT = """You are the tutoring reflection brain for Fingerprint.
Return ONLY a JSON object with this shape:
{
  "summary": "short reflection",
  "learner_state": "discovering|engaged|progressing|confused|disengaged",
  "rescue": false,
  "next_hint": "brief note for the planner",
  "style_signal": "storyteller|analogist|visualizer|teacher|unknown",
  "style_confidence": 0,
  "style_reason": "short reason"
}

Rules:
- Be conservative.
- Prefer rescue=true if confusion is likely persisting.
- Use style_signal unknown when evidence is weak.
- Focus on what the tutor should do better next."""

TOPIC_DETECTION_PROMPT = """Decide what topic the learner wants to focus on based on their latest input.
Return ONLY a JSON object with this shape:
{"topic":"short topic string or empty string"}

Rules:
- Extract the core educational topic they are either asking about or agreeing to study.
- Keep the topic short and normalized, like "algebra", "fractions", or "black holes".
- If they are simply saying "yes", "okay", "let's do it", infer the topic from the preceding context if possible.
- Even if they are conversational (e.g., "Sounds good! Let's dive deeper into algebra..."), extract "algebra".
- Only return an empty string if they give an absolutely meaningless greeting or refuse to pick anything."""


EXCITED_EMOJI = "\U0001F929"
CONFUSED_EMOJI = "\U0001F914"
BORED_EMOJI = "\U0001F634"


async def _generate_structured_response(
    payload: dict,
    system_instruction: str,
    *,
    temperature: float,
    max_output_tokens: int,
    timeout: int,
):
    response = await asyncio.wait_for(
        asyncio.to_thread(
            std_client.models.generate_content,
            model=PLANNER_MODEL,
            contents=json.dumps(payload),
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                temperature=temperature,
                max_output_tokens=max_output_tokens,
            ),
        ),
        timeout=timeout,
    )
    raw = response.text.strip() if response.text else ""
    return parse_model_json(raw)


def build_returning_learner_hint(profile: dict) -> str:
    session_count = profile.get("session_count", 0)
    topics = profile.get("topics_covered", [])[-5:]
    mastery = profile.get("mastery", {}) or {}
    weakest = None
    if mastery:
        weakest = min(mastery.items(), key=lambda item: item[1])

    hints = []
    if session_count > 0:
        hints.append(f"This learner has completed {session_count} previous session(s).")
    if topics:
        hints.append(f"Recent topics: {', '.join(dict.fromkeys(topics))}.")
    if profile.get("learning_style") and profile.get("style_confidence", 0) > 0:
        hints.append(
            f"Their strongest known learning style is {profile['learning_style']} ({profile['style_confidence']}% confidence)."
        )
    if weakest:
        hints.append(f"They may need reinforcement on {weakest[0]} ({weakest[1]}% mastery).")
    interests = profile.get("interests", [])[-4:]
    if interests:
        hints.append(f"Known interests: {', '.join(interests)}.")
    return " ".join(hints)


def _fallback_plan(session_state, profile: dict, trigger: str, detail: str = "") -> dict[str, Any]:
    weakest = session_state.weakest_mastery()
    visual_context = session_state.latest_visual_context or {}
    focus = (
        str(visual_context.get("reasoning_focus") or "").strip()
        or str(visual_context.get("extracted_problem") or "").strip()
        or (weakest[0] if weakest else "")
        or session_state.last_quiz_subtopic
        or session_state.topic
        or detail
        or "a fun starter concept"
    )

    learner_state = session_state.learner_state or "discovering"
    rescue = False
    next_action = "explain"
    reason = "Continue the lesson clearly and keep momentum."

    if not session_state.topic:
        visual_topic = str(visual_context.get("detected_topic") or "").strip()
        if visual_topic:
            return {
                "goal": f"Help the learner make progress in {visual_topic}.",
                "focus": str(visual_context.get("reasoning_focus") or visual_topic)[:120],
                "next_action": "show_worked_example" if any(k in visual_topic.lower() for k in ["math", "equation", "fraction", "algebra", "geometry"]) else "generate_illustration",
                "reason": "A learner-uploaded visual likely reveals what they need help with.",
                "confidence": 86,
                "requires_visual_grounding": True,
                "expected_outcome": "The tutor uses the uploaded image to ground the explanation.",
                "fallback_if_failed": "Ask the learner which part of the uploaded image they want help with.",
                "learner_state": "progressing",
                "rescue": False,
                "parent_note": f"The learner uploaded a visual related to {visual_topic}.",
                "coach_prompt": str(visual_context.get("coach_prompt") or f"Help the learner with {visual_topic} based on what they uploaded.")[:320],
            }
        return {
            "goal": "Help the learner choose a topic and feel comfortable.",
            "focus": "topic discovery",
            "next_action": "ask_topic",
            "reason": "No teaching topic is active yet.",
            "confidence": 82,
            "requires_visual_grounding": False,
            "expected_outcome": "The learner names a topic or responds to a suggestion.",
            "fallback_if_failed": "Offer fewer, simpler topic choices and ask again.",
            "learner_state": "discovering",
            "rescue": False,
            "parent_note": "The learner is still exploring what they want to learn.",
            "coach_prompt": "Wait for the learner to pick a topic. Do not repeat the greeting.",
        }

    if detail == CONFUSED_EMOJI or learner_state == "confused":
        rescue = True
        learner_state = "confused"
        next_action = "show_worked_example" if any(k in (focus or "").lower() for k in ["math", "equation", "fraction", "algebra", "geometry"]) else "generate_illustration"
        reason = "The learner seems confused and needs a simpler, more concrete explanation."
    elif detail == BORED_EMOJI or learner_state == "disengaged":
        rescue = True
        learner_state = "disengaged"
        next_action = "generate_quiz"
        reason = "The learner is losing interest and needs an interactive reset."
    elif detail == EXCITED_EMOJI or learner_state == "engaged":
        learner_state = "engaged"
        next_action = "search_and_display"
        reason = "The learner is excited, so deepen the lesson with a surprising fact or real-world example."
    elif session_state.quiz_history and not session_state.quiz_history[-1]["correct"]:
        learner_state = "confused"
        rescue = True
        next_action = "show_worked_example"
        reason = "The learner answered incorrectly and would benefit from a guided step-by-step explanation."
    elif trigger == "visual_input" and visual_context:
        learner_state = "progressing"
        next_action = (
            "show_worked_example"
            if any(k in focus.lower() for k in ["equation", "fraction", "algebra", "geometry", "solve", "math"])
            else "generate_illustration"
        )
        reason = "The learner uploaded a visual artifact, so the next step should be grounded in what they showed."
    elif session_state.turn_count <= 3:
        learner_state = "progressing"
        next_action = "explain"
        reason = "Early teaching turns: let the tutor explain and build rapport before using interactive tools."
    elif session_state.turn_count <= 5 and session_state.last_backend_action != "generate_illustration":
        learner_state = "progressing"
        next_action = "generate_illustration"
        reason = "The tutor has explained for a few turns. A visual illustration will reinforce understanding."
    elif session_state.turn_count > 5 and session_state.last_backend_action != "generate_quiz":
        learner_state = "progressing"
        next_action = "generate_quiz"
        reason = "After several turns of teaching, a quiz checks whether the learner absorbed the material."
    else:
        learner_state = "progressing"
        next_action = "explain"
        reason = "Continue teaching to keep the conversation flowing naturally."

    return {
        "goal": f"Help the learner make progress in {session_state.topic}.",
        "focus": focus,
        "next_action": next_action,
        "reason": reason,
        "confidence": 74,
        "requires_visual_grounding": bool(visual_context),
        "expected_outcome": f"The learner makes progress on {focus}.",
        "fallback_if_failed": "Slow down, ask a clarifying question, and switch to a more concrete explanation.",
        "learner_state": learner_state,
        "rescue": rescue,
        "parent_note": f"Current focus is {focus}. The learner appears {learner_state}.",
        "coach_prompt": f"Teach the learner about {focus}. Keep it short and age-appropriate.",
    }


async def plan_next_step(session_state, profile: dict, trigger: str, detail: str = "") -> dict[str, Any]:
    fallback = _fallback_plan(session_state, profile, trigger, detail)

    summary = {
        "trigger": trigger,
        "detail": detail,
        "topic": session_state.topic,
        "subtopics": session_state.subtopics_covered[-6:],
        "quiz_history": session_state.quiz_history[-4:],
        "difficulty": session_state.difficulty,
        "learning_style": session_state.current_style,
        "style_confidence": session_state.style_confidence,
        "learner_state": session_state.learner_state,
        "interests": session_state.interests[-6:],
        "mastery_map": session_state.mastery_map,
        "last_reaction": session_state.last_reaction,
        "latest_visual_context": session_state.latest_visual_context,
        "session_turns": session_state.turn_count,
        "profile_topics": profile.get("topics_covered", [])[-8:],
        "profile_mastery": profile.get("mastery", {}),
        "profile_session_count": profile.get("session_count", 0),
        "recent_backend_actions": session_state.recent_backend_actions[-4:] if hasattr(session_state, 'recent_backend_actions') else [],
        "last_backend_action": session_state.last_backend_action,
        "turns_since_last_action": session_state.turn_count - session_state.last_backend_action_turn if session_state.last_backend_action_turn >= 0 else session_state.turn_count,
    }

    try:
        plan = await _generate_structured_response(
            summary,
            PLAN_PROMPT,
            temperature=0.3,
            max_output_tokens=512,
            timeout=8,
        )
        if not isinstance(plan, dict):
            return fallback
    except Exception:
        return fallback

    next_action = plan.get("next_action") or fallback["next_action"]
    if next_action not in {
        "ask_topic",
        "explain",
        "generate_illustration",
        "search_and_display",
        "generate_quiz",
        "show_worked_example",
    }:
        next_action = fallback["next_action"]

    # If we're clearly in a math context, bias towards a worked example after
    # a few explanatory turns so the learner gets a visual, step-by-step board
    # instead of only listening.
    focus_text = str(plan.get("focus") or fallback["focus"] or "").lower()
    topic_text = str(session_state.topic or "").lower()
    math_keywords = ("math", "fraction", "algebra", "geometry", "equation", "divide", "multiply", "add", "subtract")
    in_math_context = any(k in focus_text or k in topic_text for k in math_keywords)
    if (
        in_math_context
        and session_state.turn_count >= 3
        and next_action == "explain"
    ):
        next_action = "show_worked_example"
        plan["reason"] = (
            "Overriding LLM: math topic detected. Showing a worked example so the child can see each step."
        )

    # HARD GUARD 1: Prevent tools right at the start of a topic (unless asking topic or looking at an uploaded image)
    if session_state.turn_count < 3 and next_action not in ["explain", "ask_topic"] and not session_state.latest_visual_context:
        next_action = "explain"
        plan["reason"] = "Overriding LLM: Topic just started. Enforcing 'explain' for rapport."

    # HARD GUARD 2: Prevent rapid-fire back-to-back tools (must explain for at least 2 turns between tools)
    turns_since = session_state.turn_count - session_state.last_backend_action_turn if session_state.last_backend_action_turn >= 0 else 999
    if turns_since < 2 and next_action not in ["explain", "ask_topic"]:
        next_action = "explain"
        plan["reason"] = f"Overriding LLM: Only {turns_since} turn(s) since last tool. Enforcing 'explain' to pace the lesson."

    learner_state = plan.get("learner_state") or fallback["learner_state"]
    if learner_state not in {"discovering", "engaged", "progressing", "confused", "disengaged"}:
        learner_state = fallback["learner_state"]

    return {
        "goal": str(plan.get("goal") or fallback["goal"])[:160],
        "focus": str(plan.get("focus") or fallback["focus"])[:120],
        "next_action": next_action,
        "reason": str(plan.get("reason") or fallback["reason"])[:220],
        "confidence": max(0, min(100, int(plan.get("confidence", fallback.get("confidence", 70))))),
        "requires_visual_grounding": bool(plan.get("requires_visual_grounding", fallback.get("requires_visual_grounding", False))),
        "expected_outcome": str(plan.get("expected_outcome") or fallback.get("expected_outcome", ""))[:180],
        "fallback_if_failed": str(plan.get("fallback_if_failed") or fallback.get("fallback_if_failed", ""))[:180],
        "learner_state": learner_state,
        "rescue": bool(plan.get("rescue", fallback["rescue"])),
        "parent_note": str(plan.get("parent_note") or fallback["parent_note"])[:220],
        "coach_prompt": str(plan.get("coach_prompt") or fallback["coach_prompt"])[:320],
    }


async def detect_topic_choice(session_state, profile: dict, user_text: str) -> str | None:
    """Detect when the learner explicitly picks a topic to study."""
    cleaned = (user_text or "").strip()
    if not cleaned or len(cleaned) < 2:
        return None

    payload = {
        "user_text": cleaned,
        "known_interests": profile.get("interests", [])[-6:],
        "recent_topics": profile.get("topics_covered", [])[-6:],
        "session_turns": session_state.turn_count,
    }

    try:
        parsed = await _generate_structured_response(
            payload,
            TOPIC_DETECTION_PROMPT,
            temperature=0.1,
            max_output_tokens=120,
            timeout=5,
        )
        topic = str(parsed.get("topic", "")).strip()
        return topic[:80] if topic else None
    except Exception:
        return None


async def detect_learning_style_signal(session_state, profile: dict) -> dict | None:
    evidence = {
        "recent_learner_messages": session_state.recent_learner_messages[-6:],
        "latest_visual_context": session_state.latest_visual_context,
        "last_reaction": session_state.last_reaction,
        "current_style": session_state.current_style,
        "style_confidence": session_state.style_confidence,
        "known_interests": profile.get("interests", [])[-6:],
    }
    if not evidence["recent_learner_messages"] and not evidence["latest_visual_context"] and not evidence["last_reaction"]:
        return None

    try:
        parsed = await _generate_structured_response(
            evidence,
            STYLE_DETECTION_PROMPT,
            temperature=0.1,
            max_output_tokens=200,
            timeout=5,
        )
        style = str(parsed.get("style") or "unknown").strip()
        confidence = max(0, min(100, int(parsed.get("confidence", 0))))
        reason = str(parsed.get("reason") or "").strip()
        if style not in {"storyteller", "analogist", "visualizer", "teacher"} or confidence < 35:
            return None
        if style == session_state.current_style and confidence <= session_state.style_confidence:
            return None
        return {"style": style, "confidence": confidence, "reason": reason[:180]}
    except Exception:
        return None


async def reflect_on_state(session_state, profile: dict, trigger: str, detail: str = "") -> dict | None:
    payload = {
        "trigger": trigger,
        "detail": detail,
        "topic": session_state.topic,
        "learner_state": session_state.learner_state,
        "recent_learner_messages": session_state.recent_learner_messages[-5:],
        "latest_visual_context": session_state.latest_visual_context,
        "quiz_history": session_state.quiz_history[-3:],
        "current_plan": session_state.current_plan,
        "last_backend_action": session_state.last_backend_action,
        "mastery_map": session_state.mastery_map,
        "last_reaction": session_state.last_reaction,
        "profile_style": {
            "style": profile.get("learning_style"),
            "confidence": profile.get("style_confidence", 0),
        },
    }

    try:
        parsed = await _generate_structured_response(
            payload,
            REFLECTION_PROMPT,
            temperature=0.2,
            max_output_tokens=240,
            timeout=5,
        )
        if not isinstance(parsed, dict):
            return None
        learner_state = str(parsed.get("learner_state") or session_state.learner_state)
        if learner_state not in {"discovering", "engaged", "progressing", "confused", "disengaged"}:
            learner_state = session_state.learner_state
        style_signal = str(parsed.get("style_signal") or "unknown")
        style_confidence = max(0, min(100, int(parsed.get("style_confidence", 0))))
        if style_signal not in {"storyteller", "analogist", "visualizer", "teacher"}:
            style_signal = "unknown"
            style_confidence = 0
        return {
            "summary": str(parsed.get("summary") or "")[:180],
            "learner_state": learner_state,
            "rescue": bool(parsed.get("rescue", False)),
            "next_hint": str(parsed.get("next_hint") or "")[:180],
            "style_signal": style_signal,
            "style_confidence": style_confidence,
            "style_reason": str(parsed.get("style_reason") or "")[:180],
        }
    except Exception:
        return None
