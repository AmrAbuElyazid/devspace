import {
  BoldIcon,
  CodeIcon,
  HighlighterIcon,
  ItalicIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from "lucide-react";
import { KEYS } from "platejs";

import { LinkToolbarButton } from "./link-toolbar-button";
import { MarkToolbarButton } from "./mark-toolbar-button";
import { ToolbarGroup } from "./toolbar";
import { TurnIntoToolbarButton } from "./turn-into-toolbar-button";

/**
 * Every mark offered here round-trips through the markdown layer — highlight
 * and underline as `<mark>` / `<u>`, the rest natively. Adding one that does
 * not would make the note unsaveable, which `markdown-round-trip.test.ts`
 * guards against.
 */
export function FloatingToolbarButtons() {
  return (
    <>
      <ToolbarGroup>
        <TurnIntoToolbarButton />
      </ToolbarGroup>

      <ToolbarGroup>
        <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold ⌘B">
          <BoldIcon />
        </MarkToolbarButton>

        <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic ⌘I">
          <ItalicIcon />
        </MarkToolbarButton>

        <MarkToolbarButton nodeType={KEYS.underline} tooltip="Underline ⌘U">
          <UnderlineIcon />
        </MarkToolbarButton>

        <MarkToolbarButton nodeType={KEYS.strikethrough} tooltip="Strikethrough ⌘⇧X">
          <StrikethroughIcon />
        </MarkToolbarButton>

        <MarkToolbarButton nodeType={KEYS.highlight} tooltip="Highlight ⌘⇧H">
          <HighlighterIcon />
        </MarkToolbarButton>

        <MarkToolbarButton nodeType={KEYS.code} tooltip="Code ⌘E">
          <CodeIcon />
        </MarkToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <LinkToolbarButton />
      </ToolbarGroup>
    </>
  );
}
