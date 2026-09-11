---
title: "Hello, world (replace me)"
date: 2026-09-10
tags: [meta]
---

This is a placeholder post. Delete it or overwrite it with the first real one.

## How posts work

Every file in `_posts/` named `YYYY-MM-DD-slug.md` becomes a post at `/blog/slug/`. The block at the top of the file (between the `---` lines) is the frontmatter. Three keys matter:

- `title` — shown in the listing and at the top of the post
- `date` — used for ordering; newest first
- `tags` — optional, a list like `[fpga, timing]`; rendered as `#fpga #timing`

Everything below the frontmatter is Markdown. GitHub Pages builds the site on push; there's nothing to run locally.

## Code blocks

Fence code with three backticks and a language name. Use `verilog` for SystemVerilog — the highlighter knows the SV keywords.

```verilog
module acc_stage #(
    parameter int W = 16
) (
    input  logic          clk,
    input  logic          rst_n,
    input  logic [W-1:0]  a,
    input  logic [W-1:0]  b,
    output logic [2*W-1:0] p
);
    // One register per inter-DSP link keeps the design logic-bound.
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) p <= '0;
        else        p <= a * b;
    end
endmodule
```

Inline code like `always_ff` works too. Links, lists, blockquotes, and tables all render.
