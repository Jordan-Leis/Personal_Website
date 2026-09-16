/**
 * Optional AI layer over the existing search.
 *
 * A student types a sentence and presses Enter; a Cloudflare Worker asks Gemini
 * to turn it into filter values, and those values are ticked into the normal
 * MultiSelect controls. The awards themselves never leave the browser and the
 * model never sees them — it only picks filters.
 *
 * This file is entirely additive. app.js calls attach() inside a guard, so if
 * this script 404s or throws, the site behaves exactly as it did before it
 * existed. Nothing here runs at definition time.
 */
const AISearch = (() => {
  // Public by construction the moment a browser calls it, so hardcoding costs
  // nothing — and a config fetch would add a blocking round-trip plus a second
  // file the page depends on.
  const ENDPOINT = "https://uw-awards-ai-search.jordanleis.workers.dev/interpret";

  const MAX_QUESTION_CHARS = 300;
  // Must exceed the Worker's own 8s upstream timeout plus network, so a slow
  // Gemini call surfaces as the Worker's clean 502 rather than an abort here.
  const REQUEST_TIMEOUT_MS = 12000;
  // After this many consecutive failures, stop calling for COOLDOWN_MS. Without
  // it, a dead Worker adds ~9s of dead air to every single Enter press.
  const BREAKER_THRESHOLD = 2;
  const BREAKER_COOLDOWN_MS = 60_000;

  // The order filters are relaxed in when the AI's interpretation matches
  // nothing. career and areaOfStudy are deliberately absent: they are the
  // student's actual identity, and dropping them would show awards they can't
  // apply for, which is worse than showing none.
  const RELAX_ORDER = ["term", "level", "affiliation", "awardType"];

  const FILTER_LABELS = {
    career: "Career",
    level: "Level",
    awardType: "Award type",
    term: "Term",
    affiliation: "Affiliation",
    areaOfStudy: "Area of study",
  };

  let ctx = null;
  let consecutiveFailures = 0;
  let breakerUntil = 0;
  let inFlight = false;
  let undoSnapshot = null;
  // The exact question whose interpretation is currently applied. app.js asks
  // ownsQuery() before releasing the query override on `input`, so a debounce
  // that fires *after* a fast (edge-cached, ~100ms) AI answer doesn't undo it.
  let lastAppliedQuestion = null;

  const el = {};

  function q(id) {
    return document.getElementById(id);
  }

  function breakerOpen() {
    return Date.now() < breakerUntil;
  }

  /** "a", "a and b", "a, b and c" */
  function listPhrase(items) {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  }

  function noteFailure() {
    consecutiveFailures += 1;
    if (consecutiveFailures >= BREAKER_THRESHOLD) {
      breakerUntil = Date.now() + BREAKER_COOLDOWN_MS;
      el.askBtn.hidden = true;
      setTimeout(() => {
        consecutiveFailures = 0;
        el.askBtn.hidden = false;
      }, BREAKER_COOLDOWN_MS);
    }
  }

  function setStatus(text, kind) {
    el.status.textContent = text || "";
    el.status.hidden = !text;
    el.status.className = `ai-status${kind ? ` ai-${kind}` : ""}`;
  }

  function clearChips() {
    el.chips.innerHTML = "";
    el.chips.hidden = true;
    el.undoBtn.hidden = true;
    undoSnapshot = null;
    lastAppliedQuestion = null;
  }

  /** True while the text in the box is exactly the question the AI last
   *  interpreted — i.e. the current filters/override are the AI's, not stale. */
  function ownsQuery(text) {
    return lastAppliedQuestion !== null && String(text || "").trim() === lastAppliedQuestion;
  }

  /** Chips are built with textContent, never innerHTML: `keywords` is the one
   *  attacker-influenceable string in the Worker's response. */
  function renderChips(filters, keywords, extraNote) {
    el.chips.innerHTML = "";

    const intro = document.createElement("span");
    intro.className = "ai-chip-intro";
    intro.textContent = "AI read that as:";
    el.chips.appendChild(intro);

    let any = false;
    for (const key of Object.keys(FILTER_LABELS)) {
      for (const value of filters[key] || []) {
        const chip = document.createElement("span");
        chip.className = "ai-chip";
        chip.title = FILTER_LABELS[key];
        chip.textContent = value;
        el.chips.appendChild(chip);
        any = true;
      }
    }
    if (keywords) {
      const chip = document.createElement("span");
      chip.className = "ai-chip ai-chip-keywords";
      chip.title = "Keywords";
      chip.textContent = `“${keywords}”`;
      el.chips.appendChild(chip);
      any = true;
    }
    if (!any) {
      intro.textContent = "AI couldn't narrow that down — showing everything.";
    }
    if (extraNote) {
      const note = document.createElement("span");
      note.className = "ai-chip-note";
      note.textContent = extraNote;
      el.chips.appendChild(note);
    }

    el.chips.hidden = false;
    el.undoBtn.hidden = false;
  }

  function snapshot() {
    const filters = {};
    for (const key of Object.keys(FILTER_LABELS)) {
      filters[key] = ctx.controls[key].value;
    }
    return { filters, query: ctx.getQuery(), override: ctx.getQueryOverride() };
  }

  function applyFilters(filters) {
    for (const key of Object.keys(FILTER_LABELS)) {
      ctx.controls[key].set(filters[key] || []);
    }
  }

  function restore(snap) {
    applyFilters(snap.filters);
    ctx.setQuery(snap.query);
    ctx.setQueryOverride(snap.override);
    ctx.rerun();
  }

  /**
   * Try the AI's filters; if they match nothing, relax one filter at a time in
   * RELAX_ORDER until something comes back. Returns the filters actually used
   * plus the keys that had to be dropped.
   */
  function applyWithRelaxation(filters, keywords) {
    const working = JSON.parse(JSON.stringify(filters));
    const relaxed = [];

    for (let step = 0; ; step += 1) {
      applyFilters(working);
      ctx.setQueryOverride(keywords || "");
      const count = ctx.rerun();
      if (count > 0) return { used: working, relaxed, count };

      // Find the next non-empty relaxable filter.
      const next = RELAX_ORDER.find((k) => (working[k] || []).length > 0 && !relaxed.includes(k));
      if (!next) return { used: working, relaxed, count: 0 };
      working[next] = [];
      relaxed.push(next);
    }
  }

  async function ask(question) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        // text/plain keeps this a CORS *simple* request, skipping the preflight
        // round-trip. The Worker parses the body as JSON regardless.
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ q: question }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`http_${response.status}`);
      const data = await response.json();
      if (!data || data.ok !== true) throw new Error("not_ok");
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Fall back to the site's normal keyword search on the raw question. */
  function keywordFallback(message) {
    clearChips();
    // null, not "": clearing the override is what makes Fuse search the text
    // still sitting in the box. "" would mean "search nothing".
    ctx.setQueryOverride(null);
    ctx.rerun();
    setStatus(message, "warn");
  }

  async function run() {
    const question = ctx.getQuery().trim().slice(0, MAX_QUESTION_CHARS);
    if (!question || inFlight) return;

    if (navigator.onLine === false || breakerOpen()) {
      keywordFallback("AI search is unavailable right now — showing keyword results.");
      return;
    }

    inFlight = true;
    el.askBtn.disabled = true;
    el.askBtn.classList.add("is-loading");
    setStatus("Reading your question…", "busy");

    try {
      const data = await ask(question);
      consecutiveFailures = 0;

      // Snapshot only the first time: Undo should return to the student's own
      // pre-AI state, not to the previous AI answer when they ask twice in a row.
      const snap = undoSnapshot || snapshot();
      const { used, relaxed, count } = applyWithRelaxation(data.filters, data.keywords);
      undoSnapshot = snap;
      lastAppliedQuestion = question;

      const notes = [];
      // Explain the widening whenever faculty-wide values sit next to a specific
      // program — regardless of whether the model added them itself or the
      // Worker's safety net did (data.notes only reports the latter).
      const areas = used.areaOfStudy || [];
      const hasWide = areas.some((a) => a === "All Programs" || a.endsWith("Faculty - All Programs"));
      const hasSpecific = areas.some((a) => a !== "All Programs" && !a.endsWith("Faculty - All Programs"));
      if (hasWide && hasSpecific) {
        notes.push("Also included faculty-wide and all-programs awards, which you're eligible for too.");
      }
      if (relaxed.length) {
        notes.push(
          `No exact matches, so ${listPhrase(relaxed.map((k) => FILTER_LABELS[k].toLowerCase()))} ${relaxed.length === 1 ? "was" : "were"} ignored.`
        );
      }
      renderChips(used, data.keywords, notes.join(" "));

      setStatus(
        count === 0 ? "Nothing matched, even after loosening the filters. Try rewording it." : "",
        count === 0 ? "warn" : null
      );
      updateHint();
    } catch (e) {
      noteFailure();
      keywordFallback("AI search is unavailable right now — showing keyword results.");
    } finally {
      inFlight = false;
      el.askBtn.disabled = false;
      el.askBtn.classList.remove("is-loading");
    }
  }

  function updateHint() {
    const words = ctx.getQuery().trim().split(/\s+/).filter(Boolean).length;
    el.hint.hidden = words < 4 || !el.chips.hidden;
  }

  /**
   * @param {object} options
   * @param {HTMLInputElement} options.input      the existing #search-input
   * @param {object} options.controls             the MultiSelect instances by filter key
   * @param {function} options.rerun              re-run search+render, returns the result count
   * @param {function} options.getQuery/setQuery  read/write the search box
   * @param {function} options.getQueryOverride/setQueryOverride
   *        the text Fuse.js actually searches, so the student's full sentence can
   *        stay visible and editable while Fuse sees only the AI's tight keywords
   */
  function attach(options) {
    ctx = options;

    el.askBtn = q("ai-ask-btn");
    el.status = q("ai-status");
    el.chips = q("ai-chips");
    el.undoBtn = q("ai-undo-btn");
    el.hint = q("ai-hint");
    if (!el.askBtn || !el.status || !el.chips || !el.undoBtn || !el.hint) return;

    el.askBtn.hidden = false;

    el.askBtn.addEventListener("click", run);
    el.undoBtn.addEventListener("click", () => {
      if (undoSnapshot) restore(undoSnapshot);
      clearChips();
      setStatus("", null);
    });

    ctx.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        run();
      }
    });

    // Typing a new question invalidates the last interpretation, but the
    // filters stay put — silently unticking boxes the student can see would be
    // worse than leaving them to clear it themselves.
    ctx.input.addEventListener("input", () => {
      if (!el.chips.hidden) {
        setStatus("Press Enter to re-read your question with AI.", null);
      }
      updateHint();
    });

    updateHint();
  }

  /** Called by app.js's "Clear filters" so stale AI UI doesn't linger. */
  function reset() {
    clearChips();
    setStatus("", null);
    if (el.hint) el.hint.hidden = true;
  }

  return { attach, reset, ownsQuery };
})();
