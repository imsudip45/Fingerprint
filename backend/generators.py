"""
Content generators — image, quiz, and web search.
"""
import asyncio
import base64
import json
import re
from google.genai import types

from config import std_client, IMAGE_MODELS, QUIZ_MODELS, SEARCH_MODEL, VISION_MODEL
from json_utils import parse_model_json
from prompts import QUIZ_GEN_PROMPT, IMAGE_STYLE_HINTS, WORKED_EXAMPLE_PROMPT


async def generate_image(topic: str, style_hint: str = "diagram") -> dict | None:
    """Generate an educational illustration via model fallback chain."""
    hint = IMAGE_STYLE_HINTS.get(style_hint, IMAGE_STYLE_HINTS["diagram"])

    prompt = f"""Create a beautiful, colorful, kid-friendly educational illustration.

Style: {hint}

Concept: {topic[:400]}

Requirements: No text/words in the image. Cartoon style, bright vibrant colors, simple and clear.
Should help a child understand the concept just by looking at it."""

    for model_name in IMAGE_MODELS:
        try:
            # We now use the standard Image generation API for Google models
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    std_client.models.generate_images,
                    model=model_name,
                    prompt=prompt,
                    config=types.GenerateImagesConfig(
                        number_of_images=1,
                        output_mime_type="image/jpeg",
                        aspect_ratio="16:9",
                    ),
                ),
                timeout=60,
            )

            if response.generated_images:
                raw_image = response.generated_images[0].image.image_bytes
                img_b64 = base64.b64encode(raw_image).decode("utf-8")
                print(f"    Image via {model_name}")
                return {
                    "data": img_b64,
                    "mime_type": "image/jpeg",
                }

            print(f"    No image from {model_name}")
        except asyncio.TimeoutError:
            print(f"    {model_name} timeout")
        except Exception as e:
            print(f"    {model_name} error: {str(e)[:120]}")

    return None


async def generate_quiz(
    topic: str,
    difficulty: str = "easy",
    quiz_history: list[str] | None = None,
) -> dict | None:
    """Generate a unique quiz question, avoiding previously asked questions."""
    history_note = ""
    if quiz_history:
        recent = quiz_history[-6:]
        history_note = (
            "\n\nALREADY ASKED (generate a COMPLETELY DIFFERENT question):\n"
            + "\n".join(f"- {q}" for q in recent)
        )

    prompt = (
        f"Generate a fun {difficulty} quiz for a child about: {topic[:400]}"
        f"{history_note}"
    )

    for qmodel, use_json_mode in QUIZ_MODELS:
        try:
            cfg = types.GenerateContentConfig(
                system_instruction=QUIZ_GEN_PROMPT,
                temperature=0.9,
                max_output_tokens=1024,
            )
            if use_json_mode:
                cfg.response_mime_type = "application/json"

            response = await asyncio.wait_for(
                asyncio.to_thread(
                    std_client.models.generate_content,
                    model=qmodel,
                    contents=prompt,
                    config=cfg,
                ),
                timeout=15,
            )

            raw = response.text.strip() if response.text else ""
            if not raw:
                print(f"    Quiz empty from {qmodel} (json_mode={use_json_mode})")
                continue
            # Strip markdown code fences if present
            quiz = parse_model_json(raw)
            if all(k in quiz for k in ["question", "options", "correctAnswer"]):
                quiz.setdefault("hint", "")
                quiz.setdefault("type", "multiple_choice")
                if quiz["correctAnswer"] not in quiz["options"]:
                    quiz["correctAnswer"] = quiz["options"][0]
                print(f"    Quiz OK from {qmodel} (json_mode={use_json_mode})")
                return quiz
        except Exception as e:
            print(f"    Quiz error ({qmodel}, json_mode={use_json_mode}): {str(e)[:120]}")

    return None


async def search_web(query: str) -> tuple[str, list[dict]]:
    """Search the web and return (facts_text, sources_list)."""
    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                std_client.models.generate_content,
                model=SEARCH_MODEL,
                contents=(
                    f"Provide 2-3 short, fascinating, kid-friendly facts about: {query[:300]}. "
                    "Each fact should be one sentence. Use simple language a 7-year-old can understand. "
                    "Keep it educational and age-appropriate. Avoid scary, sexual, violent, or otherwise unsafe details for children."
                ),
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    temperature=0.5,
                    max_output_tokens=400,
                ),
            ),
            timeout=15,
        )

        facts_text = response.text or ""
        # Strip citation markers like [cite: 1, 2, 3] or [1, 2] from Vertex AI grounded responses
        facts_text = re.sub(r'\[cite:\s*[\d,\s]+\]', '', facts_text)
        facts_text = re.sub(r'\[\d+(?:,\s*\d+)*\]', '', facts_text)
        facts_text = facts_text.strip()
        sources: list[dict] = []

        # Extract grounding sources
        try:
            if response.candidates:
                cand = response.candidates[0]
                gm = getattr(cand, "grounding_metadata", None)
                if gm:
                    chunks = getattr(gm, "grounding_chunks", None) or []
                    for chunk in chunks[:5]:
                        web = getattr(chunk, "web", None)
                        if web:
                            sources.append({
                                "title": getattr(web, "title", "") or "",
                                "url": getattr(web, "uri", "") or "",
                            })
                    if not sources:
                        support = getattr(gm, "grounding_supports", None) or []
                        for s in support[:5]:
                            seg = getattr(s, "segment", None)
                            if seg:
                                sources.append({
                                    "title": getattr(seg, "text", "")[:80] or "Source",
                                    "url": "",
                                })
        except Exception as gm_err:
            print(f"    Grounding metadata parse: {gm_err}")

        return facts_text, sources

    except Exception as e:
        print(f"    Search error: {e}")
        return "", []


