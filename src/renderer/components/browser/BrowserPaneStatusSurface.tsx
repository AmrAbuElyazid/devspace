import type { ReactElement } from 'react'
import type { BrowserFailureState } from '../../../shared/browser'
import { Button } from '../ui/button'

interface BrowserPaneStatusSurfaceProps {
  failure: BrowserFailureState
  onPrimaryAction: () => void
}

export default function BrowserPaneStatusSurface({
  failure,
  onPrimaryAction,
}: BrowserPaneStatusSurfaceProps): ReactElement {
  const isCrash = failure.kind === 'crash'

  return (
    <div className="browser-failure-surface">
      <div className="browser-failure-card">
        <div className="browser-failure-eyebrow">{isCrash ? 'Pane recovery' : 'Navigation failed'}</div>
        <h2>{isCrash ? 'Browser pane crashed' : "Couldn't open this page"}</h2>
        <p>{failure.url}</p>
        <p>{failure.detail}</p>
        <div className="browser-failure-actions">
          <Button size="sm" onClick={onPrimaryAction}>{isCrash ? 'Reload pane' : 'Try again'}</Button>
        </div>
      </div>
    </div>
  )
}
