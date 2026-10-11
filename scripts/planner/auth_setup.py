"""One-time local helper: run Google OAuth consent and store a refresh token.

Usage (from the repo root):
    python -m scripts.planner.auth_setup

Reads GOOGLE_CLIENT_SECRET_FILE from ~/.config/jordan-planner/.env, prints a consent
URL to open in a browser, then writes GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and
GOOGLE_REFRESH_TOKEN back into the same .env. Secret values are never printed.
"""
import json
import os
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

ENV_PATH = Path.home() / ".config" / "jordan-planner" / ".env"
SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.readonly",
]
PORT = 8085


def read_env(path):
    env = {}
    for line in path.read_text().splitlines():
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            env[key] = value
    return env


def write_env(path, updates):
    lines = path.read_text().splitlines()
    seen = set()
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0]
        if key in updates:
            lines[i] = f"{key}={updates[key]}"
            seen.add(key)
    lines += [f"{k}={v}" for k, v in updates.items() if k not in seen]
    path.write_text("\n".join(lines) + "\n")
    os.chmod(path, 0o600)


def main():
    env = read_env(ENV_PATH)
    secret_file = env["GOOGLE_CLIENT_SECRET_FILE"]
    client = json.loads(Path(secret_file).read_text())["installed"]

    flow = InstalledAppFlow.from_client_secrets_file(secret_file, SCOPES)
    creds = flow.run_local_server(
        port=PORT,
        open_browser=False,
        access_type="offline",
        prompt="consent",
        authorization_prompt_message="Open this URL in your browser and approve access:\n{url}\n",
        success_message="Jordan Planner is authorized. You can close this tab.",
    )
    if not creds.refresh_token:
        raise SystemExit("No refresh token returned; revoke the app at myaccount.google.com/permissions and retry.")

    write_env(ENV_PATH, {
        "GOOGLE_CLIENT_ID": client["client_id"],
        "GOOGLE_CLIENT_SECRET": client["client_secret"],
        "GOOGLE_REFRESH_TOKEN": creds.refresh_token,
    })
    print(f"Saved GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN to {ENV_PATH}")
    print("Granted scopes:", ", ".join(sorted(creds.granted_scopes or SCOPES)))


if __name__ == "__main__":
    main()
