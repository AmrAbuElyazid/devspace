"use client";

import { KEYS } from "platejs";
import { BlockPlaceholderPlugin } from "platejs/react";

export const BlockPlaceholderKit = [
  BlockPlaceholderPlugin.configure({
    options: {
      className:
        "before:pointer-events-none before:absolute before:select-none before:text-[var(--foreground-muted)] before:content-[attr(placeholder)]",
      placeholders: {
        [KEYS.p]: "Start writing...",
      },
      query: ({ path }) => path.length === 1,
    },
  }),
];
