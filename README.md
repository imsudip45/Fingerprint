<div align="center">

# 🧬 Fingerprint

**AI Learning Companion for Kids — Powered by Gemini**

A real-time, multimodal AI tutor that adapts to how children think and learn. Built with Gemini Live for natural voice conversation and a backend planner that orchestrates visuals, quizzes, worked examples, grounded search, and worksheet understanding.

[**Try it**](#quick-start) · [**Architecture**](#architecture) · [**Features**](#features) · [**Deploy**](#deployment)

</div>

---

## What is Fingerprint?

Fingerprint is an AI learning companion designed for children aged 6–14. It uses Gemini Live for low-latency voice conversation while a backend planning layer decides what to show, explain, quiz, or search next. The app can now also accept a learner-uploaded worksheet or image, analyze it, and teach from that grounded visual context.

The system detects each child's **learning style** (Storyteller, Analogist, Visualizer, or Teacher) and adapts its teaching approach in real-time. It maintains **multi-session memory** so returning learners pick up where they left off.

### Built for the [Google Gemini API Developer Competition](https://ai.google.dev/competition)

---

## Features

| Feature | Description |
|---|---|
| 🎙️ **Voice-First** | Real-time bidirectional audio via Gemini Live API — no text typing needed |
| 🖼️ **Worksheet Understanding** | Upload homework, diagrams, or worksheets and Fingerprint will analyze them before teaching |
| 🧠 **Learning Style Detection** | Detects storyteller / analogist / visualizer / teacher patterns and adapts |
| 📝 **Interactive Quizzes** | Auto-generated multiple-choice questions with adaptive difficulty |
| 📐 **Worked Examples** | Step-by-step math and problem-solving walkthroughs |
| 📋 **Lesson Plans** | Auto-generated lesson outlines that track progress through subtopics |
| 💾 **Multi-Session Memory** | Remembers past topics and quiz performance across sessions |
| 😀 **Emoji Reactions** | Kids can tap 🤩 (excited), 🤔 (confused), or 😴 (bored) to steer the lesson |
| 📊 **Session Summary** | End-of-session report with mastery score, topics covered, and style detected |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React 19 + TypeScript + Tailwind v4 + Three.js)  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ AudioOrb │ │ Content  │ │  Quiz /  │ │ Lesson Plan / │  │
│  │   3D     │ │  Stream  │ │ Examples │ │  Summary      │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
│                        WebSocket                            │
└────────────────────────────┬────────────────────────────────┘
                             │ Audio PCM + JSON events
┌────────────────────────────┴────────────────────────────────┐
│  Backend (FastAPI + Python 3.13)                            │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ Gemini Live  │  │ Backend Planner│  │ Session State  │  │
│  │ API (voice)  │  │ + Action Exec  │  │ + Profiles     │  │
│  └──────┬───────┘  └───────┬────────┘  └────────────────┘  │
│         │                  │                                │
│  ┌──────┴──────────────────┴─────────────────────────────┐  │
│  │ Gemini / Vertex side calls: vision, image, quiz,     │  │
│  │ worked examples, grounded search, lesson planning    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Key tech:**
- **Gemini Live API** (`gemini-2.5-flash-native-audio-preview`) — real-time voice with native audio
- **Planner-first orchestration** — backend chooses the next teaching action and steers the live tutor with short system notes
- **Grounded visual workflow** — uploaded images or worksheets become session context for tutoring
- **Learner identity + memory** — learner profiles can live locally or in Firestore
- **Hybrid auth**: API key for Live API (required for native audio), optional Vertex AI for side calls

---

## Active Subsystems

### Backend

- `main.py` is the orchestration hub. It handles learner auth endpoints, websocket lifecycle, planner refreshes, reflection, topic detection, style detection, and visual upload processing.
- `planner.py` is the decision layer. It decides the next teaching move, detects topic choice, infers learning style, and reflects on learner state.
- `handlers.py` is the action executor. It runs backend actions such as illustration, quiz, search, worked example, and topic initialization.
- `generators.py` handles side-model calls for image generation, quiz generation, grounded search, lesson planning, and uploaded-image analysis.
- `profile.py` is now a profile repository abstraction with local JSON and optional Firestore backends.
- `session_state.py` is the session brain. It tracks topic, mastery, learner state, recent learner messages, planner output, and visual grounding.

### Frontend

- `App.tsx` now acts as the app shell, switching between learner login/selection, live session view, and session summary.
- `components/LoginLandingPage.tsx` handles learner account creation, sign-in, saved identity continuation, and session launch.
- `components/session/SessionPage.tsx` is the active live-session composition root.
- `components/session/SessionStage.tsx` renders the main lesson surface and content stack.
- `components/session/SessionConsole.tsx` is the primary live control surface for typing, reactions, image upload, mute, and disconnect.
- `hooks/useAudioWebSocket.ts` is the client runtime for websocket state, audio streaming, barge-in, typed input, and visual upload.

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.13
- **Gemini API Key** — get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

### Option 1: Docker (recommended)

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/fingerprint.git
cd fingerprint

# Set up environment
cp backend/.env.example backend/.env
# Edit backend/.env and add your GEMINI_API_KEY

# Build and run
docker compose up --build

