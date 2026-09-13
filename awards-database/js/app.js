(function () {
  const PAGE_SIZE = 50;
  let visibleCount = PAGE_SIZE;
  let currentResults = [];
  const filterControls = {};

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

  function currentFilters() {
    return {
      career: filterControls.career.value,
      level: filterControls.level.value,
      awardType: filterControls.awardType.value,
      term: filterControls.term.value,
      affiliation: filterControls.affiliation.value,
      areaOfStudy: filterControls.areaOfStudy.value,
    };
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
      history.pushState({ award: award.award_id }, "", `?award=${encodeURIComponent(award.award_id)}`);
    }
  }

  function closeModal(skipHistory) {
    el.modalBackdrop.hidden = true;
    document.body.classList.remove("modal-open");
    if (!skipHistory && history.pushState) {
      history.pushState({}, "", window.location.pathname);
    }
  }

  function openAwardFromUrl(awards) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("award");
    if (!id) return;
    const award = awards.find((a) => a.award_id === id);
    if (award) openModal(award);
  }

  function applyFiltersAndSearch(reset) {
    const profile = Profile.get();
    currentResults = AwardSearch.run({
      query: el.searchInput.value,
      filters: currentFilters(),
      profile,
      matchModeEnabled: el.matchToggle.checked,
    });
    renderResults(reset !== false);
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function buildFilters() {
    const onChange = () => applyFiltersAndSearch(true);
    const mk = (label, groups, searchable) =>
      MultiSelect.create({ mount: el.filterBar, label, groups, onChange, searchable });

    filterControls.career = mk("All careers", [{ values: AwardSearch.uniqueScalarValues("career") }]);
    filterControls.level = mk("All levels", [{ values: AwardSearch.uniqueValues("levels") }]);
    filterControls.awardType = mk("All award types", [{ values: AwardSearch.uniqueValues("award_types") }]);
    filterControls.term = mk("All terms", [{ values: AwardSearch.uniqueValues("terms") }]);
    filterControls.affiliation = mk("All affiliations", [{ values: AwardSearch.uniqueValues("affiliations") }]);
    // ~180 entries, so this one gets a type-ahead box plus the faculty-wide /
    // specific-program grouping.
    filterControls.areaOfStudy = mk("All areas of study", AwardSearch.areaOfStudyGroups(), true);
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

    AwardSearch.init(awards);
    buildFilters();

    populateSelect(el.profileCareer, AwardSearch.uniqueScalarValues("career"), "No preference");
    populateSelect(el.profileLevel, AwardSearch.uniqueValues("levels"), "No preference");
    populateSelect(el.profileArea, AwardSearch.uniqueValues("areas_of_study"), "No preference");

    setupProfileEditor();

    el.searchInput.addEventListener("input", debounce(() => applyFiltersAndSearch(true), 150));
    el.clearFilters.addEventListener("click", () => {
      el.searchInput.value = "";
      MultiSelect.clearAll();
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
  }

  main();
})();
