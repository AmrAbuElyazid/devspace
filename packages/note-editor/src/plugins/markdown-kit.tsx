"use client";

/**
 * Markdown serialization.
 *
 * The editor persists to a `.md` file on every debounced change, so this plugin
 * is the note's storage layer, not a side feature.
 *
 * `MarkdownPlugin` defaults to `remarkPlugins: []`, which cannot represent most
 * of what this editor can produce — `serialize()` throws outright on tables,
 * strikethrough, and every MDX-backed mark (underline, highlight, kbd, callout).
 * Registering GFM plus Plate's MDX extension is what makes the round trip total;
 * `markdown-round-trip.test.ts` pins that down node by node.
 */

import { MarkdownPlugin, remarkMdx } from "@platejs/markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Plugin } from "unified";

import { calloutRules } from "../markdown/callout-rule";

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [
        remarkGfm,
        // Inline math needs `$$x$$`, not `$x$`. Developer notes are full of
        // `$PATH`, `$1` and prices, and single-dollar parsing silently turns
        // "costs $5 and saves $3" into an equation reading "5 and saves".
        // `remarkPlugins` is typed as bare `Plugin[]`, with no slot for the
        // `[plugin, options]` tuple unified accepts at runtime.
        [remarkMath, { singleDollarTextMath: false }] as unknown as Plugin,
        remarkMdx,
      ],
      // Stable, conventional output. Without pinning these, remark-stringify
      // picks `*` bullets and `*emphasis*`, which churns diffs against notes
      // written or edited outside the app.
      remarkStringifyOptions: {
        bullet: "-",
        emphasis: "_",
        fences: true,
        listItemIndent: "one",
        rule: "-",
        strong: "*",
        tightDefinitions: true,
      },
      rules: calloutRules,
    },
  }),
];
