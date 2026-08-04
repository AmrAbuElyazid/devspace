import CoreGraphics
import Foundation

/// A real OS-level mouse drag.
///
/// Playwright's mouse actions are injected straight into Chromium, so they
/// never meet the AppKit hit-testing that decides whether a native pane
/// swallows a drag — nor the window-server cursor position that the sidebar's
/// hover panel watches. Both of those are the point of the tests that use this.
///
/// Posting events needs Accessibility permission for whatever runs the suite.
/// Without it `CGEvent.post` fails silently, so the landing position is printed
/// and the caller checks it rather than trusting the exit code.
///
///     drag <x0> <y0> <x1> <y1> [steps]

let args = CommandLine.arguments
guard args.count >= 5, let x0 = Double(args[1]), let y0 = Double(args[2]),
    let x1 = Double(args[3]), let y1 = Double(args[4])
else {
    FileHandle.standardError.write("usage: drag x0 y0 x1 y1 [steps]\n".data(using: .utf8)!)
    exit(2)
}

let steps = max(1, args.count > 5 ? (Int(args[5]) ?? 20) : 20)

func post(_ type: CGEventType, _ point: CGPoint) {
    CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)?
        .post(tap: .cghidEventTap)
}

post(.mouseMoved, CGPoint(x: x0, y: y0))
usleep(120_000)
post(.leftMouseDown, CGPoint(x: x0, y: y0))
usleep(60_000)

for step in 1...steps {
    let t = Double(step) / Double(steps)
    post(.leftMouseDragged, CGPoint(x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t))
    usleep(16_000)
}

usleep(80_000)
post(.leftMouseUp, CGPoint(x: x1, y: y1))
usleep(40_000)

let landed = CGEvent(source: nil)?.location ?? CGPoint(x: -1, y: -1)
print("\(Int(landed.x.rounded())) \(Int(landed.y.rounded()))")
