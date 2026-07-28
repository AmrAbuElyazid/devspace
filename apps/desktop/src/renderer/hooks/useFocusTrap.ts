import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableWithin(container: HTMLElement): HTMLElement[] {
  // No visibility filtering. The obvious check — `offsetParent !== null` —
  // needs layout, which jsdom does not do, so it would silently reduce every
  // trap to a single stop under test while looking fine in the app. Callers
  // here swap panels by unmounting them rather than hiding them, so a
  // display:none focus stop is not a case that arises.
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * Keeps Tab inside `containerRef` while `active`, focuses the container on
 * open, and restores focus to whatever had it when the trap closes.
 *
 * `aria-modal` is a promise to assistive tech that the rest of the page is
 * inert; without a trap the promise is a lie and Tab walks straight out of the
 * dialog into the application behind it.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // The container itself takes focus rather than the first control, so
    // opening a dialog does not look like a button is already pressed.
    container.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab") return;
      const focusable = focusableWithin(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeElement = document.activeElement;

      if (!event.shiftKey && (activeElement === last || !container.contains(activeElement))) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && (activeElement === first || activeElement === container)) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [active, containerRef]);
}
