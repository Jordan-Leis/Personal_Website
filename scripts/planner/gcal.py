"""Google API clients built from a stored refresh token."""
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.readonly",
]


def credentials(env: dict) -> Credentials | None:
    if not env.get("GOOGLE_REFRESH_TOKEN"):
        return None
    return Credentials(
        None,
        refresh_token=env["GOOGLE_REFRESH_TOKEN"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=env["GOOGLE_CLIENT_ID"],
        client_secret=env["GOOGLE_CLIENT_SECRET"],
        scopes=SCOPES,
    )


def calendar_service(env: dict):
    creds = credentials(env)
    return build("calendar", "v3", credentials=creds, cache_discovery=False) if creds else None
