import type { DragItemData } from '../types/dnd'

export function shouldHideBrowserNativeViewForDrag(
  activeDrag: DragItemData | null,
  isVisibleTab: boolean,
): boolean {
  return activeDrag?.type === 'tab' && isVisibleTab
}