# Open http://localhost:8080
```

### Option 2: Local Development

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate        # or .venv\Scripts\activate on Windows
pip install fastapi[standard] google-cloud-firestore google-genai python-dotenv uvicorn websockets
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

> **Note:** In local dev mode, the frontend connects to `ws://localhost:8000/ws/chat`. In Docker/production, it auto-detects the host.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | ✅ | — | Google Gemini API key |
| `USE_VERTEX_AI` | ❌ | `false` | Use Vertex AI for side calls (image/quiz/search) |
| `GCP_PROJECT` | ❌ | — | GCP project ID (only if `USE_VERTEX_AI=true`) |
| `GCP_LOCATION` | ❌ | `us-central1` | GCP region (only if `USE_VERTEX_AI=true`) |
| `PROFILE_STORE` | ❌ | `local` | Profile backend: `local` or `firestore` |
| `GOOGLE_CLOUD_PROJECT` | ❌ | — | Optional explicit Firestore project; falls back to `GCP_PROJECT` |
| `PORT` | ❌ | `8080` | Server port |

---

## Project Structure

```
fingerprint/
├── backend/
│   ├── main.py              # WebSocket server + orchestration loop + auth endpoints
│   ├── config.py            # Gemini / Vertex client setup and model selection
│   ├── handlers.py          # Planner-driven action executor
│   ├── generators.py        # Content generation + uploaded-image analysis
│   ├── json_utils.py        # Shared parsing helpers for structured model output
│   ├── planner.py           # Planning, reflection, topic detection, style detection
│   ├── prompts.py           # Tutor, quiz, and generation prompts
│   ├── session_state.py     # In-session state (topic, quiz, difficulty, visual context)
│   ├── profile.py           # Profile repository abstraction + local persistence
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # App shell: learner auth, session, summary
│   │   ├── audio/            # AudioWorklet processor for microphone streaming
│   │   ├── lib/              # Learner identity persistence helpers
│   │   ├── hooks/
│   │   │   └── useAudioWebSocket.ts # WebSocket + audio pipeline + typed/visual input
│   │   ├── components/
│   │   │   ├── LoginLandingPage.tsx # Learner sign-in/create/select UI
│   │   │   ├── AudioOrb3D.tsx       # 3D orb visualization
│   │   │   ├── ContentStream.tsx    # Visual/search/quiz/example/analysis stack
│   │   │   ├── session/             # SessionPage, SessionStage, SessionConsole
│   │   │   └── ...                  # QuizCard, WorkedExample, summary, remaining shared UI
│   └── package.json
├── Dockerfile               # Multi-stage build (frontend + backend, uv-managed Python env)
├── docker-compose.yml
└── README.md
```

### Notes on Codebase Evolution

- The current production path is planner-driven rather than Live function-call-driven.
- The active tutoring surface lives in `components/session/`, while learner selection and persistence live in `App.tsx`, `LoginLandingPage.tsx`, and `lib/learnerIdentity.ts`.
- Structured model-output parsing is now shared between planners and generators via `json_utils.py`.

---

## Live Session Flow

1. **Learner selects or creates a profile** via HTTP auth endpoints.
2. **Frontend opens websocket with learner identity** and starts microphone streaming.
3. **Gemini Live handles low-latency voice turns** while the backend tracks session state.
4. **Planner decides the next move** based on learner messages, reactions, mastery, and visual context.
5. **Action executor runs the move** such as illustration, search, quiz, worked example, or topic setup.
6. **Tutor is steered with short system instructions** so spoken output matches what is shown on screen.
7. **Profile memory is saved** locally or to Firestore at session end.

## Deployment

### Google Cloud Run

The Dockerfile is Cloud Run-ready:

```bash
# Build and push
gcloud builds submit --tag gcr.io/YOUR_PROJECT/fingerprint

# Deploy
gcloud run deploy fingerprint \
  --image gcr.io/YOUR_PROJECT/fingerprint \
  --port 8080 \
  --set-env-vars GEMINI_API_KEY=your_key \
  --allow-unauthenticated
```

### Vertex AI (optional)

For higher quotas on side calls (image generation, quizzes, search):

1. Enable the Vertex AI API in your GCP project
2. Set `USE_VERTEX_AI=true`, `GCP_PROJECT`, `GCP_LOCATION` in your environment
3. Ensure the service account has Vertex AI permissions

The Live API always uses the API key (native audio models are not available on Vertex AI).

### Firestore memory (recommended for Cloud Run)

For cloud-backed learner memory:

1. Enable Firestore in your GCP project
2. Set `PROFILE_STORE=firestore`
3. Set `GOOGLE_CLOUD_PROJECT` or reuse `GCP_PROJECT`
4. Run the service with credentials that can access Firestore

The backend stores learner profiles in a `learners` collection. Local development can continue to use `PROFILE_STORE=local`.

---

## How It Works

1. **Child connects** → WebSocket opens and Gemini Live starts a voice session
2. **Fingerprint greets** → the live tutor opens with topic discovery
3. **Child speaks or uploads a worksheet/image** → audio and visual context flow to the backend
4. **Backend planner decides next move** → topic setting, visual analysis, illustration, quiz, search, or worked example
5. **Tutor is steered with context** → the backend sends short system instructions so the live tutor talks about what is on screen
6. **Reflection and adaptation** → quiz answers, reactions, uploads, and learner utterances update style, rescue mode, and the next plan
7. **Session ends** → profile memory is saved and a summary is shown

---

## License

MIT — see [LICENSE](LICENSE)
