import { memo, useCallback, useEffect, useRef } from "react";
import { Allotment } from "allotment";
import { useWorkspaceStore } from "../store/workspace-store";
import PaneGroupContainer from "./PaneGroupContainer";
import type { SplitNode } from "../types/workspace";

function getNodeIdentity(node: SplitNode): string {
  if (node.type === "leaf") {
    return `leaf:${node.groupId}`;
  }

  return `branch:${node.direction}:[${node.children.map(getNodeIdentity).join(",")}]`;
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
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        updateSplitSizes(workspaceId, stablePathRef.current, sizes);
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
      key={getNodeIdentity(node)}
      vertical={node.direction === "vertical"}
      defaultSizes={node.sizes}
      onChange={handleChange}
    >
      {node.children.map((child, i) => (
        <Allotment.Pane
          key={child.type === "leaf" ? child.groupId : `branch-${i}-${child.direction}`}
        >
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
