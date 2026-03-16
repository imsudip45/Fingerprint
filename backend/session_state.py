"""
Session state - tracks topic, subtopics, quiz history, learning style, and adaptive difficulty.
Central brain that gives the agent memory across turns.
"""
from dataclasses import dataclass, field
import time


@dataclass
class SessionState:
    session_id: str
    learner_id: str
    topic: str | None = None
    subtopics_covered: list[str] = field(default_factory=list)
    quiz_history: list[dict] = field(default_factory=list)
    style_signals: list[dict] = field(default_factory=list)
    current_style: str = "storyteller"
    style_confidence: int = 0
    turn_count: int = 0
    difficulty: str = "easy"
    consecutive_correct: int = 0
    consecutive_wrong: int = 0
    phase: str = "greeting"
    last_quiz_question: str = ""
    last_quiz_subtopic: str = ""
    started_at: float = field(default_factory=time.time)
    interests: list[str] = field(default_factory=list)
    lesson_plan: list[dict] | None = None
    lesson_step_index: int = 0
    mastery_map: dict[str, int] = field(default_factory=dict)
    current_plan: dict | None = None
    learner_state: str = "discovering"
    last_reaction: str | None = None
    rescue_mode: bool = False
    last_backend_action: str | None = None
    last_backend_action_turn: int = -1
    latest_visual_context: dict | None = None
    visual_history: list[dict] = field(default_factory=list)
    recent_learner_messages: list[str] = field(default_factory=list)
    last_reflection: dict | None = None
    recent_backend_actions: list[str] = field(default_factory=list)
    cached_visual: dict | None = None
    cached_quiz: dict | None = None

    def set_topic(self, topic: str):
        self.topic = topic
        self.phase = "teaching"
        self.lesson_plan = None
        self.lesson_step_index = 0
        self.current_plan = None

    def add_interest(self, interest: str):
        if clean := interest.strip():
            if not any(clean.lower() == i.casefold() for i in self.interests):
                self.interests.append(clean)

    def add_subtopic(self, subtopic: str):
        if clean := subtopic.strip():
            if not any(clean.lower() == s.casefold() for s in self.subtopics_covered):
                self.subtopics_covered.append(clean)

    def record_quiz(self, question: str, answer: str, correct: bool, subtopic: str = ""):
        self.quiz_history.append({
            "question": question,
            "answer": answer,
            "correct": correct,
            "subtopic": subtopic or self.last_quiz_subtopic or self.topic or "",
            "turn": self.turn_count,
        })
        if correct:
            self.consecutive_correct += 1
            self.consecutive_wrong = 0
        else:
            self.consecutive_wrong += 1
            self.consecutive_correct = 0
        self._adapt_difficulty()

    def _adapt_difficulty(self):
        if self.consecutive_correct >= 3 and self.difficulty != "hard":
            self.difficulty = "hard" if self.difficulty == "medium" else "medium"
            self.consecutive_correct = 0
        elif self.consecutive_wrong >= 2 and self.difficulty != "easy":
            self.difficulty = "easy" if self.difficulty == "medium" else "medium"
            self.consecutive_wrong = 0

    def update_style(self, style: str, confidence: int, reason: str):
        self.current_style = style
        self.style_confidence = confidence
        self.style_signals.append({
            "style": style,
            "confidence": confidence,
            "reason": reason,
            "turn": self.turn_count,
        })

    def update_mastery(self, subtopic: str, correct: bool):
        if clean := subtopic.strip().lower():
            baseline = self.mastery_map.get(clean, 45)
            self.mastery_map[clean] = max(0, min(100, baseline + (15 if correct else -12)))

    def set_plan(self, plan: dict | None):
        self.current_plan = plan
        if not plan:
            return
        self.learner_state = plan.get("learner_state", self.learner_state)
        self.rescue_mode = bool(plan.get("rescue", False))

    def set_visual_context(self, context: dict | None):
        self.latest_visual_context = context
        if not context:
            return
        self.visual_history.append(context)
        self.visual_history[:] = self.visual_history[-8:]
        
        if detected := str(context.get("detected_topic", "")).strip():
            self.add_interest(detected)
        if focus := str(context.get("reasoning_focus", "")).strip():
            self.add_subtopic(focus)

    def add_learner_message(self, message: str):
        if clean := " ".join((message or "").strip().split()):
            self.recent_learner_messages.append(clean[:240])
            self.recent_learner_messages[:] = self.recent_learner_messages[-8:]

    def set_reflection(self, reflection: dict | None):
        self.last_reflection = reflection

    def note_reaction(self, emoji: str):
        self.last_reaction = emoji
        if emoji == "🤔":
            self.learner_state = "confused"
            self.rescue_mode = True
        elif emoji == "😴":
            self.learner_state = "disengaged"
        elif emoji == "🤩":
            self.learner_state = "engaged"

    def mark_backend_action(self, action: str):
        self.last_backend_action = action
        self.last_backend_action_turn = self.turn_count
        self.recent_backend_actions.append(action)
        self.recent_backend_actions[:] = self.recent_backend_actions[-10:]

    def strongest_mastery(self) -> tuple[str, int] | None:
        if not self.mastery_map:
            return None
        return max(self.mastery_map.items(), key=lambda item: item[1])

    def weakest_mastery(self) -> tuple[str, int] | None:
        if not self.mastery_map:
            return None
        return min(self.mastery_map.items(), key=lambda item: item[1])

    def get_asked_questions(self) -> list[str]:
        return [q["question"] for q in self.quiz_history]

    def get_context_for_model(self) -> str:
        """Build context string to inject into Live API conversation."""
        parts = []
        if self.topic:
            parts.append(f"Topic: {self.topic}")
        if self.subtopics_covered:
            parts.append(f"Covered: {', '.join(list(self.subtopics_covered)[-5:])}")
        
        total = len(self.quiz_history)
        if total > 0:
            correct = sum(1 for q in self.quiz_history if q["correct"])
            parts.append(f"Quiz: {correct}/{total} correct")
            
        parts.append(f"Difficulty: {self.difficulty}")
        if self.style_confidence > 0:
            parts.append(f"Style: {self.current_style} ({self.style_confidence}%)")
        if self.learner_state:
            parts.append(f"Learner state: {self.learner_state}")
            
        if weakest := self.weakest_mastery():
            parts.append(f"Weakest mastery: {weakest[0]} ({weakest[1]}%)")
        if strongest := self.strongest_mastery():
            parts.append(f"Strongest mastery: {strongest[0]} ({strongest[1]}%)")
            
        if ctx := self.latest_visual_context:
            if label := ctx.get("label"): parts.append(f"Latest visual: {label}")
            if summary := ctx.get("summary"): parts.append(f"Visual summary: {summary}")
            if focus := ctx.get("reasoning_focus"): parts.append(f"Visual focus: {focus}")
            
        if self.recent_learner_messages:
            parts.append(f"Learner said: {' || '.join(list(self.recent_learner_messages)[-3:])}")
            
        if plan := self.current_plan:
            if focus := plan.get("focus"): parts.append(f"Focus: {focus}")
            if action := plan.get("next_action"): parts.append(f"Next action: {action}")
            
        return " | ".join(parts) if parts else "Session just started"

    def get_progress(self) -> dict:
        """Get progress data to send to frontend."""
        total = len(self.quiz_history)
        correct = sum(1 for q in self.quiz_history if q["correct"])
        mastery = 0
        if total > 0:
            mastery = min(100, int((correct / total) * 100 * min(1.0, total / 3)))
        return {
            "topic": self.topic,
            "subtopics": self.subtopics_covered,
            "quizCorrect": correct,
            "quizTotal": total,
            "difficulty": self.difficulty,
            "phase": self.phase,
            "mastery": mastery,
            "masteryMap": self.mastery_map,
            "style": self.current_style,
            "styleConfidence": self.style_confidence,
            "duration": int(time.time() - self.started_at),
            "interests": self.interests,
            "learnerState": self.learner_state,
            "rescueMode": self.rescue_mode,
            "currentPlan": self.current_plan,
            "latestVisual": self.latest_visual_context,
            "lastReflection": self.last_reflection,
        }

    def get_session_summary(self) -> dict:
        """Build session summary data for the end screen."""
        total = len(self.quiz_history)
        correct = sum(1 for q in self.quiz_history if q["correct"])
        duration = int(time.time() - self.started_at)
        return {
            "learnerId": self.learner_id,
            "topic": self.topic,
            "subtopics": self.subtopics_covered,
            "quizCorrect": correct,
            "quizTotal": total,
            "difficulty": self.difficulty,
            "mastery": self.get_progress()["mastery"],
            "masteryMap": self.mastery_map,
            "style": self.current_style,
            "styleConfidence": self.style_confidence,
            "duration": duration,
            "turns": self.turn_count,
            "interests": self.interests,
            "learnerState": self.learner_state,
            "currentPlan": self.current_plan,
            "latestVisual": self.latest_visual_context,
            "lastReflection": self.last_reflection,
        }
