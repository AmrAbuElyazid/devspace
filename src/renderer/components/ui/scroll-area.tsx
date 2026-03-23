import { type ReactNode } from 'react'
import { ScrollArea as ScrollAreaPrimitive } from '@base-ui-components/react/scroll-area'
import { cn } from '../../lib/utils'

interface ScrollAreaProps {
  children: ReactNode
  className?: string
}

export function ScrollArea({ children, className }: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn('relative overflow-hidden', className)}
    >
      <ScrollAreaPrimitive.Viewport className="h-full w-full">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className={cn(
          'flex w-1.5 touch-none select-none p-px transition-opacity duration-300',
          'opacity-0 data-[hovering]:opacity-100 data-[scrolling]:opacity-100',
        )}
      >
        <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-foreground/15" />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  )
}
