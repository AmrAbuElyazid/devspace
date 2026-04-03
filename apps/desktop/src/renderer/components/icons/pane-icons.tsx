/**
 * Custom pane-type icons. Each component accepts size, className, style,
 * and all standard SVG attributes — drop-in replacements for Lucide icons.
 *
 * Consistent style: 1.4 stroke, rounded caps/joins, 24x24 viewBox for
 * stroke icons — renders crisply from 10px (tab bar) to 15px (quick launch).
 */

import type { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

/** VS Code — official logo, simplified single-path for crisp small rendering. */
export function VSCodeIcon({ size = 24, className, style, ...rest }: IconProps) {
  const s = Number(size);
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      {...rest}
    >
      <path
        d="M96.46 10.8L75.86 0.87c-2.39-1.15-5.24-0.66-7.11 1.21L29.35 38.04 12.19 25.01c-1.6-1.21-3.83-1.11-5.32 0.24L1.36 30.25c-1.82 1.65-1.82 4.51 0 6.17L16.25 50 1.36 63.58c-1.82 1.65-1.82 4.51 0 6.16l5.51 5.01c1.49 1.35 3.72 1.45 5.32 0.24l17.17-12.03 39.41 35.96c1.87 1.87 4.72 2.36 7.11 1.21l20.59-9.91A8.33 8.33 0 00100 83.59V16.41a8.33 8.33 0 00-3.54-6.81zM75 72.7L45.11 50 75 27.3v45.4z"
        /* VS Code brand — slightly muted to sit better alongside monochrome siblings */
        fill="#2a8fc7"
      />
    </svg>
  );
}

/** T3 Code — official T3 logo mark. */
export function T3CodeIcon({ size = 24, className, style, ...rest }: IconProps) {
  const s = Number(size);
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      {...rest}
    >
      <path
        d="M0 10C0 4.477 4.477 0 10 0h108c5.523 0 10 4.477 10 10v108c0 5.523-4.477 10-10 10H10c-5.523 0-10-4.477-10-10V10z"
        fill="currentColor"
        opacity="0.15"
      />
      <path
        d="M33.45 93V47.56H15.53V37h48.8v10.56H46.41V93H33.45zM86.73 93.96c-3.89 0-7.76-.51-11.6-1.52-3.84-1.07-7.09-2.56-9.76-4.48l5.04-9.92c2.13 1.55 4.61 2.77 7.44 3.68 2.83.91 5.68 1.36 8.56 1.36 3.25 0 5.81-.64 7.68-1.92 1.87-1.28 2.8-3.04 2.8-5.28 0-2.13-.83-3.81-2.48-5.04-1.65-1.23-4.32-1.84-8-1.84h-5.92v-8.56l15.6-17.68 1.44 4.64H68.17V37h39.2v8.4l-15.52 17.68-6.56-3.76h3.76c6.88 0 12.08 1.55 15.6 4.64 3.52 3.09 5.28 7.07 5.28 11.92 0 3.15-.83 6.11-2.48 8.88-1.65 2.72-4.18 4.93-7.6 6.64-3.41 1.71-7.79 2.56-13.12 2.56z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Terminal — prompt chevron + cursor in a rounded screen. */
export function TerminalIcon({ size = 24, className, style, ...rest }: IconProps) {
  const s = Number(size);
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      {...rest}
    >
      <rect x="2" y="3" width="20" height="18" rx="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M7 9.5l3 2.5-3 2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="13"
        y1="14.5"
        x2="17"
        y2="14.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Browser — globe with equator and meridians. */
export function BrowserIcon({ size = 24, className, style, ...rest }: IconProps) {
  const s = Number(size);
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      {...rest}
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="12" cy="12" rx="4" ry="9.5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="2.5" y1="12" x2="21.5" y2="12" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 7.5h15" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M4.5 16.5h15" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** Note — spiral-bound notebook with ruled lines. */
export function NoteIcon({ size = 24, className, style, ...rest }: IconProps) {
  const s = Number(size);
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      {...rest}
    >
      <rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" strokeWidth="1.4" />
      {/* Spiral rings */}
      <line
        x1="5"
        y1="6.5"
        x2="3"
        y2="6.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="5"
        y1="12"
        x2="3"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="5"
        y1="17.5"
        x2="3"
        y2="17.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Ruled lines */}
      <line
        x1="9"
        y1="7.5"
        x2="16"
        y2="7.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="11"
        x2="15"
        y2="11"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="14.5"
        x2="13"
        y2="14.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