async def generate_worked_example(problem: str, topic: str = "") -> dict | None:
    """Generate a step-by-step worked example for math/STEM problems."""
    prompt = f"Create a step-by-step solution for this problem: {problem[:400]}"
    if topic:
        prompt += f"\nSubject area: {topic}"

    for qmodel, use_json_mode in QUIZ_MODELS:
        try:
            cfg = types.GenerateContentConfig(
                system_instruction=WORKED_EXAMPLE_PROMPT,
                temperature=0.3,
                max_output_tokens=1024,
            )
            if use_json_mode:
                cfg.response_mime_type = "application/json"

            response = await asyncio.wait_for(
                asyncio.to_thread(
                    std_client.models.generate_content,
                    model=qmodel,
                    contents=prompt,
                    config=cfg,
                ),
                timeout=15,
            )

            raw = response.text.strip() if response.text else ""
            if not raw:
                continue
            example = parse_model_json(raw)
            if "steps" in example and isinstance(example["steps"], list):
                example.setdefault("title", problem[:60])
                example.setdefault("answer", "")
                example.setdefault("practice", "")
                print(f"    Worked example OK from {qmodel}")
                return example
        except Exception as e:
            print(f"    Worked example error ({qmodel}): {str(e)[:120]}")

    return None


async def generate_subtopics(topic: str) -> list[str]:
    """Generate 4-6 suggested subtopics for a given topic."""
    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                std_client.models.generate_content,
                model=QUIZ_MODELS[0][0],
                contents=f"List 5 fun subtopics a kid (age 8-12) would enjoy learning about within: {topic[:200]}",
                config=types.GenerateContentConfig(
                    system_instruction="Return ONLY a JSON array of short strings, e.g. [\"subtopic1\",\"subtopic2\"]. No explanation. Each under 40 chars.",
                    response_mime_type="application/json",
                    temperature=0.8,
                    max_output_tokens=256,
                ),
            ),
            timeout=10,
        )
        raw = response.text.strip() if response.text else "[]"
        items = parse_model_json(raw)
        if isinstance(items, list):
            return [str(s)[:50] for s in items[:6]]
    except Exception as e:
        print(f"    Subtopics error: {str(e)[:120]}")
    return []


async def generate_lesson_plan(topic: str) -> list[dict] | None:
    """Generate a 4-step lesson plan for a topic."""
    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                std_client.models.generate_content,
                model=QUIZ_MODELS[0][0],
                contents=f"Create a 4-step lesson plan for teaching a child (age 8-12) about: {topic[:200]}",
                config=types.GenerateContentConfig(
                    system_instruction='Return ONLY a JSON array of objects: [{"title":"step title","description":"1-sentence description"}]. 4 steps. Keep each title under 30 chars, description under 60 chars.',
                    response_mime_type="application/json",
                    temperature=0.6,
                    max_output_tokens=512,
                ),
            ),
            timeout=10,
        )
        raw = response.text.strip() if response.text else ""
        steps = parse_model_json(raw)
        if isinstance(steps, list) and len(steps) >= 2:
            return [
                {"title": s.get("title", f"Step {i+1}")[:40], "description": s.get("description", "")[:80], "status": "upcoming"}
                for i, s in enumerate(steps[:6])
            ]
    except Exception as e:
        print(f"    Lesson plan error: {str(e)[:120]}")
    return None


async def analyze_visual_artifact(image_b64: str, mime_type: str, label: str = "") -> dict | None:
    """Analyze a learner-uploaded visual artifact such as homework or a worksheet."""
    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception:
        return None

    prompt = """You are analyzing a learner-uploaded educational image for an AI tutor.
Return ONLY a JSON object with this shape:
{
  "label": "short label",
  "artifact_type": "worksheet|handwritten_problem|diagram|drawing|textbook_page|other",
  "summary": "1-2 sentence plain summary",
  "detected_topic": "short topic or empty string",
  "reasoning_focus": "the exact concept or problem to teach next",
  "extracted_problem": "specific question or problem if visible",
  "needs_clarification": false,
  "suggested_next_step": "explain|show_worked_example|generate_illustration|generate_quiz|search_and_display",
  "coach_prompt": "brief instruction for the live tutor"
}

Rules:
- Focus on what is clearly visible.
- Be conservative if the image is ambiguous.
- Prefer math or science specificity when possible.
- Keep the summary child-safe and educational.
- If the problem statement is unclear, set needs_clarification to true and ask for clarification in coach_prompt."""

    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                std_client.models.generate_content,
                model=VISION_MODEL,
                contents=types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(text=prompt),
                        types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    ],
                ),
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                    max_output_tokens=800,
                ),
            ),
            timeout=20,
        )
        raw = response.text.strip() if response.text else ""
        if not raw:
            return None
        parsed = parse_model_json(raw)
        if not isinstance(parsed, dict):
            return None

        return {
            "label": str(parsed.get("label") or label or "Learner upload")[:80],
            "artifact_type": str(parsed.get("artifact_type") or "other")[:40],
            "summary": str(parsed.get("summary") or "The learner uploaded something to discuss.")[:280],
            "detected_topic": str(parsed.get("detected_topic") or "")[:80],
            "reasoning_focus": str(parsed.get("reasoning_focus") or parsed.get("detected_topic") or label or "")[:140],
            "extracted_problem": str(parsed.get("extracted_problem") or "")[:240],
            "needs_clarification": bool(parsed.get("needs_clarification", False)),
            "suggested_next_step": str(parsed.get("suggested_next_step") or "explain")[:40],
            "coach_prompt": str(parsed.get("coach_prompt") or "Briefly describe what the learner showed you and help them with it.")[:400],
        }
    except Exception as e:
        print(f"    Visual analysis error: {str(e)[:120]}")
        return None
