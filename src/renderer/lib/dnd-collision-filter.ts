import type { CollisionDescriptor } from '@dnd-kit/core'
import type { DragItemData } from '../types/dnd'

function droppableType(collision: CollisionDescriptor): string | undefined {
  return collision.data?.droppableContainer?.data?.current?.type as string | undefined
}

export function filterCollisionsForActiveDrag(
  activeDrag: DragItemData | null,
  collisions: CollisionDescriptor[],
): CollisionDescriptor[] {
  if (!activeDrag) return collisions

  if (activeDrag.type === 'group-tab') {
    const compatible = collisions.filter((collision) => {
      const type = droppableType(collision)
      return type === 'group-tab' || type === 'pane-drop' || type === 'sidebar-workspace'
    })

    const tabTargets = compatible.filter((collision) => droppableType(collision) === 'group-tab')
    if (tabTargets.length > 0) return tabTargets

    const paneTargets = compatible.filter((collision) => droppableType(collision) === 'pane-drop')
    if (paneTargets.length > 0) return paneTargets

    const workspaceTargets = compatible.filter((collision) => droppableType(collision) === 'sidebar-workspace')
    if (workspaceTargets.length > 0) return workspaceTargets

    return []
  }

  return collisions.filter((collision) => {
    const type = droppableType(collision)
    return type === 'sidebar-folder' || type === 'sidebar-workspace' || type === 'sidebar-root'
  })
}
