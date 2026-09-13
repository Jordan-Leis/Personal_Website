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

Serve `site-empty` on port 8766 in a second terminal to check the empty post list. Stop each server with Ctrl+C. Use artifacts from the commit under review so that the desktop and blog layouts come from the same build. The check workflow verifies branches; production publishes from `main` through the `pages.yml` workflow described below.

The same workflow runs the browser suites in `tests/browser/` against the seeded build: `desktop.spec.js` covers the window manager, browser routing, Files, terminal, Trash/Recent/Starred, pointer drags, Solitaire, media controls, boot/introduction timing, the nested-desktop crash, and a banned-phrase check; `atlas.spec.js` covers the Linxicon page. `npm test` runs the Solitaire rule and atlas unit tests. To run the browser suite locally, point it at a build directory:

```sh
npm ci
npx playwright install chromium
SITE_DIR=/tmp/jordanleis-preview/site-seeded npm run test:browser
```

`index.html` contains Liquid, so the suite cannot run against the source tree. External destinations and the YouTube player are stubbed in the tests; live playback and public-URL checks are manual.

## How it is put together

The desktop uses vanilla HTML, CSS, and JavaScript. There is no application build step; GitHub Pages runs Jekyll to render the blog and its post list.

| File or directory | Purpose |
| --- | --- |
| `index.html` | Desktop markup, application windows, and the Liquid post-list template. |
| `assets/css/desktop.css` | Desktop shell, application layouts, responsive rules, and animations. |
| `assets/js/projects.js` | Verified project descriptions, links, folder order, and terminal-tree annotations. |
| `assets/js/desktop.js` | Window management, dock, app grid, browser, and link routing. |
| `assets/js/session.js` | Root-owned in-memory filesystem, Recent, Starred, Trash, discoveries, volume, and nested-view registration. |
| `assets/js/pointer.js` | Shared pointer capture, drag threshold, drop targets, and cancellation. |
| `assets/js/apps.js` | Additional window/launcher markup and the system dropdown. |
| `assets/js/files.js` | Files navigation and shared document/project/shortcut entries. |
| `assets/js/terminal.js` | Boot, progressive introduction, simulated commands, and fake reboot. |
| `assets/js/media.js` | Photo viewer, native audio, and the shared official YouTube IFrame API loader. |
| `assets/js/gallery-data.js`, `assets/media/` | Photo labels, public thumbnail/display paths, and the supplied audio clip. |
| `assets/js/solitaire.js` | Dependency-free Klondike rules and mouse/touch rendering. |
| `_posts/`, `blog/index.html`, `_layouts/` | Jekyll posts, blog listing, and standalone/embedded terminal layouts. |
| `assets/css/syntax.css` | Blog code highlighting. |
| `assets/icons/yaru/` | Bundled desktop icons; attribution below. |

Edit `PROJECTS` to update a project. Entries retain their array order within each folder; `PROJECT_FOLDERS` controls folder order. `slug` and optional `note` provide the terminal tree text. Keep links null when unavailable: an entry with no `paper`, `repo`, or `site` displays “Repository not public yet.” without an outgoing link. A same-origin `site` such as `/linxicon-solver/` opens inside the desktop browser.

Files opens at Projects, with hardware, papers, and software folders. Select an item for details; double-click or press Enter for its primary action. On touch screens, select an item and use its Open action. Home provides Desktop, Documents, Downloads, Photos, Projects, posts, and Trash. Documents uses the existing portfolio text and Resume link. Desktop mirrors active shortcuts; deleting a shortcut leaves its application available in the app grid.

Use the details buttons to star items, move them to Trash, or restore their original locations. Mouse dragging also supports Trash drop targets. Trashing a folder hides its descendants from ordinary views, Recent, and Starred. Recent lists opened files once, newest first. The Show hidden files button and Ctrl+H in Files reveal dotfiles. Downloads contains a virtual video item and a hidden clues file. The remaining search/view/menu glyphs in the Files header are decorative.

Terminal input supports `help`, `ls [-a] [path]`, `pwd`, `cd`, `clear`, `whoami`, `date`, `cat`, and `echo`, plus safe simulations of the existing introduction commands. Paths use `/home/jordan` or `~`, relative paths, `.`/`..`, and quoted filenames. Up/Down browses command history. Input is rendered as text and never passed to a shell or evaluated as JavaScript; arbitrary pipelines are not implemented. `clear` clears the transcript without replaying the introduction. Easter egg commands are intentionally omitted from `help`.

