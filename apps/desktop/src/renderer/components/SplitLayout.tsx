import { memo, useCallback, useEffect, useRef } from "react";
import { Allotment } from "allotment";
import { useWorkspaceStore } from "../store/workspace-store";
import { sizesAreEquivalent, splitLayoutInstanceKey, toPercentageSizes } from "../lib/split-layout";
import PaneGroupContainer from "./PaneGroupContainer";
import type { SplitNode } from "../types/workspace";

function getSubtreeAnchor(node: SplitNode): string {
  return node.type === "leaf" ? node.groupId : getSubtreeAnchor(node.children[0]!);
}

interface SplitLayoutProps {
  node: SplitNode;
  workspaceId: string;
  sidebarOpen: boolean;
  dndEnabled: boolean;
  path?: number[];
}

export default memo(function SplitLayout({
  node,
  workspaceId,
  sidebarOpen,
  dndEnabled,
  path = [],
}: SplitLayoutProps) {
  const updateSplitSizes = useWorkspaceStore((s) => s.updateSplitSizes);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // What the tree holds right now, and what the pending debounce is about to
  // write to it. handleChange compares against the latter when a write is in
  // flight, so a sash dragged out and straight back inside the debounce window
  // cancels itself instead of committing the intermediate value.
  const committedSizesRef = useRef<number[] | null>(null);
  const pendingSizesRef = useRef<number[] | null>(null);
  committedSizesRef.current = node.type === "branch" ? node.sizes : null;

  // Stabilize the path array reference so child callbacks don't re-create
  // on every parent render.  We keep a ref to the "stable" array and only
  // replace it when the serialized content actually changes.
  const pathKeyRef = useRef("");
  const stablePathRef = useRef(path);
  const pathKey = path.join(",");
  if (pathKey !== pathKeyRef.current) {
    pathKeyRef.current = pathKey;
    stablePathRef.current = path;
  }

  const handleChange = useCallback(
    (sizes: number[]) => {
      if (!sizes) return;

      // allotment reports pixel sizes, and it reports them from a
      // ResizeObserver — so this fires on every window resize, not just when
      // the user drags a sash. Normalizing to the percentages the tree stores
      // makes a pure resize a no-op instead of a rewrite plus a persistence
      // patch per frame.
      const next = toPercentageSizes(sizes);
      if (!next) return;

      const baseline = pendingSizesRef.current ?? committedSizesRef.current;
      if (baseline && sizesAreEquivalent(baseline, next)) return;

      pendingSizesRef.current = next;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        pendingSizesRef.current = null;
        updateSplitSizes(workspaceId, stablePathRef.current, next);
      }, 100);
    },
    [updateSplitSizes, workspaceId],
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  if (node.type === "leaf") {
    return (
      <PaneGroupContainer
        groupId={node.groupId}
        workspaceId={workspaceId}
        sidebarOpen={sidebarOpen}
        dndEnabled={dndEnabled}
      />
    );
  }

  return (
    <Allotment
      key={splitLayoutInstanceKey(node)}
      vertical={node.direction === "vertical"}
      defaultSizes={node.sizes}
      onChange={handleChange}
    >
      {node.children.map((child, i) => (
        <Allotment.Pane key={`subtree:${getSubtreeAnchor(child)}`}>
          <SplitLayout
            node={child}
            workspaceId={workspaceId}
            sidebarOpen={sidebarOpen}
            dndEnabled={dndEnabled}
            path={[...stablePathRef.current, i]}
          />
        </Allotment.Pane>
      ))}
    </Allotment>
  );
});
