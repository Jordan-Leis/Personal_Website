"""Settings from the environment (GitHub Actions secrets) or the local .env file."""
import os
from pathlib import Path

LOCAL_ENV = Path.home() / ".config" / "jordan-planner" / ".env"


def load_env() -> dict:
    env = {}
    if LOCAL_ENV.exists():
        for line in LOCAL_ENV.read_text().splitlines():
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                env[key] = value
    env.update({k: v for k, v in os.environ.items() if k.startswith(("GOOGLE_", "SUPABASE_", "PORTAL_", "OUTLOOK_"))})
    return env