The Blog launcher opens `/blog/` in the desktop browser. Files → Home → posts provides another way to open posts. A URL such as `/?open=/blog/hello-world/` opens a same-origin page after boot. The standalone blog pages include an “open on desktop” link.

The dock opens or raises applications; clicking the focused application minimizes it. Orange dots remain for minimized applications. Alt+Tab cycles through open applications, including minimized ones. Escape dismisses the app grid or closes the focused window when keyboard focus is on the desktop. Window headers, desktop shortcuts, Files items, and cards share a Pointer Events lifecycle that ends on release, cancellation, lost capture, blur, or page hiding. Files keeps vertical touch scrolling; touch users can use its accessible Trash/Restore actions.

Root boot runs on every full load for a randomized 6–8 seconds, including its transition. A key, pointer press, or Skip boot button skips it. The complete terminal introduction types over 12–15 seconds, then cycles its roles and settles on “I like to build.” Skip introduction or focus the input to finish immediately. Reduced motion reveals the final introduction without waiting. Raising or reopening Terminal does not replay it.

## Session, media, and games

All mutable state lives in memory. A real refresh restores the default filesystem, clears discoveries, restores volume to 50%, and deals a new game. A simulated recursive crash retains only discoveries and volume, disposes of nested frames/media, resets the other applications, and boots again. The root owns shared progress and audio; nested desktop views do not create additional audio engines or boot sequences. Opening the portfolio through three successive desktop browsers triggers the harmless two-second failure overlay before a third nested desktop is created. Depth-specific frame URLs keep actual nested documents bounded; messages are accepted only from registered same-origin views.

The system dropdown contains volume/mute controls and simulated connected `eduroam` and 87% battery indicators. Playback begins only through a user action. The subtle discovery tracker appears after the first discovery and turns gold at three; it remains above the mobile dock with space reserved below application windows.

Photos uses the eight supplied JPEG filenames as labels. `assets/media/photos/` contains WebP thumbnails (maximum edge 320 px) and display copies (maximum edge 1920 px), without upscaling. Derivatives preserve orientation/aspect ratio and remove metadata. The originals remain untouched in ignored `media-before-commit/`; shipped files use only public `/assets/media/` paths. `assets/media/audio/work-work.m4a` is an exact copy of the supplied clip. Update `gallery-data.js` alongside new optimized media. The viewer supports previous/next buttons and Left/Right arrow keys.

Music embeds the supplied YouTube playlist with visible video and play/pause, previous/next, seek, and available track information. The virtual `secret.mp4` item opens a YouTube video, not a downloaded or rehosted file. Both use the [official YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), an explicit origin, and a referrer policy suitable for player identification. A playlist track that YouTube reports as missing or not embeddable is skipped (at most once per track per session). If the API, the network, or playback itself fails, the player displays an external YouTube link and disables unavailable controls. Playback in a separate browser tab has its own volume controls and cannot follow the site slider. Minimized music may keep playing; closing its window or rebooting stops it.

Solitaire is draw-one Klondike with unlimited stock recycling. Select a face-up card or valid stack, then select a destination; mouse and touch pointer dragging also work. Tableau sequences descend with alternating colors, only kings fill empty columns, and foundations ascend from ace to king by suit. Exposed cards flip automatically. Undo restores the previous move, draw, or recycle. New Game deals again. Minimizing preserves the deal; refresh and fake reboot reset it. There is no scoring or external game dependency.

## Local Jekyll verification

For changes that must stay uncommitted, build locally without invoking CI. Use an isolated Ruby/Jekyll installation outside this repository; the expansion was checked with Ruby 3.3.6, Jekyll 3.10.0, and `kramdown-parser-gfm`. Copy the source to a temporary directory while excluding `.git`, `.agents`, `.codex`, `media-before-commit`, `_site`, and caches. Run Jekyll **from that temporary source directory** so layouts are resolved from the same copy:

```sh
JEKYLL_ENV=development jekyll build --destination /tmp/jordanleis-preview/development-seeded
JEKYLL_ENV=production jekyll build --destination /tmp/jordanleis-preview/production-seeded
```

Repeat from a second temporary copy with `_posts/` removed to check the empty-post cases. Serve each generated directory with a local HTTP server as in the artifact workflow above. Keep Playwright tooling, screenshots, downloaded toolchains, and test fixtures outside the repository. Build copies must exclude staging originals so missing public media paths cannot be masked by the source directory.

## Linxicon Semantic Atlas

`/linxicon-solver/` is a standalone static page, with `/linixcon-solver/`
redirecting to it. It shows today's puzzle as a route: the two starters, one
button to reveal the chain, and a map of the search underneath. Everything it
needs lives in `assets/atlas/`: one self-hosted variable font (Bricolage
Grotesque), D3 for the map, and GSAP with DrawSVG for the single reveal
animation. The page is laid out mobile-first (no text under 14 px, controls at
least 44 px tall) and does not depend on the desktop redesign branch.

