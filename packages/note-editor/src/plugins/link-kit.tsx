"use client";

import { LinkPlugin } from "@platejs/link/react";

import { LinkElement } from "../plate-ui/link-node";
import { LinkFloatingToolbar } from "../plate-ui/link-toolbar";

export const LinkKit = [
  LinkPlugin.configure({
    render: {
      node: LinkElement,
      afterEditable: () => <LinkFloatingToolbar />,
    },
  }),
];
