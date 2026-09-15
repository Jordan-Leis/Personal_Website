import { rpc } from "./api.js";
import {
  CONTRIBUTION,
  node,
  button,
  demographics,
  errorBox,
  store,
} from "./shared.js";
const app = document.querySelector("#app");
const box = node("div", undefined, "narrow");
app.append(box);
let busy = false;
box.innerHTML =
  '<p class="eyebrow">Contribute a human voice</p><h1 style="font-size:3rem">Write a little.<br>Help us learn.</h1><p>Contribute 60–300 words in your own words, without AI assistance. Please include no personal contact details or private information.</p><p>By contributing, you confirm you are 18+, wrote the text yourself, and have the right to share it. You grant permission to display it anonymously in this experiment and use it in research and aggregate reporting. Submissions are reviewed before use. There is no payment.</p><p>Do not paste copyrighted passages. Because submissions are anonymous, we cannot promise to identify or withdraw your text later. <a href="about.html">Data use and contact</a>.</p>';
const label = node("label", undefined, "check"),
  check = node("input");
check.type = "checkbox";
label.append(
  check,
  node("span", "I understand and agree to contribute under these terms."),
);
const go = button("Show my prompt →", prompt, "primary");
go.disabled = true;
check.onchange = () => (go.disabled = !check.checked);
box.append(label, go);
async function prompt() {
  if (busy) return;
  busy = true;
  go.disabled = true;
  try {
    const draft = store.get("writing");
    const p = draft?.prompt || (await rpc("get_prompt_for_submission"));
    if (!p) throw new Error("No prompt");
    box.replaceChildren(
      node("p", "Your contribution", "eyebrow"),
      node("h2", p.text, "prompt"),
      node(
        "p",
        `Aim for about ${p.target_words} words. Any 60–300 words are welcome. Write an original encyclopedia-style introduction about a subject in this topic group.`,
      ),
    );
    const area = node("textarea");
    area.setAttribute("aria-label", "Your writing");
    area.value = draft?.text || "";
    area.maxLength = 20000;
    const count = node("p", "", "status");
    count.setAttribute("aria-live", "polite");
    const d = demographics();
    const request = draft?.request || crypto.randomUUID();
    let pending = draft?.pending || null;
    if (pending) {
      area.value = pending.p_text;
      for (const s of d.element.querySelectorAll("select"))
        s.value = pending.p_demographics[s.name] || "";
    }
    const submit = button(
      "Submit writing →",
      async () => {
        if (busy) return;
        busy = true;
        submit.disabled = true;
        area.disabled = true;
        try {
          pending ||= {
            p_prompt_id: p.id,
            p_text: area.value,
            p_demographics: d.values(),
            p_request_id: request,
            p_consent_version: CONTRIBUTION,
          };
          store.set("writing", {
            prompt: p,
            text: area.value,
            request,
            pending,
          });
          await rpc("submit_writing", pending);
          pending = null;
          store.remove("writing");
          box.replaceChildren(
            node("p", "Contribution received", "eyebrow"),
            node("h2", "Thank you for writing."),
            node(
              "p",
              "Your passage is pending review. It will only appear in the experiment after curation.",
            ),
          );
          const a = node("a", "Back to the quiz →", "button primary");
          a.href = "./";
          box.append(a);
        } catch {
          errorBox(
            box,
            "Your submission could not be confirmed. Your draft is saved in this tab. Retry with the same text to avoid a duplicate.",
          );
        } finally {
          busy = false;
          area.disabled = !!pending;
          update();
        }
      },
      "primary",
    );
    function update() {
      const n = area.value.trim() ? area.value.trim().split(/\s+/u).length : 0;
      count.textContent = `${n} / 300 words · minimum 60`;
      submit.disabled = busy || n < 60 || n > 300;
      if (area.isConnected)
        store.set("writing", { prompt: p, text: area.value, request, pending });
      area.disabled = !!pending;
      d.element
        .querySelectorAll("select")
        .forEach((s) => (s.disabled = !!pending));
    }
    area.oninput = update;
    box.append(area, count, node("h3", "Optional context"), d.element, submit);
    busy = false;
    update();
  } catch {
    errorBox(
      box,
      "Could not load a prompt. Please reconnect and retry.",
      prompt,
    );
    go.disabled = false;
  } finally {
    busy = false;
  }
}
