// Fuse.js setup + the combined search/filter/profile pipeline.
//
// Filtering is driven by data/filters.json, which is compiled from
// tools/facets.py. The two implementations are deliberately mirror images: the
// facet/gate distinction and the "unstated is unconstrained" rule are stated
// once in Python and once here, and tests/test_filters.py pins the Python
// side. Previously this file hardcoded six filters with subtly different
// semantics from the CLI's — most visibly, it treated affiliation as an OR
// facet while find_awards.py treated it as an eligibility gate, so the site
// and the tool disagreed about who qualified for 94 awards.
const AwardSearch = (() => {
  let fuse = null;
  let allAwards = [];
  let spec = { facets: [], groups: [] };

  const FACULTY_WIDE_SUFFIX = "Faculty - All Programs";

  function init(awards, filterSpec) {
    allAwards = awards;
    if (filterSpec && Array.isArray(filterSpec.facets)) spec = filterSpec;
    fuse = new Fuse(awards, {
      includeScore: false,
      threshold: 0.32,
      ignoreLocation: true,
      keys: [
        { name: "award_name", weight: 0.4 },
        { name: "award_description", weight: 0.2 },
        { name: "eligibility_selection_criteria", weight: 0.2 },
        { name: "area_of_study", weight: 0.15 },
        { name: "affiliation", weight: 0.05 },
      ],
    });
  }

  // Merging a lazily-loaded source shard. The Fuse index is rebuilt rather
  // than appended to, because Fuse has no public incremental-add API and a
  // stale index silently stops matching the new records.
  //
  // Deduplicated on award_uid: a double-click on "load" or a re-render must not
  // double the corpus, and award_uid is the only globally unique key (award_id
  // is unique only WITHIN a source).
  function addAwards(incoming) {
    if (!Array.isArray(incoming) || !incoming.length) return 0;
    const known = new Set(allAwards.map((a) => a.award_uid));
    const fresh = incoming.filter((a) => a.award_uid && !known.has(a.award_uid));
    if (!fresh.length) return 0;
    init(allAwards.concat(fresh), spec);
    return fresh.length;
  }

  function count() {
    return allAwards.length;
  }

  function getSpec() {
    return spec;
  }

  // Facets a given corpus actually has values for. A filter with nothing
  // behind it is noise, so the UI hides it — that is what keeps the eligibility
  // filters invisible until extraction has run, without any extra flags.
  function activeFacets() {
    return spec.facets.filter((f) => {
      if (f.kind === "range" || f.kind === "bool") {
        return allAwards.some((a) => a[f.key] !== null && a[f.key] !== undefined);
      }
      return valuesFor(f).length > 0;
    });
  }

  function textSearch(query) {
    const q = (query || "").trim();
    if (!q) return allAwards;
    return fuse.search(q).map((r) => r.item);
  }

  function awardValues(award, facet) {
    const raw = award[facet.key];
    if (raw === null || raw === undefined) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  /**
   * One facet's verdict for one award. Mirrors facets.matches() in Python.
   *
   * "facet"  an award that states no value is UNCONSTRAINED and passes. This
   *          is why a source that publishes no program taxonomy (Alberta
   *          Student Aid) does not vanish when a program filter is applied.
   * "gate"   an award that states values is RESTRICTED to them; one that
   *          states none is open to everyone. Affiliation works this way.
   */
  function matchesFacet(award, facet, selected) {
    if (facet.kind === "range") {
      if (!selected) return true;
      const lo = selected.min ?? null;
      const hi = selected.max ?? null;
      if (lo === null && hi === null) return true;
      const value = award[facet.key];
      // Deliberate exception to "unstated is unconstrained" — see the matching
      // comment in tools/facets.py. Award value is a preference, not an
      // eligibility criterion, and letting nulls through made this filter
      // match 2,795 of 4,016 awards.
      if (value === null || value === undefined) return false;
      if (lo !== null && value < lo) return false;
      if (hi !== null && value > hi) return false;
      return true;
    }

    if (facet.kind === "bool") {
      if (selected === null || selected === undefined || selected === "") return true;
      const has = Boolean(award[facet.key]);
      return has === (selected === true || selected === "true");
    }

    const values = awardValues(award, facet);

    if (facet.semantics === "tag") {
      // Browse semantics: no selection shows everything; a selection shows
      // only awards carrying it. See tools/facets.py for why affiliation is a
      // tag and not a gate.
      if (!selected || selected.length === 0) return true;
      return values.some((v) => selected.includes(v));
    }

    if (facet.semantics === "gate") {
      if (values.length === 0) return true;
      const chosen = selected || [];
      // An empty selection is "not answered", not "none of these apply". See
      // the matching comment in tools/facets.py: declaring nothing must hide
      // nothing.
      if (chosen.length === 0) return true;
      return values.some((v) => chosen.includes(v));
    }

    if (!selected || selected.length === 0) return true;
    if (values.length === 0) return true;
    return values.some((v) => selected.includes(v));
  }

  function passesStructuredFilters(award, filters) {
    for (const facet of spec.facets) {
      if (!matchesFacet(award, facet, (filters || {})[facet.filter_key])) return false;
    }
    return true;
  }

  function run({ query, filters, profile, matchModeEnabled }) {
    let results = textSearch(query);
    results = results.filter((a) => passesStructuredFilters(a, filters || {}));
    if (matchModeEnabled && profile) {
      results = results.filter((a) => Profile.matchesAward(a, profile));
    }
    return results;
  }

  // Distinct values for a facet, most-common first then alphabetical, each
  // with its count so the UI can show how much a filter would leave.
  function valuesFor(facet) {
    const counts = new Map();
    for (const award of allAwards) {
      for (const v of awardValues(award, facet)) {
        if (v === null || v === undefined || v === "") continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .map(([value, count]) => ({ value, count }));
  }

  function rangeFor(facet) {
    const values = allAwards
      .map((a) => a[facet.key])
      .filter((v) => typeof v === "number" && !Number.isNaN(v));
    if (!values.length) return null;
    return { min: Math.min(...values), max: Math.max(...values) };
  }

  /**
   * Areas of study split into faculty-wide entries vs individual programs.
   *
   * The source directories list these as one flat alphabetical list and expose
   * no program-to-faculty mapping, so grouping programs under their faculty
   * isn't derivable from the data. This two-way split is the grouping the data
   * does support.
   */
  function groupedValues(facet) {
    const values = valuesFor(facet).map((v) => v.value);
    if (facet.filter_key !== "areaOfStudy") return [{ name: null, values }];
    const facultyWide = values.filter(
      (v) => String(v).includes(FACULTY_WIDE_SUFFIX) || v === "All Programs"
    );
    const programs = values.filter((v) => !facultyWide.includes(v));
    const groups = [];
    if (facultyWide.length) groups.push({ name: "Faculty-wide", values: facultyWide });
    if (programs.length) groups.push({ name: "Specific programs", values: programs });
    return groups;
  }

  // Retained for backward compatibility with any caller still using the
  // pre-spec API (ai-search.js reads these).
  function uniqueValues(arrayKey) {
    return valuesFor({ key: arrayKey }).map((v) => v.value).sort((a, b) => a.localeCompare(b));
  }
  function uniqueScalarValues(key) {
    return uniqueValues(key);
  }
  function areaOfStudyGroups() {
    return groupedValues({ filter_key: "areaOfStudy", key: "areas_of_study" });
  }

  return {
    init, addAwards, count, run, getSpec, activeFacets, valuesFor, rangeFor, groupedValues,
    matchesFacet, passesStructuredFilters,
    uniqueValues, uniqueScalarValues, areaOfStudyGroups,
  };
})();
