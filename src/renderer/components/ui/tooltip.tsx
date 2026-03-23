import { type ReactNode, type ReactElement } from 'react'
import { Tooltip as TooltipPrimitive } from '@base-ui-components/react/tooltip'
import { cn } from '../../lib/utils'

interface TooltipProps {
  content: ReactNode
  children: ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  shortcut?: string
}

export function Tooltip({
  content,
  children,
  side = 'bottom',
  shortcut,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger render={children} />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner side={side} sideOffset={6}>
            <TooltipPrimitive.Popup
              className={cn(
                'z-50 rounded-md bg-foreground px-2 py-1 text-[11px] text-background',
                'shadow-md',
                'transition-all duration-150',
                'data-[starting-style]:opacity-0 data-[starting-style]:scale-95',
                'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
              )}
            >
              <span>{content}</span>
              {shortcut && (
                <span className="ml-1.5 text-[10px] opacity-60">{shortcut}</span>
              )}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
