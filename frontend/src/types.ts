export type AppState = 'idle' | 'listening' | 'thinking' | 'speaking';

// The 4 core learning styles that make up a child's "Fingerprint"
export type LearningStyle = 'storyteller' | 'analogist' | 'visualizer' | 'teacher';

export interface AgentPlan {
  goal: string;
  focus: string;
  next_action: 'ask_topic' | 'explain' | 'generate_illustration' | 'search_and_display' | 'generate_quiz' | 'show_worked_example';
  reason: string;
  confidence?: number;
  requires_visual_grounding?: boolean;
  expected_outcome?: string;
  fallback_if_failed?: string;
  learner_state: 'discovering' | 'engaged' | 'progressing' | 'confused' | 'disengaged';
  rescue: boolean;
  parent_note: string;
  coach_prompt: string;
}

export interface VisualItem {
  id: string;
  kind: 'image';
  content: string;
  mimeType?: string;
  prompt?: string;
  title?: string;
  source?: 'agent' | 'learner';
  timestamp: number;
  // Local-only: turn index when this was created (for auto-hiding)
  createdTurn?: number;
}

export interface ArtifactAnalysisItem {
  id: string;
  label: string;
  artifactType: string;
  summary: string;
  detectedTopic: string;
  reasoningFocus: string;
  extractedProblem: string;
  needsClarification: boolean;
  suggestedNextStep: string;
  coachPrompt: string;
  timestamp: number;
  createdTurn?: number;
}

export interface QuizItem {
  id: string;
  question: string;
  type: 'multiple_choice';
  options: string[];
  correctAnswer: string;
  hint: string;
  timestamp: number;
  answered?: boolean;
  selectedAnswer?: string;
  createdTurn?: number;
}

export interface QuizScore {
  correct: number;
  total: number;
  streak: number;
  bestStreak: number;
}

export type ContentCard = 
  | { kind: 'image'; data: VisualItem }
  | { kind: 'quiz'; data: QuizItem }
  | { kind: 'search'; data: SearchResultItem }
  | { kind: 'worked_example'; data: WorkedExampleItem }
  | { kind: 'artifact_analysis'; data: ArtifactAnalysisItem };

export interface SearchResultItem {
  id: string;
  title: string;
  query: string;
  facts: string;
  sources: { title: string; url: string }[];
  timestamp: number;
  createdTurn?: number;
}

export interface WorkedExampleItem {
  id: string;
  title: string;
  steps: string[];
  answer: string;
  practice: string;
  timestamp: number;
  createdTurn?: number;
}

export interface SessionProgress {
  topic: string | null;
  subtopics: string[];
  quizCorrect: number;
  quizTotal: number;
  difficulty: string;
  phase: string;
  mastery: number;
  masteryMap: Record<string, number>;
  style: string;
  styleConfidence: number;
  duration: number;
  interests: string[];
  learnerState: string;
  rescueMode: boolean;
  currentPlan?: AgentPlan | null;
  latestVisual?: Record<string, any> | null;
  lastReflection?: Record<string, any> | null;
}

export interface LessonStep {
  title: string;
  description: string;
  status: 'upcoming' | 'active' | 'done';
}

export interface SessionSummary {
  learnerId?: string;
  topic: string | null;
  subtopics: string[];
  quizCorrect: number;
  quizTotal: number;
  mastery: number;
  masteryMap?: Record<string, number>;
  style: string;
  duration: number;
  turns: number;
  learnerState?: string;
  currentPlan?: AgentPlan | null;
}

export interface LearningWay {
  style: string;
  count: number;
}

export interface LearningObservation {
  style: string;
  confidence: number;
  reason: string;
  turn: number;
}

export interface LearnerProfile {
  learnerId: string;
  learnerName: string;
  sessionCount: number;
  learningStyle: string;
  styleConfidence: number;
  topicsCovered: string[];
  interests: string[];
  mastery: Record<string, number>;
  lessonHistory: Array<Record<string, any>>;
  recentSummaries: Array<Record<string, any>>;
  learningWays: LearningWay[];
  observations: LearningObservation[];
  updatedAt?: number;
}

export interface AgentEvent {
  timestamp: number;
  type: 'fingerprint' | 'rescue' | 'detection' | 'info' | 'plan';
  message: string;
  style?: LearningStyle;
}

export interface WebSocketMessage {
  type: 'audio' | 'status' | 'text' | 'text_input' | 'style' | 'state' | 'detection' | 'transcript' | 'caption' | 'turn_complete' | 'rescue' | 'visual' | 'visual_loading' | 'quiz' | 'search_result' | 'worked_example' | 'artifact_analysis' | 'agent_action' | 'error' | 'topic' | 'progress' | 'subtopics' | 'lesson_plan' | 'agent_plan' | 'profile_update' | 'session_summary';
  data?: any;
}
