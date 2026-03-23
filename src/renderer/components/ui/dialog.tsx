import { forwardRef } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui-components/react/dialog'
import { cn } from '../../lib/utils'

// ── Root ──────────────────────────────────────────────────────────────────────

type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root>

function Dialog(props: DialogProps) {
  return <DialogPrimitive.Root {...props} />
}

// ── Trigger ───────────────────────────────────────────────────────────────────

type DialogTriggerProps = React.ComponentProps<typeof DialogPrimitive.Trigger>

const DialogTrigger = forwardRef<HTMLButtonElement, DialogTriggerProps>(
  (props, ref) => <DialogPrimitive.Trigger ref={ref} {...props} />,
)
DialogTrigger.displayName = 'DialogTrigger'

// ── Close ─────────────────────────────────────────────────────────────────────

type DialogCloseProps = React.ComponentProps<typeof DialogPrimitive.Close>

const DialogClose = forwardRef<HTMLButtonElement, DialogCloseProps>(
  (props, ref) => <DialogPrimitive.Close ref={ref} {...props} />,
)
DialogClose.displayName = 'DialogClose'

// ── Content ───────────────────────────────────────────────────────────────────

interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Popup> {
  /** Hide the default close button */
  hideClose?: boolean
}

const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, hideClose, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          'fixed inset-0 z-50 bg-black/32 backdrop-blur-sm',
          'transition-all duration-150',
          'data-[starting-style]:opacity-0',
          'data-[ending-style]:opacity-0',
        )}
      />
      <DialogPrimitive.Popup
        ref={ref}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
          'w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl',
          'text-foreground outline-none',
          'transition-all duration-150',
          'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
          'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className={cn(
              'absolute top-3 right-3 inline-flex h-6 w-6 items-center justify-center rounded-md',
              'text-muted-foreground hover:text-foreground hover:bg-accent',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" />
            </svg>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  ),
)
DialogContent.displayName = 'DialogContent'

// ── Title ─────────────────────────────────────────────────────────────────────

type DialogTitleProps = React.ComponentProps<typeof DialogPrimitive.Title>

const DialogTitle = forwardRef<HTMLHeadingElement, DialogTitleProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-sm font-semibold text-foreground', className)}
      {...props}
    />
  ),
)
DialogTitle.displayName = 'DialogTitle'

// ── Description ───────────────────────────────────────────────────────────────

type DialogDescriptionProps = React.ComponentProps<
  typeof DialogPrimitive.Description
>

const DialogDescription = forwardRef<
  HTMLParagraphElement,
  DialogDescriptionProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('mt-1.5 text-xs text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = 'DialogDescription'

// ── Exports ───────────────────────────────────────────────────────────────────

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
}
export type { DialogProps, DialogContentProps }
