import React, { useCallback } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { useWorkspaceStore } from '../store/workspace-store'
import PaneContainer from './PaneContainer'
import type { SplitNode } from '../types/workspace'

interface SplitLayoutProps {
  node: SplitNode
  workspaceId: string
  tabId: string
  path?: number[]
}

export default function SplitLayout({
  node,
  workspaceId,
  tabId,
  path = [],
}: SplitLayoutProps): React.JSX.Element {
  const updateSplitSizes = useWorkspaceStore((s) => s.updateSplitSizes)

  const handleChange = useCallback(
    (sizes: number[]) => {
      if (sizes) {
        updateSplitSizes(workspaceId, tabId, path, sizes)
      }
    },
    [updateSplitSizes, workspaceId, tabId, path],
  )

  if (node.type === 'leaf') {
    return (
      <PaneContainer
        paneId={node.paneId}
        workspaceId={workspaceId}
        tabId={tabId}
      />
    )
  }

  return (
    <Allotment
      vertical={node.direction === 'vertical'}
      defaultSizes={node.sizes}
      onChange={handleChange}
    >
      {node.children.map((child, i) => (
        <Allotment.Pane key={child.type === 'leaf' ? child.paneId : i}>
          <SplitLayout
            node={child}
            workspaceId={workspaceId}
            tabId={tabId}
            path={[...path, i]}
          />
        </Allotment.Pane>
      ))}
    </Allotment>
  )
}
