import CoreGraphics
import Foundation

/// A real OS-level scroll wheel.
///
/// The peek panel lives in a window that never takes focus, and whether such a
/// window is still handed wheel events is an AppKit question — one that
/// Playwright's injected input cannot answer, because it goes straight to
/// Chromium. Needs Accessibility permission, like the drag driver beside it.
///
///     scroll <x> <y> <lines> [steps]
let a = CommandLine.arguments
guard a.count >= 4, let x = Double(a[1]), let y = Double(a[2]), let lines = Int32(a[3]) else {
    exit(2)
}
let steps = a.count > 4 ? (Int(a[4]) ?? 6) : 6

CGEvent(mouseEventSource: nil, mouseType: .mouseMoved,
        mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left)?.post(tap: .cghidEventTap)
usleep(150_000)

for _ in 1...steps {
    let e = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1,
                    wheel1: lines, wheel2: 0, wheel3: 0)
    e?.post(tap: .cghidEventTap)
    usleep(30_000)
}
usleep(200_000)
print("ok")
