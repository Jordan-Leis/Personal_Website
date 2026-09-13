// Fuse.js setup + the combined search/filter/profile pipeline.
const AwardSearch = (() => {
  let fuse = null;
  let allAwards = [];

  const FACULTY_WIDE_SUFFIX = "Faculty - All Programs";

  function init(awards) {
    allAwards = awards;
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

  function textSearch(query) {
    const q = query.trim();
    if (!q) return allAwards;
    return fuse.search(q).map((r) => r.item);
  }

  // Each filter holds an array of selected values. Empty = no constraint.
  // Values within one filter are OR'd; separate filters are AND'd.
  function matchesAny(awardValues, selected) {
    if (!selected || selected.length === 0) return true;
    if (!awardValues || awardValues.length === 0) return false;
    return selected.some((v) => awardValues.includes(v));
  }

  function passesStructuredFilters(award, f) {
    if (f.career && f.career.length && !f.career.includes(award.career)) return false;
    if (!matchesAny(award.levels, f.level)) return false;
    if (!matchesAny(award.award_types, f.awardType)) return false;
    if (!matchesAny(award.terms, f.term)) return false;
    if (!matchesAny(award.affiliations, f.affiliation)) return false;
    if (!matchesAny(award.areas_of_study, f.areaOfStudy)) return false;
    return true;
  }

  function run({ query, filters, profile, matchModeEnabled }) {
    let results = textSearch(query || "");
    results = results.filter((a) => passesStructuredFilters(a, filters || {}));
    if (matchModeEnabled && profile) {
      results = results.filter((a) => Profile.matchesAward(a, profile));
    }
    return results;
  }

  function uniqueValues(arrayKey) {
    const set = new Set();
    for (const award of allAwards) {
      for (const v of award[arrayKey] || []) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function uniqueScalarValues(key) {
    const set = new Set();
    for (const award of allAwards) {
      if (award[key]) set.add(award[key]);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Areas of study split into faculty-wide entries vs individual programs.
   *
   * The source directory lists these as one flat alphabetical list and exposes
   * no program-to-faculty mapping (a faculty filter there returns only awards
   * tagged faculty-wide — it does not expand into that faculty's programs), so
   * grouping programs under their faculty isn't derivable from the data. This
   * two-way split is the grouping the data does support.
   */
  function areaOfStudyGroups() {
    const all = uniqueValues("areas_of_study");
    const facultyWide = all.filter((v) => v.includes(FACULTY_WIDE_SUFFIX) || v === "All Programs");
    const programs = all.filter((v) => !facultyWide.includes(v));
    const groups = [];
    if (facultyWide.length) groups.push({ name: "Faculty-wide", values: facultyWide });
    if (programs.length) groups.push({ name: "Specific programs", values: programs });
    return groups;
  }

  return { init, run, uniqueValues, uniqueScalarValues, areaOfStudyGroups };
})();
