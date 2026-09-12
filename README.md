# jordanleis.com

Static site on GitHub Pages. `index.html` is the desktop; Jekyll (run by GitHub Pages on every push to `main`) builds the blog.

## Adding a post

1. Create `_posts/YYYY-MM-DD-slug.md`.
2. Start it with frontmatter:
   ```
   ---
   title: "Post title"
   date: YYYY-MM-DD
   tags: [fpga, timing]   # optional
   ---
   ```
3. Write Markdown below it. Fence code as ```` ```verilog ```` for SystemVerilog.
4. Commit and push. The post appears at `/blog/slug/` and in Files → posts and the browser at `/blog/`.

`_posts/2026-09-10-hello-world.md` is a placeholder showing the format.

## Previewing a branch

Ruby isn't required locally. Push a non-`main` branch and the `jekyll-check` workflow builds the site with GitHub's own Pages builder and uploads `_site` as an artifact (`site-seeded` and `site-empty`). Download both artifacts from a specific successful run, then serve each with a static server:

```sh
gh run download <run-id> -n site-seeded -D /tmp/jordanleis-preview/site-seeded
gh run download <run-id> -n site-empty -D /tmp/jordanleis-preview/site-empty
python3 -m http.server 8765 --bind 127.0.0.1 --directory /tmp/jordanleis-preview/site-seeded
```

Serve `site-empty` on port 8766 in a second terminal to check the empty post list. Stop each server with Ctrl+C. Use artifacts from the commit under review so that the desktop and blog layouts come from the same build. The check workflow verifies branches; production continues to build from `main`.

## How it is put together

The desktop uses vanilla HTML, CSS, and JavaScript. There is no application build step; GitHub Pages runs Jekyll to render the blog and its post list.

| File or directory | Purpose |
| --- | --- |
| `index.html` | Desktop markup, application windows, and the Liquid post-list template. |
| `assets/css/desktop.css` | Desktop shell, application layouts, responsive rules, and animations. |
| `assets/js/projects.js` | Verified project descriptions, links, folder order, and terminal-tree annotations. |
| `assets/js/desktop.js` | Window management, dock, app grid, boot/greeting, Files, browser, and link routing. |
| `_posts/`, `blog/index.html`, `_layouts/` | Jekyll posts, blog listing, and standalone/embedded terminal layouts. |
| `assets/css/syntax.css` | Blog code highlighting. |
| `assets/icons/yaru/` | Bundled desktop icons; attribution below. |

Edit `PROJECTS` to update a project. Entries retain their array order within each folder; `PROJECT_FOLDERS` controls folder order. `slug` and optional `note` provide the terminal tree text. Keep links null when unavailable: Linxicon currently displays “Repository not public yet.” without an outgoing link.

Files opens at Projects, with hardware, papers, and software folders. Select an item for details; double-click or press Enter for its primary action. On touch screens, select an item and use its details action. Home also contains posts, About, Contact, and Resume. Trash is an empty view; muted sidebar entries and decorative toolbar controls have no action.

The Blog launcher opens `/blog/` in the desktop browser. Files → Home → posts provides another way to open posts. A URL such as `/?open=/blog/hello-world/` opens a same-origin page after boot. The standalone blog pages include an “open on desktop” link.

The dock opens or raises applications; clicking the focused application minimizes it. Orange dots remain for minimized applications. Alt+Tab cycles through open applications, including minimized ones. Escape dismisses the app grid or closes the focused window when keyboard focus is on the desktop. Boot and greeting animations can be skipped with a key or pointer press, and respect reduced-motion preferences.

## Browser destinations

GitHub does not allow its pages to be embedded. Repository links therefore load [github1s](https://github1s.com/), a third-party repository viewer, inside the desktop. The address bar and “Open in browser ↗” link retain the original GitHub URL. The GitHub profile launcher displays the `Jordan-Leis/Jordan-Leis` profile README repository.

Resume links use Google Drive's preview endpoint inside the frame. LinkedIn opens in a new tab, and email links invoke the visitor's mail application. Other destinations load directly in the frame. If the frame reports an error or does not load within 15 seconds, the browser offers an external link; that link is always available in the toolbar. Third-party availability and embedding policies can change independently of this site.

## Icon attribution

The 19 PNGs in `assets/icons/yaru/` are from the [Yaru icon theme](https://github.com/ubuntu/yaru), by the Yaru contributors, distributed under [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/). See the [upstream icon license](https://github.com/ubuntu/yaru/blob/master/icons/LICENSE_CCBYSA).

The PNG artwork is bundled without pixel edits and scaled with CSS. Repository emblems are separate SVG overlays. Upstream sources are in [`icons/Yaru/48x48@2x/`](https://github.com/ubuntu/yaru/tree/master/icons/Yaru/48x48%402x), in the following categories:

| Category | Bundled filenames |
| --- | --- |
| `apps` | `filemanager-app.png`, `org.gnome.TextEditor.png`, `system-settings.png`, `terminal-app.png`, `webbrowser-app.png` |
| `places` | `folder-documents.png`, `folder-download.png`, `folder-open.png`, `folder.png`, `user-desktop.png`, `user-home.png`, `user-trash.png` |
| `mimetypes` | `application-json.png`, `application-pdf.png`, `text-html.png`, `text-markdown.png`, `text-x-generic.png`, `text-x-script.png` |
| `actions` | `document-open-recent.png` |

This desktop uses an original CSS/SVG wallpaper and generic application branding. It is not affiliated with Ubuntu, Canonical, Mozilla, or GitHub.
