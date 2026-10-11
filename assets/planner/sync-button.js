// Topbar "Sync now" button and "synced N min ago" label, shared by /to-do and /schedule.
import * as db from "./data.js";
import { ago } from "./model.js";

export function mountSync(root, { toast, onSynced }) {
  root.innerHTML = `<button class="btn" data-sync title="Run the calendar/email sync now">⟳ Sync now</button>
    <span class="hint" data-synced></span>`;
  const btn = root.querySelector("[data-sync]"), label = root.querySelector("[data-synced]");
  let last = null, polling = null;

  async function refresh() {
    last = await db.lastSync().catch(() => last);
    label.textContent = `synced ${ago(last)}`;
    label.title = last ? new Date(last).toLocaleString() : "";
  }

  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "⟳ Starting…";
    try {
      await db.syncNow();
      toast("Sync started: calendar updates in about 1–2 minutes");
      const before = last, started = Date.now();
      clearInterval(polling);
      polling = setInterval(async () => {
        await refresh();
        if (last !== before) {
          clearInterval(polling);
          toast("Synced ✓");
          onSynced?.();
        } else if (Date.now() - started > 5 * 60000) {
          clearInterval(polling);
        }
      }, 20000);
    } catch (err) {
      toast(`Sync didn't start: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "⟳ Sync now";
    }
  };

  refresh();
  setInterval(refresh, 60000);
}
