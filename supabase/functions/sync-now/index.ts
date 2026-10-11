// "Sync now" for jordanleis.com/to-do and /schedule: starts the planner-sync GitHub workflow.
// Only signed-in members (public.is_member()) may call it. The GitHub token is a Supabase
// secret (GH_DISPATCH_TOKEN) scoped to Actions on Personal_Website only.
const REPO = "Jordan-Leis/Personal_Website";
const WORKFLOW = "planner-sync.yml";
const ALLOWED_ORIGINS = ["https://jordanleis.com", "https://www.jordanleis.com", "http://localhost:4000"];

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const json = (status: number, body: unknown, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { error: "POST only" }, headers);

  // Membership check runs as the caller, so RLS's is_member() decides.
  const auth = req.headers.get("Authorization") ?? "";
  const member = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/is_member`, {
    method: "POST",
    headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "", "Content-Type": "application/json" },
    body: "{}",
  });
  if (!member.ok || (await member.json()) !== true) return json(403, { error: "Not allowed" }, headers);

  const gh = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("GH_DISPATCH_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "jordanleis-planner",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (gh.status === 204) return json(202, { started: true }, headers);
  if (gh.status === 404) return json(502, { error: "Sync workflow isn't on main yet" }, headers);
  return json(502, { error: `GitHub returned ${gh.status}` }, headers);
});
