import { forwardRef, type ComponentProps, type HTMLAttributes } from 'react'
import { Menu as MenuPrimitive } from '@base-ui-components/react/menu'
import { ContextMenu as ContextMenuPrimitive } from '@base-ui-components/react/context-menu'
import { cn } from '../../lib/utils'

// ── Root ──────────────────────────────────────────────────────────────────────

type MenuProps = ComponentProps<typeof MenuPrimitive.Root>

function Menu(props: MenuProps) {
  return <MenuPrimitive.Root {...props} />
}

// ── Trigger ───────────────────────────────────────────────────────────────────

type MenuTriggerProps = ComponentProps<typeof MenuPrimitive.Trigger>

const MenuTrigger = forwardRef<HTMLButtonElement, MenuTriggerProps>(
  (props, ref) => <MenuPrimitive.Trigger ref={ref} {...props} />,
)
MenuTrigger.displayName = 'MenuTrigger'

// ── Content ───────────────────────────────────────────────────────────────────

interface MenuContentProps
  extends ComponentProps<typeof MenuPrimitive.Popup> {
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
  align?: 'start' | 'center' | 'end'
}

const MenuContent = forwardRef<HTMLDivElement, MenuContentProps>(
  ({ className, side = 'bottom', sideOffset = 4, align = 'start', ...props }, ref) => (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side={side} sideOffset={sideOffset} align={align}>
        <MenuPrimitive.Popup
          ref={ref}
          className={cn(
            'z-50 min-w-[160px] rounded-lg border border-border bg-background p-1 shadow-lg',
            'text-foreground outline-none',
            'origin-[var(--transform-origin)]',
            'transition-all duration-150',
            'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  ),
)
MenuContent.displayName = 'MenuContent'

// ── Item ──────────────────────────────────────────────────────────────────────

interface MenuItemProps
  extends ComponentProps<typeof MenuPrimitive.Item> {
  /** Display a keyboard shortcut on the right side */
  shortcut?: string
  /** Destructive styling */
  destructive?: boolean
}

const MenuItem = forwardRef<HTMLDivElement, MenuItemProps>(
  ({ className, children, shortcut, destructive, ...props }, ref) => (
    <MenuPrimitive.Item
      ref={ref}
      className={cn(
        'flex h-8 cursor-default select-none items-center rounded-md px-2 text-[13px] outline-none',
        'data-[highlighted]:bg-accent',
        destructive
          ? 'text-destructive data-[highlighted]:text-destructive'
          : 'text-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="flex-1">{children}</span>
      {shortcut && (
        <span className="ml-auto pl-4 text-[11px] tracking-wide text-muted-foreground">
          {shortcut}
        </span>
      )}
    </MenuPrimitive.Item>
  ),
)
MenuItem.displayName = 'MenuItem'

// ── Separator ─────────────────────────────────────────────────────────────────

function MenuSeparator({ className }: { className?: string }) {
  return <div className={cn('mx-1 my-1 h-px bg-border', className)} />
}

// ── Label ─────────────────────────────────────────────────────────────────────

function MenuLabel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'px-2 py-1.5 text-[11px] font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

// ── Context Menu (right-click) ────────────────────────────────────────────────

type ContextMenuProps = ComponentProps<typeof ContextMenuPrimitive.Root>

function ContextMenu(props: ContextMenuProps) {
  return <ContextMenuPrimitive.Root {...props} />
}

type ContextMenuTriggerProps = ComponentProps<typeof ContextMenuPrimitive.Trigger>

const ContextMenuTrigger = forwardRef<HTMLDivElement, ContextMenuTriggerProps>(
  (props, ref) => <ContextMenuPrimitive.Trigger ref={ref} render={<div />} {...props} />,
)
ContextMenuTrigger.displayName = 'ContextMenuTrigger'

const ContextMenuContent = forwardRef<HTMLDivElement, MenuContentProps>(
  ({ className, side = 'bottom', sideOffset = 4, align = 'start', ...props }, ref) => (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner side={side} sideOffset={sideOffset} align={align}>
        <ContextMenuPrimitive.Popup
          ref={ref}
          className={cn(
            'z-50 min-w-[160px] rounded-lg border border-border bg-background p-1 shadow-lg',
            'text-foreground outline-none',
            'origin-[var(--transform-origin)]',
            'transition-all duration-150',
            'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            className,
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  ),
)
ContextMenuContent.displayName = 'ContextMenuContent'

// ── Exports ───────────────────────────────────────────────────────────────────

export { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator, MenuLabel }
export { ContextMenu, ContextMenuTrigger, ContextMenuContent }
export type { MenuProps, MenuContentProps, MenuItemProps, ContextMenuProps, ContextMenuTriggerProps }
