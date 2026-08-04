import CoreGraphics
import Foundation

// Real OS-level mouse drag, so AppKit hit-testing is exercised the way a user
// would. Playwright's input injection bypasses AppKit entirely and would pass
// even where a real cursor is swallowed by a native view.
//
// usage: drag <x0> <y0> <x1> <y1> [steps]

let args = CommandLine.arguments
guard args.count >= 5 else {
    FileHandle.standardError.write("usage: drag x0 y0 x1 y1 [steps]\n".data(using: .utf8)!)
    exit(2)
}

let x0 = Double(args[1])!, y0 = Double(args[2])!
let x1 = Double(args[3])!, y1 = Double(args[4])!
let steps = args.count > 5 ? Int(args[5])! : 20

func post(_ type: CGEventType, _ point: CGPoint) {
    let event = CGEvent(
        mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)
    event?.post(tap: .cghidEventTap)
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
print("ok")
