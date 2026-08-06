"use client";

import type { PlateElementProps } from "platejs/react";

import type { TComboboxInputElement } from "platejs";
import { PlateElement } from "platejs/react";

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";
import { slashGroups } from "./slash-items";

export function SlashInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent>
          <InlineComboboxEmpty>No matching blocks</InlineComboboxEmpty>

          {slashGroups.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>

              {items.map(({ icon, keywords, label, value, onSelect }) => (
                <InlineComboboxItem
                  key={value}
                  value={value}
                  onClick={() => onSelect(editor)}
                  group={group}
                  label={label}
                  keywords={keywords}
                >
                  <span className="text-muted-foreground">{icon}</span>
                  {label}
                </InlineComboboxItem>
              ))}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>
    </PlateElement>
  );
}
