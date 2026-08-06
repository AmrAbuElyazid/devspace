import type { Value } from "platejs";
import { NodeApi } from "platejs";

export interface NoteStats {
  characters: number;
  /** Whole minutes, rounded up; 0 for an empty note. */
  readingMinutes: number;
  words: number;
}

/** Average adult reading speed for prose, rounded to a familiar number. */
const WORDS_PER_MINUTE = 220;

/**
 * Counts over the editor value rather than the serialized markdown: markdown
 * carries syntax (`**`, `| --- |`, fence lines) that a reader never sees, so
 * counting it inflates every number.
 */
export function noteStats(value: Value): NoteStats {
  const text = value.map((node) => NodeApi.string(node)).join("\n");
  const words = text.split(/\s+/u).filter(Boolean).length;

  return {
    characters: text.length,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)),
    words,
  };
}