Run a local preview and checks:

```sh
python3 -m http.server 18764 --bind 127.0.0.1
npm ci
npm test
npx playwright install chromium
SITE_DIR=<jekyll build directory> npm run test:browser
python3 scripts/check_atlas.py
```

Playwright starts its own preview of the build directory on port 18764; stop a
manual preview before running it. Browser fixtures use the checked-in game #944 snapshot. The checks
cover hidden answers, reveal, replay state, scrubbing, alternatives, board score
sources, keyboard navigation, mobile overflow, reduced motion, stale/error
states, and throttled playback. All bundled initial assets and data are checked
against a 1 MB gzip budget (approximately 406 KB at launch).

### Production publishing

GitHub Pages uses **GitHub Actions** as its publishing source. The `pages.yml`
workflow builds the same Jekyll website on `main` pushes and checks the daily
puzzle every hour at minute 17. It checks out a pinned public solver revision,
restores datasets/caches, and prepares a validated replay before publication.
The original seeded/empty-post preview checks remain in `jekyll-check.yml`.

The workflow retrieves the previous published manifest and validates its hash
before replacing the checked-in bootstrap snapshot. An unchanged puzzle and
exporter revision do not regenerate or redeploy on scheduled runs. Temporary
server verification failures are retried at most three times per puzzle and
revision; definitive rejections are shown without automatic retries. Generator
failures retain the complete previous replay and its date. The browser never
calls the game's server.

Manual workflow dispatch accepts `force` for a fresh solve, or
`rollback_run_id` to restore a complete `site-release-<run-id>` artifact from a
previous successful run. Complete website artifacts are retained for 30 days.
The Actions run summary reports generated, unchanged, stale, or retry-limit
outcomes. Inspect failures there; update the pinned solver revision only after
its exporter/tests pass. Schedules can be delayed, so the UI displays the
recorded puzzle date and flags snapshots older than 26 hours.

The initial snapshot was generated from game #944 (2026-09-13):
`bridge → track → running`, server scores 0.6 and 1.0, with a verified server
board replay. Exported metadata records actual timings and solver revision.
Dataset, font, and D3 notices are bundled under `assets/atlas/`.

## Browser destinations

GitHub does not allow its pages to be embedded. Repository links therefore load [github1s](https://github1s.com/), a third-party repository viewer, inside the desktop. The address bar and “Open in browser ↗” link retain the original GitHub URL. The GitHub profile launcher displays the `Jordan-Leis/Jordan-Leis` profile README repository.

Resume links use Google Drive's preview endpoint inside the frame. LinkedIn opens in a new tab, and email links invoke the visitor's mail application. Other destinations load directly in the frame. If the frame reports an error or does not load within 15 seconds, the browser offers an external link; that link is always available in the toolbar. Third-party availability and embedding policies can change independently of this site.

## Icon attribution

The 23 PNGs in `assets/icons/yaru/` are from the [Yaru icon theme](https://github.com/ubuntu/yaru), by the Yaru contributors, distributed under [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/). See the [upstream icon license](https://github.com/ubuntu/yaru/blob/master/icons/LICENSE_CCBYSA).

The PNG artwork is bundled without pixel edits and scaled with CSS. Repository badges are separate HTML/CSS overlays. Upstream sources are in [`icons/Yaru/48x48@2x/`](https://github.com/ubuntu/yaru/tree/master/icons/Yaru/48x48%402x), in the following categories:

| Category | Bundled filenames |
| --- | --- |
| `apps` | `filemanager-app.png`, `org.gnome.TextEditor.png`, `system-settings.png`, `terminal-app.png`, `webbrowser-app.png` |
| `places` | `folder-documents.png`, `folder-download.png`, `folder-open.png`, `folder-pictures.png`, `folder.png`, `user-desktop.png`, `user-home.png`, `user-trash.png` |
| `mimetypes` | `application-json.png`, `application-pdf.png`, `audio-x-generic.png`, `video-x-generic.png`, `text-html.png`, `text-markdown.png`, `text-x-generic.png`, `text-x-script.png` |
| `actions` | `document-open-recent.png` |
| `categories` → `devices` | `applications-games.png` (upstream alias of `devices/input-gaming.png`) |

This desktop uses an original CSS/SVG wallpaper and generic application branding. It is not affiliated with Ubuntu, Canonical, Mozilla, or GitHub.
