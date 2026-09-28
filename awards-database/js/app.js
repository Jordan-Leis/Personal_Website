(function () {
  const PAGE_SIZE = 50;
  let visibleCount = PAGE_SIZE;
  let currentResults = [];
  let filterControls = {};

  // When AI search interprets a question, the student's full sentence stays in
  // the box (so they can edit it) but Fuse.js gets the AI's tight keywords
  // instead — a whole natural-language sentence scores terribly against award
  // text.
  //
  // Tri-state, and the distinction matters: null means "no override, search
  // whatever is in the box" (the normal case), while "" means "the AI said the
  // filters express everything, so run no text search at all". Collapsing the
  // two would send the question itself to Fuse and cut a 52-award result down
  // to 1.
  let queryOverride = null;

  const el = {
    searchInput: document.getElementById("search-input"),
    filterBar: document.getElementById("filter-bar"),
    clearFilters: document.getElementById("clear-filters"),
    matchToggle: document.getElementById("match-mode-toggle"),
    editProfileBtn: document.getElementById("edit-profile-btn"),
    profileEditor: document.getElementById("profile-editor"),
    profileCareer: document.getElementById("profile-career"),
    profileLevel: document.getElementById("profile-level"),
    profileArea: document.getElementById("profile-area"),
    saveProfileBtn: document.getElementById("save-profile-btn"),
    resultSummary: document.getElementById("result-summary"),
    cardGrid: document.getElementById("card-grid"),
    loadMoreRow: document.getElementById("load-more-row"),
    loadMoreBtn: document.getElementById("load-more-btn"),
    modalBackdrop: document.getElementById("modal-backdrop"),
    modalBody: document.getElementById("modal-body"),
    freshnessNote: document.getElementById("freshness-note"),
    sourceLoader: document.getElementById("source-loader"),
    sourceLoaderList: document.getElementById("source-loader-list"),
  };

  function populateSelect(selectEl, values, placeholder) {
    selectEl.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = placeholder;
    selectEl.appendChild(optAll);
    for (const v of values) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      selectEl.appendChild(opt);
    }
  }

  // If data/filters.json cannot be loaded, fall back to the six filters this
  // page shipped with, so the search stays fully usable.
  const FALLBACK_FILTER_SPEC = {
    version: 0,
    groups: ["Study", "Award", "Eligibility"],
    facets: [
      { key: "career", filter_key: "career", label: "Career", kind: "scalar", semantics: "facet", group: "Study" },
      { key: "levels", filter_key: "level", label: "Year of study", kind: "list", semantics: "facet", group: "Study" },
      { key: "areas_of_study", filter_key: "areaOfStudy", label: "Program", kind: "list", semantics: "facet", group: "Study", searchable: true },
      { key: "award_types", filter_key: "awardType", label: "Award type", kind: "list", semantics: "facet", group: "Award" },
      { key: "terms", filter_key: "term", label: "Term", kind: "list", semantics: "facet", group: "Award" },
      { key: "affiliations", filter_key: "affiliation", label: "Eligibility group", kind: "list", semantics: "gate", group: "Eligibility" },
    ],
  };

  function currentFilters() {
    const out = {};
    for (const [key, control] of Object.entries(filterControls)) {
      out[key] = control.value;
    }
    return out;
  }

  function activeFilterCount() {
    let n = 0;
    for (const control of Object.values(filterControls)) {
      const v = control.value;
      if (Array.isArray(v)) n += v.length ? 1 : 0;
      else if (v && typeof v === "object") n += (v.min != null || v.max != null) ? 1 : 0;
      else if (v !== null && v !== undefined && v !== "") n += 1;
    }
    return n;
  }

  // Some facets ship a default selection, declared in tools/facets.py rather
  // than here. Only "Application status" uses one today: 2,164 of UofA's 2,428
  // awards are closed for this cycle, so an unfiltered corpus is mostly
  // expired. It is a default and not a hard filter because annual awards
  // reopen — clearing it brings them back.
  //
  // Selecting "Open" does NOT hide awards whose status is unstated: the facet
  // is a scalar "facet", and an award stating no value is unconstrained by it.
  // That is the load-bearing detail, since most sources publish no status at
  // all. Guarded by tests/test_filters.py.
  // --- lazily-loaded source shards ------------------------------------
  // Sources whose awards are restricted to one institution's own students are
  // not in awards.json; they sit in data/sources/<id>.json and load when a
  // visitor asks. The gate is the same in both directions: an award only
  // relevant to UofA students is also the award a UW student should not be
  // made to download.
  const loadedShards = new Set();

  // Shard loads are serialised through this chain. Each one ends in
  // rebuildFilters(), which snapshots the current selections, tears the filter
  // bar down and puts them back — so two overlapping loads can interleave such
  // that one snapshots the *other's* half-built controls and reads every
  // selection as empty. Restoring that empty snapshot then wipes both the
  // visitor's own filters and the pre-selected "Open" status default, which is
  // what hides 2,164 closed awards. Clicking six chips quickly was enough to
  // turn the closed-award default off and silently show all of them.
  let shardQueue = Promise.resolve();

  function renderSourceLoader(sources) {
    const shards = Object.values(sources || {}).filter(
      (s) => s.status === "active" && s.shard_path && s.award_count,
    );
    if (!shards.length) return;          // stays hidden; page works unchanged

    shards.sort((a, b) => b.award_count - a.award_count);
    el.sourceLoaderList.innerHTML = "";
    for (const source of shards) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "source-chip";
      btn.dataset.sourceId = source.id;
      btn.textContent = `+ ${source.short_name || source.name} (${source.award_count.toLocaleString()})`;
      btn.title = source.disclaimer || source.name;
      btn.addEventListener("click", () => loadShard(source, btn));
      el.sourceLoaderList.appendChild(btn);
    }
    el.sourceLoader.hidden = false;
  }

  function loadShard(source, btn) {
    if (loadedShards.has(source.id)) return shardQueue;
    // Claim it before queueing, so a double-click cannot enqueue two fetches of
    // the same shard.
    loadedShards.add(source.id);
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = `Loading ${source.short_name || source.name}\u2026`;
    shardQueue = shardQueue.then(() => fetchShard(source, btn));
    return shardQueue;
  }

  async function fetchShard(source, btn) {
    try {
      const resp = await fetch(`data/${source.shard_path}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const added = AwardSearch.addAwards(await resp.json());
      btn.classList.add("source-chip--loaded");
      btn.textContent = `\u2713 ${source.short_name || source.name} (${added.toLocaleString()})`;
      // New records bring new programs, faculties and statuses, so the filter
      // vocabulary has to be rebuilt -- while keeping what the visitor already
      // selected.
      rebuildFilters();
      applyFiltersAndSearch(true);
    } catch (e) {
      // A shard is an enhancement. Losing one must never break the page, so it
      // says so and leaves everything already loaded working. Same reasoning as
      // the guards around filters.json and ai-search.js.
      loadedShards.delete(source.id);   // allow a retry
      btn.disabled = false;
      btn.textContent = label;
      btn.classList.add("source-chip--failed");
      btn.title = `Couldn't load ${source.name}. Everything else still works.`;
    }
  }

  // buildFilters() appends, so re-running it without clearing would duplicate
  // every control. Selections are snapshotted and restored because the visitor
  // did not ask for their filters to be reset just because more data arrived.
  //
  // Only multi-selects are restored: range and bool controls expose no setter,
  // so an award-value range set before loading a shard reverts to unset. That
  // is a visible reset rather than a silently wrong filter, which is the right
  // way round, but it is a gap — give those controls a `set` if it starts to
  // matter.
  function rebuildFilters() {
    const previous = {};
    for (const [key, control] of Object.entries(filterControls)) {
      if (control && control.set) previous[key] = control.value;
    }
    el.filterBar.innerHTML = "";
    buildFilters();
    for (const [key, values] of Object.entries(previous)) {
      const control = filterControls[key];
      if (control && control.set) control.set(values);
    }
  }

  function applyFacetDefaults() {
    for (const facet of AwardSearch.activeFacets()) {
      if (!Array.isArray(facet.default) || !facet.default.length) continue;
      const control = filterControls[facet.filter_key];
      // `set` is MultiSelect-only; a range or bool control has no defaults.
      if (control && control.set) control.set(facet.default);
    }
  }

  function clearAllFilters() {
    for (const control of Object.values(filterControls)) {
      if (control.clear) control.clear();
    }
    applyFacetDefaults();
    applyFiltersAndSearch(true);
  }

  function snippetFor(award) {
    const text = award.award_description || award.eligibility_selection_criteria || "";
    // Detail text is multi-line (list items become their own lines); flatten
    // it for the card preview so the clamped snippet reads as one paragraph.
    return text.replace(/\s*\n\s*/g, " ");
  }

  function renderResults(reset) {
    if (reset) visibleCount = PAGE_SIZE;
    const toShow = currentResults.slice(0, visibleCount);

    el.resultSummary.textContent = currentResults.length
      ? `${currentResults.length} award${currentResults.length === 1 ? "" : "s"} found`
      : "No awards match your search/filters.";

    el.cardGrid.innerHTML = "";
    if (!toShow.length) {
      el.loadMoreRow.hidden = true;
      return;
    }

    toShow.forEach((award, i) => {
      const card = document.createElement("article");
      card.className = "award-card";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `View details for ${award.award_name}`);
      // Stagger only the first screenful; past that the delay would read as
      // lag rather than polish.
      if (i < 12) card.style.animationDelay = `${i * 25}ms`;

      const tags = [award.career, ...(award.levels || []).slice(0, 2), ...(award.terms || [])]
        .filter(Boolean);

      card.innerHTML = `
        <h3>${escapeHtml(award.award_name || "Untitled award")}</h3>
        ${statusBadge(award)}
        <div class="tag-row">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
        <p class="snippet">${escapeHtml(snippetFor(award))}</p>
      `;
      card.addEventListener("click", () => openModal(award));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openModal(award);
        }
      });
      el.cardGrid.appendChild(card);
    });

    el.loadMoreRow.hidden = visibleCount >= currentResults.length;
  }

  // Only rendered for a stated, non-open status. The overwhelming majority of
  // awards publish no status at all, and labelling those would be inventing a
  // fact about them — silence is not a closed window.
  const STATUS_BADGE = {
    Ended: "Closed for this cycle",
    Upcoming: "Not open yet",
  };

  function statusBadge(award) {
    const label = STATUS_BADGE[award.application_status];
    if (!label) return "";
    return `<p class="award-status">${escapeHtml(label)}</p>`;
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function fieldRow(label, value) {
    if (!value) return "";
    return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
  }

  function openModal(award) {
    el.modalBody.innerHTML = `
      <div class="modal-header">
        <h2>${escapeHtml(award.award_name || "Untitled award")}</h2>
        <button class="modal-close" id="modal-close-x" aria-label="Close">&times;</button>
      </div>
      ${statusBadge(award)}
      <div class="tag-row">
        ${[award.career, ...(award.levels || []), ...(award.terms || [])]
          .filter(Boolean).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
      </div>
      <dl>
        ${fieldRow("Award type", award.award_type)}
        ${fieldRow("Description", award.award_description)}
        ${fieldRow("Value", award.award_value_description)}
        ${fieldRow("Eligibility / selection criteria", award.eligibility_selection_criteria)}
        ${fieldRow("Area of study", award.area_of_study)}
        ${fieldRow("Affiliation", award.affiliation)}
        ${fieldRow("Application details", award.application_details)}
        ${fieldRow("Required supporting documents", award.required_supporting_documents)}
        ${fieldRow("Additional instructions", award.additional_instructions)}
        ${fieldRow("Contact", award.contact_detail)}
      </dl>
    `;
    document.getElementById("modal-close-x").addEventListener("click", () => closeModal());
    el.modalBackdrop.hidden = false;
    document.body.classList.add("modal-open");
    if (history.pushState) {
      history.pushState({ award: permalinkId(award) }, "", `?award=${encodeURIComponent(permalinkId(award))}`);
    }
  }

  function closeModal(skipHistory) {
    el.modalBackdrop.hidden = true;
    document.body.classList.remove("modal-open");
    if (!skipHistory && history.pushState) {
      history.pushState({}, "", window.location.pathname);
    }
  }

  // Permalinks now carry award_uid ("<source>:<native id>"), because award_id
  // is only unique within a single source. Links shared before that change
  // carry a bare award_id, so both forms resolve: uid first, then the legacy
  // bare id. Dropping the fallback would silently break every link already in
  // the wild.
  function findByPermalinkId(awards, id) {
    return awards.find((a) => a.award_uid === id) || awards.find((a) => a.award_id === id);
  }

  function permalinkId(award) {
    return award.award_uid || award.award_id;
  }

  function openAwardFromUrl(awards) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("award");
    if (!id) return;
    const award = findByPermalinkId(awards, id);
    if (award) openModal(award);
  }

  function applyFiltersAndSearch(reset) {
    const profile = Profile.get();
    currentResults = AwardSearch.run({
      query: queryOverride !== null ? queryOverride : el.searchInput.value,
      filters: currentFilters(),
      profile,
      matchModeEnabled: el.matchToggle.checked,
    });
    renderResults(reset !== false);
    return currentResults.length;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // Every filter is built from data/filters.json, which is compiled from
  // tools/facets.py. Adding a filter is a Python edit, not a JS one — and the
  // eligibility filters (province, citizenship, identity, grade floor) appear
  // here automatically once extraction populates them, because activeFacets()
  // hides any facet the current corpus has no values for.
  function buildFilters() {
    const onChange = () => applyFiltersAndSearch(true);
    // Emptied IN PLACE, never reassigned. ai-search.js is handed this exact
    // object once by AISearch.attach() and keeps the reference, so replacing it
    // with a fresh `{}` would leave the AI layer writing to controls that have
    // already been removed from the DOM — the AI would tick filters and nothing
    // would happen. Harmless while buildFilters() only ran once at boot;
    // rebuildFilters() (on loading a source shard) makes it reachable.
    for (const key of Object.keys(filterControls)) delete filterControls[key];

    const facets = AwardSearch.activeFacets();
    const byGroup = new Map();
    for (const facet of facets) {
      const group = facet.group || "Filters";
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push(facet);
    }

    for (const [groupName, groupFacets] of byGroup) {
      const section = document.createElement("div");
      section.className = "filter-group";
      const heading = document.createElement("span");
      heading.className = "filter-group__label";
      heading.textContent = groupName;
      section.appendChild(heading);
      el.filterBar.appendChild(section);

      for (const facet of groupFacets) {
        filterControls[facet.filter_key] = buildControl(section, facet, onChange);
      }
    }

    applyFacetDefaults();
  }

  function buildControl(mount, facet, onChange) {
    if (facet.kind === "range") return buildRangeControl(mount, facet, onChange);
    if (facet.kind === "bool") return buildBoolControl(mount, facet, onChange);

    const groups = AwardSearch.groupedValues(facet).map((g) => ({
      name: g.name,
      values: g.values,
    }));
    // MultiSelect already exposes { value, clear }, which is the whole
    // contract buildFilters needs from a control.
    return MultiSelect.create({
      mount,
      label: `Any ${facet.label.toLowerCase()}`,
      groups,
      onChange,
      searchable: Boolean(facet.searchable) || groups.reduce((n, g) => n + g.values.length, 0) > 12,
    });
  }

  function buildRangeControl(mount, facet, onChange) {
    const bounds = AwardSearch.rangeFor(facet) || { min: 0, max: 0 };
    const wrap = document.createElement("span");
    wrap.className = "filter-range";
    wrap.title = facet.help || "";
    const unit = facet.unit || "";
    const mkInput = (placeholder) => {
      const i = document.createElement("input");
      i.type = "number";
      i.className = "filter-range__input";
      i.placeholder = placeholder;
      i.setAttribute("aria-label", `${facet.label} ${placeholder}`);
      i.addEventListener("change", onChange);
      return i;
    };
    const label = document.createElement("span");
    label.className = "filter-range__label";
    label.textContent = facet.label;
    const min = mkInput(`min ${unit}${bounds.min}`.trim());
    const max = mkInput(`max ${unit}${bounds.max}`.trim());
    wrap.append(label, min, document.createTextNode("–"), max);
    mount.appendChild(wrap);

    return {
      get value() {
        const lo = min.value === "" ? null : Number(min.value);
        const hi = max.value === "" ? null : Number(max.value);
        return lo === null && hi === null ? null : { min: lo, max: hi };
      },
      clear() { min.value = ""; max.value = ""; },
    };
  }

  function buildBoolControl(mount, facet, onChange) {
    const select = document.createElement("select");
    select.className = "filter-bool";
    select.title = facet.help || "";
    select.setAttribute("aria-label", facet.label);
    for (const [value, text] of [["", `${facet.label}: any`], ["true", "Yes"], ["false", "No"]]) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = text;
      select.appendChild(opt);
    }
    select.addEventListener("change", onChange);
    mount.appendChild(select);
    return {
      get value() { return select.value === "" ? null : select.value === "true"; },
      clear() { select.value = ""; },
    };
  }

  function setupProfileEditor() {
    const profile = Profile.get();
    if (profile) {
      el.profileCareer.value = profile.career || "";
      el.profileLevel.value = profile.level || "";
      el.profileArea.value = (profile.areasOfStudy && profile.areasOfStudy[0]) || "";
    }
    el.matchToggle.checked = Profile.isMatchModeEnabled() && !!profile;

    el.editProfileBtn.addEventListener("click", () => {
      el.profileEditor.classList.toggle("open");
    });

    el.saveProfileBtn.addEventListener("click", () => {
      Profile.save({
        career: el.profileCareer.value,
        level: el.profileLevel.value,
        areasOfStudy: el.profileArea.value ? [el.profileArea.value] : [],
      });
      el.matchToggle.checked = true;
      Profile.setMatchModeEnabled(true);
      el.profileEditor.classList.remove("open");
      applyFiltersAndSearch(true);
    });

    el.matchToggle.addEventListener("change", () => {
      Profile.setMatchModeEnabled(el.matchToggle.checked);
      if (el.matchToggle.checked && !Profile.get()) {
        el.profileEditor.classList.add("open");
      }
      applyFiltersAndSearch(true);
    });
  }

  async function main() {
    let awards, meta;
    try {
      [awards, meta] = await Promise.all([
        fetch("data/awards.json").then((r) => r.json()),
        fetch("data/meta.json").then((r) => r.json()),
      ]);
    } catch (e) {
      el.resultSummary.textContent = "Couldn't load award data. Please try refreshing the page.";
      return;
    }

    // The filter spec is fetched separately and deliberately NOT awaited with
    // the two required files: a missing or malformed filters.json must degrade
    // to the built-in fallback, never blank the page. Same reasoning as the
    // guard around ai-search.js.
    let filterSpec = null;
    try {
      const resp = await fetch("data/filters.json");
      if (resp.ok) filterSpec = await resp.json();
    } catch (e) {
      filterSpec = null;
    }

    AwardSearch.init(awards, filterSpec || FALLBACK_FILTER_SPEC);
    buildFilters();

    // Also optional, and for the same reason as filters.json: without
    // sources.json the visitor simply gets the core corpus with no offer to
    // load more, which is a smaller page rather than a broken one.
    try {
      const resp = await fetch("data/sources.json");
      if (resp.ok) renderSourceLoader(await resp.json());
    } catch (e) {
      /* no shard offers; core corpus is fully usable */
    }

    populateSelect(el.profileCareer, AwardSearch.uniqueScalarValues("career"), "No preference");
    populateSelect(el.profileLevel, AwardSearch.uniqueValues("levels"), "No preference");
    populateSelect(el.profileArea, AwardSearch.uniqueValues("areas_of_study"), "No preference");

    setupProfileEditor();

    // Editing the box means the student is driving again, so drop any AI
    // keyword override. Missing either of these two resets is the way this
    // feature breaks plain search: the box would appear to stop responding
    // after one AI query.
    el.searchInput.addEventListener("input", debounce(() => {
      // Keep the AI's override only if the box still holds the exact question
      // it interpreted. Without this check, an edge-cached AI answer (~100ms)
      // lands *before* this 150ms debounce fires, which then wiped the
      // override and Fuse-searched the whole sentence — 52 results became 1.
      const aiOwns = typeof AISearch !== "undefined" && AISearch.ownsQuery(el.searchInput.value);
      if (!aiOwns) queryOverride = null;
      applyFiltersAndSearch(true);
    }, 150));
    el.clearFilters.addEventListener("click", () => {
      el.searchInput.value = "";
      queryOverride = null;
      MultiSelect.clearAll();
      // Reset means "back to how the page loaded", not "show me 2,164 expired
      // awards". Without this, the Reset button is the one click that floods
      // the results with closed opportunities.
      applyFacetDefaults();
      // `typeof`, not `window.AISearch`: js/ai-search.js declares AISearch with
      // `const`, which is a lexical global and never a property of `window`
      // (same as MultiSelect and AwardSearch).
      if (typeof AISearch !== "undefined") {
        try { AISearch.reset(); } catch (e) { /* AI layer is optional */ }
      }
      applyFiltersAndSearch(true);
    });
    el.loadMoreBtn.addEventListener("click", () => {
      visibleCount += PAGE_SIZE;
      renderResults(false);
    });
    el.modalBackdrop.addEventListener("click", (e) => {
      if (e.target === el.modalBackdrop) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !el.modalBackdrop.hidden) closeModal();
    });
    window.addEventListener("popstate", () => {
      const params = new URLSearchParams(window.location.search);
      if (!params.get("award")) closeModal(true);
    });

    if (meta && meta.last_updated) {
      el.freshnessNote.textContent = `Data last refreshed: ${meta.last_updated} · ${meta.total_awards} awards indexed`;
    }

    applyFiltersAndSearch(true);
    openAwardFromUrl(awards);

    // Optional AI layer, wired up last and guarded on both sides: if
    // js/ai-search.js is missing or throws, everything above has already run
    // and the page is exactly the site it was before this feature existed.
    if (typeof AISearch !== "undefined") {
      try {
        AISearch.attach({
          input: el.searchInput,
          controls: filterControls,
          rerun: () => applyFiltersAndSearch(true),
          getQuery: () => el.searchInput.value,
          setQuery: (v) => { el.searchInput.value = v; },
          getQueryOverride: () => queryOverride,
          // null clears the override; a string (including "") sets it.
          setQueryOverride: (v) => { queryOverride = typeof v === "string" ? v : null; },
        });
      } catch (e) {
        console.warn("AI search unavailable:", e);
      }
    }
  }

  main();
})();
