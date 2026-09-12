/**
 * Accessible multi-select dropdown (checkboxes in a popover).
 *
 * Replaces plain <select> so several values can be active per filter at once.
 * Long lists (area of study has ~180 entries) get a type-ahead box, and
 * options can be grouped under headings.
 */
const MultiSelect = (() => {
  const instances = [];
  let openInstance = null;

  function create({ mount, label, groups, onChange, searchable = false }) {
    const selected = new Set();

    const root = document.createElement("div");
    root.className = "ms";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ms-button";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", label);

    const panel = document.createElement("div");
    panel.className = "ms-panel";
    panel.hidden = true;

    let searchInput = null;
    if (searchable) {
      searchInput = document.createElement("input");
      searchInput.type = "search";
      searchInput.className = "ms-search";
      searchInput.placeholder = "Type to filter…";
      searchInput.setAttribute("aria-label", `Filter ${label} options`);
      panel.appendChild(searchInput);
    }

    const list = document.createElement("div");
    list.className = "ms-list";
    panel.appendChild(list);

    const rows = [];
    for (const group of groups) {
      let heading = null;
      if (group.name) {
        heading = document.createElement("div");
        heading.className = "ms-group-heading";
        heading.textContent = group.name;
        list.appendChild(heading);
      }
      const groupRows = [];
      for (const value of group.values) {
        const row = document.createElement("label");
        row.className = "ms-option";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = value;
        cb.addEventListener("change", () => {
          if (cb.checked) selected.add(value);
          else selected.delete(value);
          syncButton();
          onChange(Array.from(selected));
        });

        const text = document.createElement("span");
        text.textContent = value;

        row.appendChild(cb);
        row.appendChild(text);
        list.appendChild(row);
        const entry = { row, value, lower: value.toLowerCase(), cb };
        rows.push(entry);
        groupRows.push(entry);
      }
      if (heading) heading._rows = groupRows;
    }

    function syncButton() {
      if (selected.size === 0) {
        button.textContent = label;
        button.classList.remove("has-selection");
      } else if (selected.size === 1) {
        button.textContent = Array.from(selected)[0];
        button.classList.add("has-selection");
      } else {
        button.textContent = `${label.replace(/^All /, "")}: ${selected.size} selected`;
        button.classList.add("has-selection");
      }
    }

    function applySearchFilter(term) {
      const t = term.trim().toLowerCase();
      for (const r of rows) {
        r.row.hidden = t !== "" && !r.lower.includes(t);
      }
      // Hide a group heading when everything under it is filtered out.
      for (const h of list.querySelectorAll(".ms-group-heading")) {
        h.hidden = (h._rows || []).every((r) => r.row.hidden);
      }
    }

    if (searchInput) {
      searchInput.addEventListener("input", () => applySearchFilter(searchInput.value));
      // Keep typing inside the panel from closing it
      searchInput.addEventListener("click", (e) => e.stopPropagation());
    }

    function open() {
      if (openInstance && openInstance !== api) openInstance.close();
      panel.hidden = false;
      root.classList.add("open");
      button.setAttribute("aria-expanded", "true");
      openInstance = api;
      if (searchInput) searchInput.focus();
    }

    function close() {
      panel.hidden = true;
      root.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
      if (openInstance === api) openInstance = null;
    }

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      if (panel.hidden) open();
      else close();
    });

    panel.addEventListener("click", (e) => e.stopPropagation());

    root.appendChild(button);
    root.appendChild(panel);
    mount.appendChild(root);

    const api = {
      get value() {
        return Array.from(selected);
      },
      clear() {
        selected.clear();
        for (const r of rows) r.cb.checked = false;
        if (searchInput) {
          searchInput.value = "";
          applySearchFilter("");
        }
        syncButton();
      },
      close,
      root,
    };

    syncButton();
    instances.push(api);
    return api;
  }

  // One document-level handler closes whichever panel is open.
  document.addEventListener("click", () => {
    if (openInstance) openInstance.close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openInstance) openInstance.close();
  });

  return { create, clearAll: () => instances.forEach((i) => i.clear()) };
})();
