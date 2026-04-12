import * as React from "react";

import type { PlateEditor, PlateElementProps } from "platejs/react";

import {
  Code2,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  LightbulbIcon,
  ListIcon,
  ListOrdered,
  MinusIcon,
  PilcrowIcon,
  Quote,
  Square,
  TableIcon,
} from "lucide-react";
import { type TComboboxInputElement, KEYS } from "platejs";
import { PlateElement } from "platejs/react";

import { insertCallout } from "@platejs/callout";
import { insertCodeBlock } from "@platejs/code-block";
import { toggleList } from "@platejs/list";
import { insertTable } from "@platejs/table";

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";

type Group = {
  group: string;
  items: {
    icon: React.ReactNode;
    value: string;
    onSelect: (editor: PlateEditor, value: string) => void;
    focusEditor?: boolean;
    keywords?: string[];
    label?: string;
  }[];
};

const groups: Group[] = [
  {
    group: "Basic blocks",
    items: [
      {
        icon: <PilcrowIcon />,
        keywords: ["paragraph"],
        label: "Text",
        value: KEYS.p,
        onSelect: (editor) => {
          editor.tf.toggleBlock(KEYS.p);
        },
      },
      {
        icon: <Heading1Icon />,
        keywords: ["title", "h1"],
        label: "Heading 1",
        value: KEYS.h1,
        onSelect: (editor) => {
          editor.tf.toggleBlock(KEYS.h1);
        },
      },
      {
        icon: <Heading2Icon />,
        keywords: ["subtitle", "h2"],
        label: "Heading 2",
        value: KEYS.h2,
        onSelect: (editor) => {
          editor.tf.toggleBlock(KEYS.h2);
        },
      },
      {
        icon: <Heading3Icon />,
        keywords: ["subtitle", "h3"],
        label: "Heading 3",
        value: KEYS.h3,
        onSelect: (editor) => {
          editor.tf.toggleBlock(KEYS.h3);
        },
      },
      {
        icon: <ListIcon />,
        keywords: ["unordered", "ul", "-"],
        label: "Bulleted list",
        value: KEYS.ul,
        onSelect: (editor) => {
          toggleList(editor, { listStyleType: KEYS.ul });
        },
      },
      {
        icon: <ListOrdered />,
        keywords: ["ordered", "ol", "1"],
        label: "Numbered list",
        value: KEYS.ol,
        onSelect: (editor) => {
          toggleList(editor, { listStyleType: KEYS.ol });
        },
      },
      {
        icon: <Square />,
        keywords: ["checklist", "task", "checkbox", "[]"],
        label: "To-do list",
        value: KEYS.listTodo,
        onSelect: (editor) => {
          toggleList(editor, { listStyleType: KEYS.listTodo });
        },
      },
      {
        icon: <Code2 />,
        keywords: ["```"],
        label: "Code Block",
        value: KEYS.codeBlock,
        onSelect: (editor) => {
          insertCodeBlock(editor);
        },
      },
      {
        icon: <TableIcon />,
        keywords: ["table", "grid", "spreadsheet"],
        label: "Table",
        value: KEYS.table,
        onSelect: (editor) => {
          insertTable(editor, { rowCount: 3, colCount: 3 });
        },
      },
      {
        icon: <Quote />,
        keywords: ["citation", "blockquote", "quote", ">"],
        label: "Blockquote",
        value: KEYS.blockquote,
        onSelect: (editor) => {
          editor.tf.toggleBlock(KEYS.blockquote);
        },
      },
      {
        icon: <LightbulbIcon />,
        keywords: ["note", "callout"],
        label: "Callout",
        value: KEYS.callout,
        onSelect: (editor) => {
          insertCallout(editor);
        },
      },
      {
        icon: <MinusIcon />,
        keywords: ["divider", "separator", "line", "---"],
        label: "Divider",
        value: KEYS.hr,
        onSelect: (editor) => {
          editor.tf.setNodes({ type: KEYS.hr });
          editor.tf.insertNodes({
            children: [{ text: "" }],
            type: KEYS.p,
          });
        },
      },
    ],
  },
];

export function SlashInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent>
          <InlineComboboxEmpty>No results</InlineComboboxEmpty>

          {groups.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>

              {items.map(({ focusEditor, icon, keywords, label, value, onSelect }) => (
                <InlineComboboxItem
                  key={value}
                  value={value}
                  onClick={() => onSelect(editor, value)}
                  group={group}
                  {...(label !== undefined ? { label } : {})}
                  {...(focusEditor !== undefined ? { focusEditor } : {})}
                  {...(keywords !== undefined ? { keywords } : {})}
                >
                  <div className="mr-2 text-muted-foreground">{icon}</div>
                  {label ?? value}
                </InlineComboboxItem>
              ))}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>
    </PlateElement>
  );
}
