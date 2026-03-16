"""
Learning profile persistence.
"""
import json
import os
import secrets
import hashlib
import time
import uuid
from pathlib import Path
from typing import Protocol
from dotenv import load_dotenv

load_dotenv()

try:
    from google.cloud import firestore
    from google.cloud.firestore_v1 import FieldFilter
except Exception:  # pragma: no cover - optional dependency for local dev fallback
    firestore = None

PROFILES_DIR = Path(__file__).parent / "profiles"
PROFILES_DIR.mkdir(exist_ok=True)


def _default_profile(learner_id: str) -> dict:
    now = time.time()
    return {
        "learner_id": learner_id,
        "learner_name": "",
        "learner_name_normalized": "",
        "pin_hash": "",
        "pin_salt": "",
        "session_id": learner_id,  # Backward-compatible alias for older data.
        "session_count": 0,
        "learning_style": "storyteller",
        "style_confidence": 0,
        "topics_covered": [],
        "quiz_results": [],
        "observations": [],
        "interests": [],
        "mastery": {},
        "lesson_history": [],
        "recent_summaries": [],
        "created_at": now,
        "updated_at": now,
    }


def _normalize_profile(data: dict | None, learner_id: str) -> dict:
    profile = _default_profile(learner_id)
    if isinstance(data, dict):
        profile.update(data)
    profile["learner_id"] = learner_id
    profile["learner_name"] = str(profile.get("learner_name", "")).strip()[:80]
    profile["learner_name_normalized"] = _normalize_learner_name(profile.get("learner_name", ""))
    profile["session_id"] = learner_id
    return profile


def _normalize_learner_name(name: str) -> str:
    return " ".join(str(name or "").strip().lower().split())[:80]


def _hash_pin(pin: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        str(pin).encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    ).hex()


def _verify_pin(pin: str, profile: dict) -> bool:
    salt = str(profile.get("pin_salt", "")).strip()
    stored_hash = str(profile.get("pin_hash", "")).strip()
    if not salt or not stored_hash:
        return False
    return secrets.compare_digest(_hash_pin(pin, salt), stored_hash)


class ProfileRepository(Protocol):
    def load_profile(self, learner_id: str) -> dict:
        ...

    def save_profile(self, profile: dict):
        ...

    def load_all_profiles(self) -> list[dict]:
        ...

    def find_by_learner_name(self, learner_name: str) -> dict | None:
        ...


class LocalProfileRepository:
    def __init__(self, profiles_dir: Path):
        self.profiles_dir = profiles_dir
        self.profiles_dir.mkdir(exist_ok=True)

    def load_profile(self, learner_id: str) -> dict:
        path = self.profiles_dir / f"{learner_id}.json"
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                data = {}
            return _normalize_profile(data, learner_id)
        return _default_profile(learner_id)

    def save_profile(self, profile: dict):
        learner_id = profile.get("learner_id") or profile.get("session_id")
        if not learner_id:
            raise ValueError("Profile must include learner_id")

        profile["learner_id"] = learner_id
        profile["session_id"] = learner_id
        profile["updated_at"] = time.time()

        path = self.profiles_dir / f"{learner_id}.json"
        path.write_text(json.dumps(profile, indent=2), encoding="utf-8")

    def load_all_profiles(self) -> list[dict]:
        profiles = []
        for p in self.profiles_dir.glob("*.json"):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                if data.get("topics_covered") or data.get("session_count", 0) > 0:
                    profiles.append(data)
            except Exception:
                continue
        profiles.sort(key=lambda x: x.get("updated_at", x.get("created_at", 0)))
        return profiles

    def find_by_learner_name(self, learner_name: str) -> dict | None:
        normalized_name = _normalize_learner_name(learner_name)
        if not normalized_name:
            return None
        for p in self.profiles_dir.glob("*.json"):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            learner_id = str(data.get("learner_id") or p.stem)
            profile = _normalize_profile(data, learner_id)
            if profile.get("learner_name_normalized") == normalized_name:
                return profile
        return None


