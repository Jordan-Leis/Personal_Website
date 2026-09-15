export const CONSENT = "pilot-2026-09-v1";
export const CONTRIBUTION = "contribution-2026-09-v1";
export function node(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
export function button(text, action, cls = "") {
  const b = node("button", text, cls);
  b.type = "button";
  b.addEventListener("click", action);
  return b;
}
export const store = {
  get(k) {
    try {
      return JSON.parse(sessionStorage.getItem("avh:" + k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      sessionStorage.setItem("avh:" + k, JSON.stringify(v));
    } catch {}
  },
  remove(k) {
    try {
      sessionStorage.removeItem("avh:" + k);
    } catch {}
  },
};
export function demographics() {
  const form = node("div", undefined, "fields");
  const choices = {
    ai_use: ["AI tools: how often?", "never", "monthly", "weekly", "daily"],
    affiliation: [
      "University of Waterloo affiliation",
      "student",
      "staff",
      "faculty",
      "alumni",
      "none",
    ],
    faculty: [
      "Faculty (if applicable)",
      "arts",
      "engineering",
      "environment",
      "health",
      "math",
      "science",
      "other",
    ],
    native_english: ["Is English a native language?", "yes", "no"],
    age_bracket: ["Age bracket", "18-24", "25-34", "35-44", "45-54", "55+"],
  };
  for (const [key, [title, ...options]] of Object.entries(choices)) {
    const label = node("label", title);
    const s = node("select");
    s.name = key;
    s.append(new Option("Prefer not to answer", ""));
    options.forEach((x) => s.append(new Option(x, x)));
    label.append(s);
    form.append(label);
  }
  return {
    element: form,
    values() {
      return Object.fromEntries(
        [...form.querySelectorAll("select")]
          .filter((s) => s.value)
          .map((s) => [s.name, s.value]),
      );
    },
  };
}
export function errorBox(parent, message, retry) {
  const old = parent.querySelector(".error");
  old?.remove();
  const e = node("div", undefined, "error");
  e.setAttribute("role", "alert");
  e.append(node("p", message));
  if (retry) e.append(button("Retry", retry));
  parent.append(e);
}
export function attribution(s) {
  const small = node("small");
  small.append("Topic source: ");
  const a = node("a", s.attribution?.title || "Source");
  const url = s.attribution?.url;
  if (url?.startsWith("https://en.wikipedia.org/wiki/")) a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  small.append(a, " · ");
  const info = node("a", "Reuse & credits");
  info.href = "about.html#sources";
  info.target = "_blank";
  info.rel = "noopener";
  small.append(info);
  return small;
}
export function focusMain() {
  document.querySelector("main").focus();
}
