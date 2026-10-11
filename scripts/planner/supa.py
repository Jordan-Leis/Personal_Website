"""Minimal Supabase PostgREST client for the sync job (service-role key, bypasses RLS)."""
import requests


class Supabase:
    def __init__(self, url: str, service_key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.session = requests.Session()
        self.session.headers.update({
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        })

    def _check(self, resp):
        if not resp.ok:
            # PostgREST errors describe the query, not row contents, so they are safe to log.
            raise RuntimeError(f"supabase {resp.request.method} {resp.status_code}: {resp.text[:300]}")
        return resp

    def select(self, table: str, params: dict) -> list[dict]:
        rows, offset = [], 0
        while True:
            page = self._check(self.session.get(
                f"{self.base}/{table}", params=params,
                headers={"Range-Unit": "items", "Range": f"{offset}-{offset + 999}"}, timeout=30,
            )).json()
            rows += page
            if len(page) < 1000:
                return rows
            offset += 1000

    def upsert(self, table: str, rows: list[dict], on_conflict: str) -> None:
        for i in range(0, len(rows), 500):
            self._check(self.session.post(
                f"{self.base}/{table}", params={"on_conflict": on_conflict}, json=rows[i:i + 500],
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"}, timeout=60,
            ))

    def delete_in(self, table: str, column: str, values: list[str]) -> None:
        for i in range(0, len(values), 100):
            quoted = ",".join(f'"{v}"' for v in values[i:i + 100])
            self._check(self.session.delete(f"{self.base}/{table}", params={column: f"in.({quoted})"}, timeout=30))
