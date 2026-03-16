"""
Client setup — Hybrid: API Key for Live API (native audio), Vertex AI for side calls.
Native audio models are only available via API key, not Vertex AI.
"""
from google import genai
import os
from dotenv import load_dotenv

load_dotenv()

is_cloud_run = bool(os.getenv("K_SERVICE"))

USE_VERTEX = os.getenv("USE_VERTEX_AI", "true" if is_cloud_run else "false").lower() == "true"
GCP_PROJECT = os.getenv("GCP_PROJECT", "")
GCP_LOCATION = os.getenv("GCP_LOCATION", "us-central1")
# Use a fallback string to prevent google-genai from crashing Uvicorn at startup
# if the environment variable is not explicitly set in the Cloud Run console.
API_KEY = os.getenv("GEMINI_API_KEY", "MISSING_GEMINI_API_KEY")

# Live API MUST use API key — native audio models are not on Vertex AI
live_client = genai.Client(
    api_key=API_KEY,
    http_options={"api_version": "v1alpha"},
)

# Side calls (image/quiz/search) use Vertex AI for higher quotas
if USE_VERTEX:
    std_client = genai.Client(
        vertexai=True,
        project=GCP_PROJECT or None,
        location=GCP_LOCATION,
    )
    print(f"Live API: API Key (native audio) | Side calls: Vertex AI (project={GCP_PROJECT or 'auto'})")
else:
    std_client = genai.Client(api_key=API_KEY)
    print("Using API Key auth for all calls")

# Model names
LIVE_MODEL = os.getenv("LIVE_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025")
IMAGE_MODELS = (
    ["imagen-3.0-generate-002"]
    if USE_VERTEX
    else ["imagen-4.0-fast-generate-001", "imagen-4.0-generate-001"]
)
QUIZ_MODELS = [
    ("gemini-2.5-flash", True),
    ("gemini-2.5-flash", False),
    ("gemini-2.0-flash", True),
    ("gemini-2.0-flash", False),
]
SEARCH_MODEL = "gemini-2.5-flash"
PLANNER_MODEL = os.getenv("PLANNER_MODEL", "gemini-2.5-pro")
VISION_MODEL = "gemini-2.5-flash"
