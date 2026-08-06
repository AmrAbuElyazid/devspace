"use client";

import { EquationPlugin, InlineEquationPlugin } from "@platejs/math/react";

import { EquationElement, InlineEquationElement } from "../plate-ui/equation-node";

/**
 * TeX blocks and inline expressions, stored as standard `$$…$$`.
 *
 * Inline math deliberately uses `$$x$$` rather than the more common `$x$`
 * (`singleDollarTextMath: false` in markdown-kit). A developer's notes are full
 * of `$PATH`, `$1` and prices, and single-dollar parsing turns "costs $5 and
 * saves $3" into an equation containing "5 and saves". Requiring the doubled
 * delimiter costs one keystroke and removes the whole class of mangling.
 */
export const MathKit = [
  EquationPlugin.withComponent(EquationElement),
  InlineEquationPlugin.withComponent(InlineEquationElement),
];
