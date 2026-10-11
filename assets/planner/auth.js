// Shared Supabase client and members-only login gate for /to-do and /schedule.
// The real enforcement is RLS (public.is_member()); this gate is just the UI.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, PUBLIC_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, PUBLIC_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
});

async function isMember(session) {
  if (!session) return false;
  const { data, error } = await supabase.rpc("is_member");
  return !error && data === true;
}

function renderGate(root, message) {
  root.innerHTML = `
    <div class="gate-card">
      <div class="gate-brand">jordanleis.com</div>
      <h1>Private planner</h1>
      <p>${message}</p>
      <button class="btn primary" id="gate-signin">Sign in with Google</button>
    </div>`;
  root.querySelector("#gate-signin").onclick = () =>
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
}

// Resolves with a member's session once signed in. Until then, shows the gate in `root`.
export async function requireMember(root) {
  const { data: { session } } = await supabase.auth.getSession();
  if (await isMember(session)) return session;
  if (session) {
    const email = session.user.email;
    await supabase.auth.signOut();
    renderGate(root, `${email} doesn't have access.`);
  } else {
    renderGate(root, "Sign in to continue.");
  }
  return new Promise((resolve) => {
    supabase.auth.onAuthStateChange((_event, next) => {
      // Defer: calling Supabase inside this callback can deadlock its auth lock.
      if (next) setTimeout(async () => { if (await isMember(next)) resolve(next); }, 0);
    });
  });
}

export const signOut = () => supabase.auth.signOut().then(() => location.reload());
