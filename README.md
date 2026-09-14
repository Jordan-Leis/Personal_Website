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
4. Commit and push. The post appears at `/blog/slug/` and in the Blog window and `/blog/`.

`_posts/2026-09-10-hello-world.md` is a placeholder showing the format.

## Previewing a branch

Ruby isn't required locally. Push a non-`main` branch and the `jekyll-check` workflow builds the site with GitHub's own Pages builder and uploads `_site` as an artifact (`site-seeded` and `site-empty`). Download it from the Actions tab or `gh run download -n site-seeded`, then serve the folder with any static server.

## Linxicon Semantic Atlas

`/linxicon-solver/` is a standalone static page, with `/linixcon-solver/`
redirecting to it. It shows today's puzzle as a route: the two starters, one
button to reveal the chain, and a map of the search underneath. Everything it
needs lives in `assets/atlas/`: one self-hosted variable font (Bricolage
Grotesque), D3 for the map, and GSAP with DrawSVG for the single reveal
animation. The page is laid out mobile-first (no text under 14 px, controls at
least 44 px tall) and does not depend on the desktop redesign branch.

The **Any pair** tab solves arbitrary word pairs in the browser. It downloads
`linxicon-solver/data/graph-<hash>.bin` once (about 5 MB: the solver's
51,029-word, 1,679,661-link graph with 16-bit scores, gzip inside an `LXG1`
binary), checks it against `graph.json`, and runs the same shortest-chain search
and board replay as the Python solver (`assets/atlas/solver.js`; the node tests
compare it with fixtures produced by the CLI). The bundle is committed, not
rebuilt in CI; regenerate it with the solver's `export_graph` module only when
its scoring version changes. Results use the local model only and say so.

`linxicon-solver/data/rejected.json` lists words the game's dictionary has
rejected (seeded from the solver's `data/rejected_words.txt`). The hourly
publisher fetches the published list, adds any rejection it sees while
verifying the day's candidates, and writes the merged list; both the daily
solve and the Any pair tab skip those words.

Run a local preview and checks:

```sh
python3 -m http.server 18764 --bind 127.0.0.1
npm ci
npm test
npx playwright install chromium
npm run test:browser
python3 scripts/check_atlas.py
```

Playwright starts its own preview on port 18764; stop a manual preview before
running it. Browser fixtures use the checked-in game #944 snapshot. The checks
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
