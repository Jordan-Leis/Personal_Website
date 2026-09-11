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
