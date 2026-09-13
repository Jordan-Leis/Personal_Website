// "Match my profile" — a lightweight client-side quick filter.
// Nothing here ever leaves the browser: it's plain localStorage.
const Profile = (() => {
  const STORAGE_KEY = "awardsMirror.profile.v1";
  const MODE_KEY = "awardsMirror.matchModeEnabled";

  function get() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function save({ career, level, areasOfStudy }) {
    const profile = {
      profileVersion: 1,
      career: career || null,
      level: level || null,
      areasOfStudy: areasOfStudy && areasOfStudy.length ? areasOfStudy : [],
      setAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {
      /* localStorage unavailable (private mode etc.) — profile just won't persist */
    }
    return profile;
  }

  function clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  function isMatchModeEnabled() {
    try {
      return localStorage.getItem(MODE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function setMatchModeEnabled(enabled) {
    try {
      localStorage.setItem(MODE_KEY, enabled ? "1" : "0");
    } catch (e) {}
  }

  // An award "matches" a profile field if the award has no restriction on
  // that field at all, OR the profile's value is among the award's values.
  function matchesAward(award, profile) {
    if (!profile) return true;

    if (profile.career && award.career) {
      if (award.career !== profile.career) return false;
    }

    if (profile.level && award.levels && award.levels.length) {
      if (!award.levels.includes(profile.level)) return false;
    }

    if (profile.areasOfStudy && profile.areasOfStudy.length && award.areas_of_study && award.areas_of_study.length) {
      const overlaps = profile.areasOfStudy.some((a) => award.areas_of_study.includes(a));
      if (!overlaps) return false;
    }

    // Deliberately no citizenship matching: the source data doesn't capture
    // citizenship per award (see the About page), so faking a match here
    // would imply precision the underlying data can't back up.
    return true;
  }

  return { get, save, clear, isMatchModeEnabled, setMatchModeEnabled, matchesAward };
})();