class FirestoreProfileRepository:
    def __init__(self, project_id: str = ""):
        if firestore is None:
            raise RuntimeError(
                "google-cloud-firestore is not installed. Install dependencies before using PROFILE_STORE=firestore."
            )
        self.project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT", "") or os.getenv("GCP_PROJECT", "")
        try:
            self.client = firestore.Client(project=self.project_id or None)
        except Exception as err:
            raise RuntimeError(
                "Failed to initialize Firestore client. Set GOOGLE_CLOUD_PROJECT or GCP_PROJECT and provide "
                "Application Default Credentials locally, or run on Cloud Run with a Firestore-enabled service account."
            ) from err
        self.collection = self.client.collection("learners")

    def load_profile(self, learner_id: str) -> dict:
        try:
            snapshot = self.collection.document(learner_id).get()
            if snapshot.exists:
                return _normalize_profile(snapshot.to_dict() or {}, learner_id)
        except Exception as err:
            print(f"[Profile] Firestore load failed for {learner_id}: {err}")
        return _default_profile(learner_id)

    def save_profile(self, profile: dict):
        learner_id = profile.get("learner_id") or profile.get("session_id")
        if not learner_id:
            raise ValueError("Profile must include learner_id")

        normalized = _normalize_profile(profile, learner_id)
        normalized["updated_at"] = time.time()
        self.collection.document(learner_id).set(normalized)

    def load_all_profiles(self) -> list[dict]:
        profiles = []
        try:
            for snapshot in self.collection.stream():
                data = snapshot.to_dict() or {}
                learner_id = data.get("learner_id") or snapshot.id
                normalized = _normalize_profile(data, learner_id)
                if normalized.get("topics_covered") or normalized.get("session_count", 0) > 0:
                    profiles.append(normalized)
        except Exception as err:
            print(f"[Profile] Firestore load_all failed: {err}")
            return []
        profiles.sort(key=lambda x: x.get("updated_at", x.get("created_at", 0)))
        return profiles

    def find_by_learner_name(self, learner_name: str) -> dict | None:
        normalized_name = _normalize_learner_name(learner_name)
        if not normalized_name:
            return None
        try:
            # Use keyword filter form to avoid deprecation warnings in newer client versions.
            query = self.collection.where(
                filter=FieldFilter("learner_name_normalized", "==", normalized_name)
            ).limit(1)
            for snapshot in query.stream():
                data = snapshot.to_dict() or {}
                learner_id = data.get("learner_id") or snapshot.id
                return _normalize_profile(data, learner_id)
        except Exception as err:
            print(f"[Profile] Firestore find_by_learner_name failed for {normalized_name}: {err}")
        return None


PROFILE_STORE = os.getenv("PROFILE_STORE", "firestore" if os.getenv("K_SERVICE") else "local").lower()
if PROFILE_STORE == "firestore":
    profile_repository: ProfileRepository = FirestoreProfileRepository()
else:
    profile_repository = LocalProfileRepository(PROFILES_DIR)


def get_profile_repository() -> ProfileRepository:
    return profile_repository


def load_profile(learner_id: str) -> dict:
    return get_profile_repository().load_profile(learner_id)


def save_profile(profile: dict):
    return get_profile_repository().save_profile(profile)


def load_all_profiles() -> list[dict]:
    """Load all learner profiles."""
    return get_profile_repository().load_all_profiles()


def find_profile_by_learner_name(learner_name: str) -> dict | None:
    return get_profile_repository().find_by_learner_name(learner_name)


def create_learner_account(learner_name: str, pin: str) -> dict:
    clean_name = " ".join(str(learner_name or "").strip().split())[:80]
    normalized_name = _normalize_learner_name(clean_name)
    clean_pin = str(pin or "").strip()
    if len(clean_name) < 2:
        raise ValueError("Learner name must be at least 2 characters.")
    if not (clean_pin.isdigit() and len(clean_pin) == 4):
        raise ValueError("PIN must be exactly 4 digits.")
    if find_profile_by_learner_name(normalized_name):
        raise ValueError("A learner with that name already exists. Sign in instead.")

    learner_id = f"learner-{uuid.uuid4().hex[:12]}"
    profile = _default_profile(learner_id)
    salt = secrets.token_hex(16)
    profile["learner_name"] = clean_name
    profile["learner_name_normalized"] = normalized_name
    profile["pin_salt"] = salt
    profile["pin_hash"] = _hash_pin(clean_pin, salt)
    save_profile(profile)
    return profile


def authenticate_learner(learner_name: str, pin: str) -> dict | None:
    clean_pin = str(pin or "").strip()
    if not (clean_pin.isdigit() and len(clean_pin) == 4):
        return None
    profile = find_profile_by_learner_name(learner_name)
    if not profile:
        return None
    if not _verify_pin(clean_pin, profile):
        return None
    return profile
def format_public_profile(profile: dict) -> dict:
    observations = profile.get("observations", []) or []
    style_counts: dict[str, int] = {}
    for entry in observations:
        style = str((entry or {}).get("style", "")).strip()
        if style:
            style_counts[style] = style_counts.get(style, 0) + 1

    learning_ways = [
        {"style": style, "count": count}
        for style, count in sorted(style_counts.items(), key=lambda item: item[1], reverse=True)
    ]

    return {
        "learnerId": profile.get("learner_id"),
        "learnerName": profile.get("learner_name", ""),
        "sessionCount": int(profile.get("session_count", 0) or 0),
        "learningStyle": profile.get("learning_style", "storyteller"),
        "styleConfidence": int(profile.get("style_confidence", 0) or 0),
        "topicsCovered": list(profile.get("topics_covered", []) or [])[-16:],
        "interests": list(profile.get("interests", []) or [])[-16:],
        "mastery": dict(profile.get("mastery", {}) or {}),
        "lessonHistory": list(profile.get("lesson_history", []) or [])[-12:],
        "recentSummaries": list(profile.get("recent_summaries", []) or [])[-8:],
        "learningWays": learning_ways,
        "observations": observations[-20:],
        "updatedAt": profile.get("updated_at"),
    }
