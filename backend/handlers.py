"""
Backend action handler for planner-driven tools and optional Live tool calls.
"""
import asyncio
import json
from typing import Callable, Awaitable

from generators import (
    generate_image,
    generate_lesson_plan,
    generate_quiz,
    generate_subtopics,
    generate_worked_example,
    search_web,
)
from profile import save_profile, format_public_profile
from session_state import SessionState


async def _maybe_advance_lesson(session_state: SessionState, send_text):
    """Advance the lesson plan to the next step if one exists."""
    plan = session_state.lesson_plan
    if not plan:
        return
    idx = session_state.lesson_step_index
    if idx < len(plan):
        plan[idx]["status"] = "done"
    if idx + 1 < len(plan):
        session_state.lesson_step_index = idx + 1
        plan[idx + 1]["status"] = "active"
    else:
        session_state.lesson_step_index = len(plan)
    await send_text(json.dumps({"type": "lesson_plan", "data": plan}))


async def execute_action(
    name: str,
    args: dict,
    session_state: SessionState,
    profile: dict,
    send_text: Callable[[str], Awaitable[None]],
) -> dict:
    """Execute a backend action, update session state, return result dict."""
    print(f"[Tool] {name}({json.dumps(args)[:120]})")

    if name == "set_current_topic":
        topic = args.get("topic", "")
        if topic:
            session_state.set_topic(topic)
            session_state.add_interest(topic)
            await send_text(json.dumps({"type": "topic", "data": topic}))
            await send_text(json.dumps({
                "type": "detection",
                "data": f"Topic chosen: {topic}",
            }))
            await send_text(json.dumps({
                "type": "progress", "data": session_state.get_progress(),
            }))
            profile.setdefault("topics_covered", []).append(topic)
            profile["topics_covered"] = list(dict.fromkeys(profile["topics_covered"]))[-24:]
            profile.setdefault("interests", []).append(topic)
            profile["interests"] = list(dict.fromkeys(profile["interests"]))[-16:]
            save_profile(profile)
            await send_text(json.dumps({"type": "profile_update", "data": format_public_profile(profile)}))
            print(f"[Topic] {topic}")

            async def _generate_extras():
                try:
                    subtopics_task = asyncio.create_task(generate_subtopics(topic))
                    lesson_task = asyncio.create_task(generate_lesson_plan(topic))
                    subtopics = await subtopics_task
                    lesson = await lesson_task
                    if subtopics:
                        await send_text(json.dumps({"type": "subtopics", "data": subtopics}))
                        print(f"[Subtopics] {len(subtopics)} suggestions sent")
                    if lesson:
                        session_state.lesson_plan = lesson
                        lesson[0]["status"] = "active"
                        await send_text(json.dumps({"type": "lesson_plan", "data": lesson}))
                        print(f"[Lesson] {len(lesson)}-step plan sent")
                except Exception as e:
                    print(f"[Tool] _generate_extras failed: {e}")

            asyncio.create_task(_generate_extras())

        return {"result": "topic_set"}

    if name == "generate_illustration":
        await send_text(json.dumps({"type": "visual_loading", "data": True}))
        await send_text(json.dumps({"type": "agent_action", "data": "generate_image"}))

        topic = args.get("topic", "science concept")
        style_hint = args.get("style_hint", "diagram")
        try:
            if session_state.cached_visual and session_state.cached_visual.get("topic") == topic:
                result = session_state.cached_visual["result"]
                print(f"[Tool] Using cached image for {topic}")
                session_state.cached_visual = None
            else:
                result = await generate_image(topic, style_hint)

            if result:
                await send_text(json.dumps({
                    "type": "visual",
                    "data": {
                        "kind": "image",
                        "content": result["data"],
                        "mime_type": result["mime_type"],
                        "prompt": topic[:100],
                    },
                }))
                await send_text(json.dumps({
                    "type": "detection",
                    "data": f"Illustration: {topic[:60]}",
                }))
                session_state.add_subtopic(topic[:80])
                profile.setdefault("topics_covered", []).append(topic[:100])
                profile["topics_covered"] = list(dict.fromkeys(profile["topics_covered"]))[-24:]
                save_profile(profile)
                await send_text(json.dumps({"type": "profile_update", "data": format_public_profile(profile)}))
                print("[Tool] Image sent")
        except Exception as e:
            print(f"[Tool] Image generation failed: {e}")
            result = None
        finally:
            await send_text(json.dumps({"type": "visual_loading", "data": False}))
            await send_text(json.dumps({"type": "agent_action", "data": None}))

        await _maybe_advance_lesson(session_state, send_text)

        if result:
            return {
                "status": "success",
                "your_task": f"IMPORTANT: An illustration of '{topic[:60]}' is now visible on the child's screen. You MUST describe what they can see and connect it to what you were teaching. Be enthusiastic!"
            }
        return {"status": "failed", "your_task": "Image generation failed. Describe the concept verbally instead."}

    if name == "generate_quiz":
        await send_text(json.dumps({"type": "agent_action", "data": "generate_quiz"}))

        topic = args.get("topic", session_state.topic or "science")
        difficulty = session_state.difficulty
        asked = session_state.get_asked_questions()
        try:
            if session_state.cached_quiz and session_state.cached_quiz.get("topic") == topic:
                quiz = session_state.cached_quiz["quiz"]
                print(f"[Tool] Using cached quiz for {topic}")
                session_state.cached_quiz = None
            else:
                quiz = await generate_quiz(topic, difficulty, quiz_history=asked)
        except Exception as e:
            await send_text(json.dumps({"type": "agent_action", "data": None}))
            return {"status": "error", "reason": f"Quiz generation failed: {str(e)[:50]}"}

        if quiz:
            session_state.last_quiz_question = quiz["question"]
            session_state.last_quiz_subtopic = topic
            session_state.add_subtopic(topic)
            await send_text(json.dumps({"type": "quiz", "data": quiz}))
            await send_text(json.dumps({
                "type": "detection",
                "data": f"Quiz ({difficulty}): {quiz['question'][:50]}",
            }))
            print(f"[Tool] Quiz ({difficulty}): {quiz['question'][:50]}")

        await send_text(json.dumps({"type": "agent_action", "data": None}))
        await _maybe_advance_lesson(session_state, send_text)

        if quiz:
            return {
                "status": "success",
                "question": quiz["question"],
                "your_task": "IMPORTANT: A quiz question is now on the child's screen. You MUST read the question aloud and encourage them to pick an answer. Do NOT reveal the correct answer."
            }
        return {"status": "error", "reason": "Quiz generation failed."}

    if name == "update_learning_style":
        style = args.get("style")
        confidence = args.get("confidence", 0)
        reason = args.get("reason", "")

        if style in ("storyteller", "analogist", "visualizer", "teacher") and confidence >= 10:
            session_state.update_style(style, confidence, reason)
            await send_text(json.dumps({"type": "style", "data": style}))
            await send_text(json.dumps({
                "type": "detection",
                "data": f"Fingerprint: {style} style - {reason}",
            }))
            await send_text(json.dumps({
                "type": "progress", "data": session_state.get_progress(),
            }))
            profile["learning_style"] = style
            profile["style_confidence"] = confidence
            profile.setdefault("observations", []).append({
                "style": style,
                "confidence": confidence,
                "reason": reason,
                "turn": session_state.turn_count,
            })
            profile["observations"] = profile["observations"][-40:]
            save_profile(profile)
            await send_text(json.dumps({"type": "profile_update", "data": format_public_profile(profile)}))
            print(f"[Style] -> {style} ({confidence}%): {reason}")

        return {"result": "ok"}

    if name == "search_and_display":
        query = args.get("query", "")
        display_title = args.get("display_title", "Did you know?")

        await send_text(json.dumps({"type": "agent_action", "data": "searching"}))

        try:
            facts_text, sources = await search_web(query)
        except Exception as e:
            await send_text(json.dumps({"type": "agent_action", "data": None}))
            return {"status": "error", "reason": f"Web search failed: {str(e)[:50]}"}

        await send_text(json.dumps({
            "type": "search_result",
            "data": {
                "title": display_title,
                "query": query,
                "facts": facts_text,
                "sources": sources,
            },
        }))
        await send_text(json.dumps({
            "type": "detection",
            "data": f"Web search: {query[:60]}",
        }))
        print(f"[Tool] Search: {query[:60]} -> {len(sources)} sources")

        await send_text(json.dumps({"type": "agent_action", "data": None}))
        await _maybe_advance_lesson(session_state, send_text)

        facts_short = facts_text[:600]
        last_period = facts_short.rfind('.')
        if last_period > 100:
            facts_short = facts_short[:last_period + 1]

        return {
            "status": "success",
            "content_shown_to_child": facts_short,
            "your_task": "IMPORTANT: You MUST now verbally tell the child about these search results. Pick the most interesting or surprising fact and explain it in simple, exciting words. Then ask them what they think or if they want to know more. Do NOT skip over the results or change the subject."
        }

    if name == "show_worked_example":
        await send_text(json.dumps({"type": "agent_action", "data": "solving"}))

        problem = args.get("problem", "")
        topic = args.get("topic", session_state.topic or "")
        try:
            example = await generate_worked_example(problem, topic)
        except Exception as e:
            await send_text(json.dumps({"type": "agent_action", "data": None}))
            return {"status": "error", "reason": f"Failed to generate example: {str(e)[:50]}"}

        if example:
            await send_text(json.dumps({
                "type": "worked_example",
                "data": example,
            }))
            await send_text(json.dumps({
                "type": "detection",
                "data": f"Worked example: {example.get('title', problem)[:50]}",
            }))
            session_state.add_subtopic(problem[:80])
            print(f"[Tool] Worked example: {example.get('title', '')[:50]}")

        await send_text(json.dumps({"type": "agent_action", "data": None}))
        await _maybe_advance_lesson(session_state, send_text)

        if example:
            steps_summary = " -> ".join(example.get("steps", [])[:3])
            return {
                "status": "success",
                "steps_shown": steps_summary[:300],
                "answer": example.get('answer', '')[:100],
                "your_task": "IMPORTANT: You MUST now walk the child through these steps verbally. Explain each step simply, then encourage them to try the practice problem."
            }
        return {"status": "error", "reason": "Failed to generate worked example."}

    return {"result": "unknown_function"}
