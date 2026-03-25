import { useCallback, useEffect, useRef } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { useWorkspaceStore } from '../store/workspace-store'
import PaneGroupContainer from './PaneGroupContainer'
import type { SplitNode } from '../types/workspace'

interface SplitLayoutProps {
  node: SplitNode
  workspaceId: string
  overlayActive: boolean
  path?: number[]
}

export default function SplitLayout({
  node,
  workspaceId,
  overlayActive,
  path = [],
}: SplitLayoutProps): JSX.Element {
  const updateSplitSizes = useWorkspaceStore((s) => s.updateSplitSizes)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleChange = useCallback(
    (sizes: number[]) => {
      if (!sizes) return
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(() => {
        updateSplitSizes(workspaceId, path, sizes)
      }, 100)
    },
    [updateSplitSizes, workspaceId, path],
  )

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

  if (node.type === 'leaf') {
    return (
      <PaneGroupContainer
        groupId={node.groupId}
        workspaceId={workspaceId}
        overlayActive={overlayActive}
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
        <Allotment.Pane
          key={child.type === 'leaf' ? child.groupId : `branch-${i}-${child.direction}`}
        >
          <SplitLayout
            node={child}
            workspaceId={workspaceId}
            overlayActive={overlayActive}
            path={[...path, i]}
          />
        </Allotment.Pane>
      ))}
    </Allotment>
  )
}
