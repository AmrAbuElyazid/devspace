#include "ghostty_bridge.h"
#include <napi.h>
#import <AppKit/AppKit.h>
#import <Metal/Metal.h>
#import <QuartzCore/QuartzCore.h>
#include <unordered_map>
#include <unordered_set>
#include <string>

GhosttyAppState g_state;

// Forward declare
@class GhosttyView;

// ---------------------------------------------------------------------------
// GhosttyView — NSView subclass for a single terminal surface
// ---------------------------------------------------------------------------

@interface GhosttyView : NSView <NSTextInputClient>
@property (nonatomic) ghostty_surface_t surface;
@property (nonatomic, copy) NSString* tabId;
@property (nonatomic, strong) NSTrackingArea* trackingArea;
@property (nonatomic) BOOL lastFocusState;
@property (nonatomic, strong) NSMutableArray<NSString*>* keyTextAccumulator;
@property (nonatomic, strong) NSString* markedTextValue;
@property (nonatomic) NSRange imeMarkedRange;
@property (nonatomic) NSRange imeSelectedRange;
// Show-when-ready state: surface only becomes visible when BOTH
// wantVisible (requested by caller) AND hasBounds (positioned at least once) are true.
@property (nonatomic) BOOL wantVisible;
@property (nonatomic) BOOL hasBounds;
// Last DOM-space bounds (top-left origin) — used to re-apply Y-flip on window resize.
@property (nonatomic) double lastDomX;
@property (nonatomic) double lastDomY;
@property (nonatomic) double lastDomW;
@property (nonatomic) double lastDomH;
@end

@implementation GhosttyView

- (instancetype)initWithFrame:(NSRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        _keyTextAccumulator = [NSMutableArray new];
        _imeMarkedRange = NSMakeRange(NSNotFound, 0);
        _imeSelectedRange = NSMakeRange(0, 0);
        _lastFocusState = NO;
        _wantVisible = NO;
        _hasBounds = NO;
        _lastDomX = 0;
        _lastDomY = 0;
        _lastDomW = 0;
        _lastDomH = 0;
    }
    return self;
}

- (BOOL)acceptsFirstResponder { return YES; }

- (BOOL)becomeFirstResponder {
    if (self.surface && !self.lastFocusState) {
        self.lastFocusState = YES;
        ghostty_surface_set_focus(self.surface, true);
        NSNumber* screenNum = [self.window.screen deviceDescription][@"NSScreenNumber"];
        if (screenNum) {
            ghostty_surface_set_display_id(self.surface, [screenNum unsignedIntValue]);
        }
    }
    return YES;
}

- (BOOL)resignFirstResponder {
    if (self.surface && self.lastFocusState) {
        self.lastFocusState = NO;
        ghostty_surface_set_focus(self.surface, false);
    }
    return YES;
}

- (BOOL)wantsUpdateLayer { return YES; }

- (CALayer*)makeBackingLayer {
    CAMetalLayer* metalLayer = [CAMetalLayer layer];
    metalLayer.pixelFormat = MTLPixelFormatBGRA8Unorm;
    metalLayer.opaque = NO;
    metalLayer.framebufferOnly = NO;
    return metalLayer;
}

- (BOOL)isOpaque { return NO; }

- (void)updateTrackingAreas {
    if (self.trackingArea) [self removeTrackingArea:self.trackingArea];
    self.trackingArea = [[NSTrackingArea alloc]
        initWithRect:self.bounds
        options:(NSTrackingMouseMoved | NSTrackingActiveAlways |
                 NSTrackingInVisibleRect | NSTrackingMouseEnteredAndExited)
        owner:self userInfo:nil];
    [self addTrackingArea:self.trackingArea];
    [super updateTrackingAreas];
}

- (void)layout {
    [super layout];
    if (!self.surface) return;
    NSSize size = self.bounds.size;
    if (size.width <= 0 || size.height <= 0) return;

    NSRect backingRect = [self convertRectToBacking:NSMakeRect(0, 0, size.width, size.height)];
    double xScale = backingRect.size.width / size.width;
    double yScale = backingRect.size.height / size.height;
    CGFloat layerScale = fmax(1.0, self.window.backingScaleFactor);

    uint32_t wpx = (uint32_t)floor(fmax(0, backingRect.size.width));
    uint32_t hpx = (uint32_t)floor(fmax(0, backingRect.size.height));
    if (wpx == 0 || hpx == 0) return;

    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    if ([self.layer isKindOfClass:[CAMetalLayer class]]) {
        CAMetalLayer* metalLayer = (CAMetalLayer*)self.layer;
        metalLayer.drawableSize = CGSizeMake(wpx, hpx);
        metalLayer.contentsScale = layerScale;
    }
    [CATransaction commit];

    ghostty_surface_set_content_scale(self.surface, xScale, yScale);
    ghostty_surface_set_size(self.surface, wpx, hpx);
}

- (void)viewDidMoveToWindow {
    [super viewDidMoveToWindow];
    if (!self.window) return;

    // Register for screen change notifications
    [[NSNotificationCenter defaultCenter] addObserver:self
        selector:@selector(screenDidChange:)
        name:NSWindowDidChangeScreenNotification
        object:self.window];
    [[NSNotificationCenter defaultCenter] addObserver:self
        selector:@selector(screenDidChange:)
        name:NSWindowDidChangeScreenProfileNotification
        object:self.window];

    // Sync initial color scheme
    [self viewDidChangeEffectiveAppearance];
}

- (void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)screenDidChange:(NSNotification*)notification {
    if (!self.surface || !self.window) return;
    [self setNeedsLayout:YES];
    ghostty_surface_set_display_id(self.surface,
        [self.window.screen.deviceDescription[@"NSScreenNumber"] unsignedIntValue]);
}

- (void)viewDidChangeBackingProperties {
    [super viewDidChangeBackingProperties];
    if (self.window) {
        [CATransaction begin];
        [CATransaction setDisableActions:YES];
        self.layer.contentsScale = self.window.backingScaleFactor;
        [CATransaction commit];
    }
    [self setNeedsLayout:YES];
}

- (void)viewDidChangeEffectiveAppearance {
    [super viewDidChangeEffectiveAppearance];
    if (!self.surface) return;
    NSAppearanceName bestMatch = [self.effectiveAppearance
        bestMatchFromAppearancesWithNames:@[NSAppearanceNameAqua, NSAppearanceNameDarkAqua]];
    ghostty_color_scheme_e scheme = [bestMatch isEqualToString:NSAppearanceNameDarkAqua]
        ? GHOSTTY_COLOR_SCHEME_DARK : GHOSTTY_COLOR_SCHEME_LIGHT;
    ghostty_surface_set_color_scheme(self.surface, scheme);
}

// ---- Input helpers ----

static ghostty_input_mods_e translateMods(NSEventModifierFlags flags) {
    uint32_t mods = GHOSTTY_MODS_NONE;
    if (flags & NSEventModifierFlagShift)    mods |= GHOSTTY_MODS_SHIFT;
    if (flags & NSEventModifierFlagControl)  mods |= GHOSTTY_MODS_CTRL;
    if (flags & NSEventModifierFlagOption)   mods |= GHOSTTY_MODS_ALT;
    if (flags & NSEventModifierFlagCommand)  mods |= GHOSTTY_MODS_SUPER;
    if (flags & NSEventModifierFlagCapsLock) mods |= GHOSTTY_MODS_CAPS;
    return (ghostty_input_mods_e)mods;
}

// ---- Keyboard ----

// Intercept Cmd+key combos before Electron's menu system eats them
- (BOOL)performKeyEquivalent:(NSEvent*)event {
    if (!self.surface) return NO;
    if ([self.window firstResponder] != self) return NO;

    if (event.modifierFlags & NSEventModifierFlagCommand) {
        ghostty_input_key_s key = {};
        key.action = event.isARepeat ? GHOSTTY_ACTION_REPEAT : GHOSTTY_ACTION_PRESS;
        key.keycode = (uint32_t)event.keyCode;
        key.composing = false;

        ghostty_input_mods_e originalMods = translateMods(event.modifierFlags);
        key.mods = ghostty_surface_key_translation_mods(self.surface, originalMods);

        if (key.mods != originalMods) {
            NSString* unshifted = event.charactersIgnoringModifiers;
            if (unshifted && unshifted.length > 0) {
                key.text = [unshifted UTF8String];
                key.unshifted_codepoint = [unshifted characterAtIndex:0];
            }
        } else {
            NSString* chars = event.characters;
            if (chars && chars.length > 0) key.text = [chars UTF8String];
            NSString* unshifted = event.charactersIgnoringModifiers;
            if (unshifted && unshifted.length > 0) key.unshifted_codepoint = [unshifted characterAtIndex:0];
        }

        bool handled = ghostty_surface_key(self.surface, key);
        if (handled) return YES;
    }

    return NO;
}

- (void)keyDown:(NSEvent*)event {
    if (!self.surface) return;

    // If we have marked text (active IME composition), route through
    // interpretKeyEvents so the input method can process the keystroke.
    if ([self hasMarkedText]) {
        [self.keyTextAccumulator removeAllObjects];
        [self interpretKeyEvents:@[event]];

        ghostty_input_key_s key = {};
        key.action = event.isARepeat ? GHOSTTY_ACTION_REPEAT : GHOSTTY_ACTION_PRESS;
        key.keycode = (uint32_t)event.keyCode;
        key.composing = [self hasMarkedText];
        key.mods = ghostty_surface_key_translation_mods(self.surface, translateMods(event.modifierFlags));

        if (self.keyTextAccumulator.count > 0) {
            NSString* accum = [self.keyTextAccumulator componentsJoinedByString:@""];
            key.text = [accum UTF8String];
        }
        NSString* unshifted = event.charactersIgnoringModifiers;
        if (unshifted && unshifted.length > 0) key.unshifted_codepoint = [unshifted characterAtIndex:0];

        ghostty_surface_key(self.surface, key);
        return;
    }

    // Normal path: send key directly to Ghostty
    ghostty_input_key_s key = {};
    key.action = event.isARepeat ? GHOSTTY_ACTION_REPEAT : GHOSTTY_ACTION_PRESS;
    key.keycode = (uint32_t)event.keyCode;
    key.composing = false;

    ghostty_input_mods_e originalMods = translateMods(event.modifierFlags);
    key.mods = ghostty_surface_key_translation_mods(self.surface, originalMods);

    if (key.mods != originalMods) {
        NSString* unshifted = event.charactersIgnoringModifiers;
        if (unshifted && unshifted.length > 0) {
            key.text = [unshifted UTF8String];
            key.unshifted_codepoint = [unshifted characterAtIndex:0];
        }
    } else {
        NSString* chars = event.characters;
        if (chars && chars.length > 0) key.text = [chars UTF8String];
        NSString* unshifted = event.charactersIgnoringModifiers;
        if (unshifted && unshifted.length > 0) key.unshifted_codepoint = [unshifted characterAtIndex:0];
    }

    ghostty_surface_key(self.surface, key);
}

- (void)keyUp:(NSEvent*)event {
    if (!self.surface) return;
    ghostty_input_key_s key = {};
    key.action = GHOSTTY_ACTION_RELEASE;
    key.mods = translateMods(event.modifierFlags);
    key.keycode = (uint32_t)event.keyCode;
    ghostty_surface_key(self.surface, key);
}

- (void)flagsChanged:(NSEvent*)event {
    if (!self.surface) return;
    ghostty_input_key_s key = {};
    key.action = (event.modifierFlags & (NSEventModifierFlagShift | NSEventModifierFlagControl |
                  NSEventModifierFlagOption | NSEventModifierFlagCommand))
                  ? GHOSTTY_ACTION_PRESS : GHOSTTY_ACTION_RELEASE;
    key.mods = translateMods(event.modifierFlags);
    key.keycode = (uint32_t)event.keyCode;
    ghostty_surface_key(self.surface, key);
}

// ---- NSTextInputClient (IME) ----

- (void)insertText:(id)string replacementRange:(NSRange)replacementRange {
    NSString* text = [string isKindOfClass:[NSAttributedString class]]
        ? [(NSAttributedString*)string string] : (NSString*)string;
    if (text.length > 0) [self.keyTextAccumulator addObject:text];
    self.markedTextValue = nil;
    self.imeMarkedRange = NSMakeRange(NSNotFound, 0);
    if (self.surface) ghostty_surface_preedit(self.surface, NULL, 0);
}

- (void)setMarkedText:(id)string selectedRange:(NSRange)newSelectedRange
        replacementRange:(NSRange)replacementRange {
    NSString* text = [string isKindOfClass:[NSAttributedString class]]
        ? [(NSAttributedString*)string string] : (NSString*)string;
    self.markedTextValue = text;
    self.imeMarkedRange = (text.length > 0) ? NSMakeRange(0, text.length) : NSMakeRange(NSNotFound, 0);
    self.imeSelectedRange = newSelectedRange;
    if (self.surface) {
        const char* cstr = [text UTF8String];
        ghostty_surface_preedit(self.surface, cstr, text.length);
    }
}

- (void)unmarkText {
    self.markedTextValue = nil;
    self.imeMarkedRange = NSMakeRange(NSNotFound, 0);
    if (self.surface) ghostty_surface_preedit(self.surface, NULL, 0);
}

- (BOOL)hasMarkedText { return self.imeMarkedRange.location != NSNotFound; }
- (NSRange)markedRange { return _imeMarkedRange; }
- (NSRange)selectedRange { return _imeSelectedRange; }

- (NSAttributedString*)attributedSubstringForProposedRange:(NSRange)range
        actualRange:(NSRangePointer)actualRange { return nil; }

- (NSArray<NSAttributedStringKey>*)validAttributesForMarkedText { return @[]; }

- (NSUInteger)characterIndexForPoint:(NSPoint)point { return NSNotFound; }

- (NSRect)firstRectForCharacterRange:(NSRange)range actualRange:(NSRangePointer)actualRange {
    if (!self.surface) return NSZeroRect;
    double x = 0, y = 0, w = 0, h = 0;
    ghostty_surface_ime_point(self.surface, &x, &y, &w, &h);
    NSRect viewRect = NSMakeRect(x, self.frame.size.height - y - h, w, h);
    return [self.window convertRectToScreen:[self convertRect:viewRect toView:nil]];
}

- (void)doCommandBySelector:(SEL)selector { /* prevent NSBeep */ }

// ---- Mouse ----

- (void)mouseDown:(NSEvent*)event {
    if (!self.surface) return;
    NSPoint pos = [self convertPoint:event.locationInWindow fromView:nil];
    ghostty_surface_mouse_pos(self.surface, pos.x, self.frame.size.height - pos.y,
                               translateMods(event.modifierFlags));
    ghostty_surface_mouse_button(self.surface, GHOSTTY_MOUSE_PRESS,
                                  GHOSTTY_MOUSE_LEFT, translateMods(event.modifierFlags));
}

- (void)mouseUp:(NSEvent*)event {
    if (!self.surface) return;
    ghostty_surface_mouse_button(self.surface, GHOSTTY_MOUSE_RELEASE,
                                  GHOSTTY_MOUSE_LEFT, translateMods(event.modifierFlags));
}

- (void)rightMouseDown:(NSEvent*)event {
    if (!self.surface) return;
    if (ghostty_surface_mouse_captured(self.surface)) {
        NSPoint pos = [self convertPoint:event.locationInWindow fromView:nil];
        ghostty_surface_mouse_pos(self.surface, pos.x, self.frame.size.height - pos.y,
                                   translateMods(event.modifierFlags));
        ghostty_surface_mouse_button(self.surface, GHOSTTY_MOUSE_PRESS,
                                      GHOSTTY_MOUSE_RIGHT, translateMods(event.modifierFlags));
    } else {
        [super rightMouseDown:event];
    }
}

- (void)rightMouseUp:(NSEvent*)event {
    if (!self.surface) return;
    ghostty_surface_mouse_button(self.surface, GHOSTTY_MOUSE_RELEASE,
                                  GHOSTTY_MOUSE_RIGHT, translateMods(event.modifierFlags));
}

- (void)mouseMoved:(NSEvent*)event {
    if (!self.surface) return;
    NSPoint pos = [self convertPoint:event.locationInWindow fromView:nil];
    // Ghostty expects y from top; AppKit gives y from bottom
    ghostty_surface_mouse_pos(self.surface, pos.x, self.frame.size.height - pos.y,
                               translateMods(event.modifierFlags));
}

- (void)mouseDragged:(NSEvent*)event { [self mouseMoved:event]; }
- (void)rightMouseDragged:(NSEvent*)event { [self mouseMoved:event]; }

- (void)mouseExited:(NSEvent*)event {
    if (!self.surface) return;
    ghostty_surface_mouse_pos(self.surface, -1, -1, translateMods(event.modifierFlags));
}

- (void)scrollWheel:(NSEvent*)event {
    if (!self.surface) return;
    double x = event.scrollingDeltaX;
    double y = event.scrollingDeltaY;
    bool precision = event.hasPreciseScrollingDeltas;
    if (precision) { x *= 2.0; y *= 2.0; }

    int32_t scrollMods = 0;
    if (precision) scrollMods |= 1;
    switch (event.momentumPhase) {
        case NSEventPhaseBegan:      scrollMods |= (1 << 1); break;
        case NSEventPhaseStationary: scrollMods |= (2 << 1); break;
        case NSEventPhaseChanged:    scrollMods |= (3 << 1); break;
        case NSEventPhaseEnded:      scrollMods |= (4 << 1); break;
        case NSEventPhaseCancelled:  scrollMods |= (5 << 1); break;
        case NSEventPhaseMayBegin:   scrollMods |= (6 << 1); break;
        default: break;
    }
    ghostty_surface_mouse_scroll(self.surface, x, y, (ghostty_input_scroll_mods_t)scrollMods);
}

@end

// ---------------------------------------------------------------------------
// Surface layout helpers
// ---------------------------------------------------------------------------

// Apply DOM-space bounds (top-left origin) to a GhosttyView using the current
// content view height for Y-flipping.  Also stores the DOM bounds on the
// view so they can be re-applied when the window resizes.
static void applyDomBounds(GhosttyView* view, double domX, double domY, double w, double h) {
    view.lastDomX = domX;
    view.lastDomY = domY;
    view.lastDomW = w;
    view.lastDomH = h;
    view.hasBounds = YES;

    NSView* contentView = [g_state.window contentView];
    CGFloat contentHeight = [contentView bounds].size.height;
    CGFloat nsY = contentHeight - domY - h;
    [view setFrame:NSMakeRect(domX, nsY, w, h)];
}

// Re-apply Y-flip for ALL surfaces that have stored DOM bounds.
// Called synchronously on window resize so native views track the
// window without waiting for the renderer's ResizeObserver round-trip.
static void refitAllSurfacesForNewContentHeight() {
    NSView* contentView = [g_state.window contentView];
    CGFloat contentHeight = [contentView bounds].size.height;
    for (auto& pair : g_state.surfaces) {
        GhosttyView* view = pair.second;
        if (!view.hasBounds) continue;
        CGFloat nsY = contentHeight - view.lastDomY - view.lastDomH;
        [view setFrame:NSMakeRect(view.lastDomX, nsY, view.lastDomW, view.lastDomH)];
    }
}

// Evaluate whether a surface should actually be visible and update
// its hidden/occlusion state accordingly.  A surface only becomes
// visible when BOTH wantVisible AND hasBounds are true.
static void evaluateVisibility(GhosttyView* view) {
    BOOL shouldBeVisible = view.wantVisible && view.hasBounds;
    BOOL isCurrentlyVisible = ![view isHidden];

    if (shouldBeVisible && !isCurrentlyVisible) {
        [view setHidden:NO];
        if (view.surface) ghostty_surface_set_occlusion(view.surface, true);
    } else if (!shouldBeVisible && isCurrentlyVisible) {
        [view setHidden:YES];
        if (view.surface) ghostty_surface_set_occlusion(view.surface, false);
    }
}

// ---------------------------------------------------------------------------
// Runtime callbacks — called by Ghostty core
// ---------------------------------------------------------------------------

static void wakeup_cb(void* userdata) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (g_state.app) ghostty_app_tick(g_state.app);
    });
}

// Helper: find surface ID for a ghostty surface handle
static std::string findSurfaceId(ghostty_surface_t surface) {
    for (auto& pair : g_state.surfaces) {
        if (pair.second.surface == surface) return pair.first;
    }
    return "";
}

// Helper: find the focused GhosttyView (the current first responder if it's one of ours)
static GhosttyView* findFocusedView() {
    NSResponder* responder = [g_state.window firstResponder];
    if ([responder isKindOfClass:[GhosttyView class]]) {
        return (GhosttyView*)responder;
    }
    return nil;
}

static bool action_cb(ghostty_app_t app, ghostty_target_s target, ghostty_action_s action) {
    switch (action.tag) {
        case GHOSTTY_ACTION_SET_TITLE: {
            if (target.tag != GHOSTTY_TARGET_SURFACE) return false;
            std::string surfaceId = findSurfaceId(target.target.surface);
            if (surfaceId.empty()) return false;
            const char* title = action.action.set_title.title;
            std::string titleStr(title ? title : "");
            std::string capturedId = surfaceId;
            if (g_state.titleChangedCallback) {
                g_state.titleChangedCallback.NonBlockingCall(
                    [capturedId, titleStr](Napi::Env env, Napi::Function fn) {
                        fn.Call({Napi::String::New(env, capturedId),
                                 Napi::String::New(env, titleStr)});
                    });
            }
            return true;
        }
        case GHOSTTY_ACTION_NEW_TAB:
            // Could wire to create a new tab via callback; for now ignore
            return false;

        case GHOSTTY_ACTION_SET_TAB_TITLE: {
            if (target.tag != GHOSTTY_TARGET_SURFACE) return false;
            std::string surfaceId = findSurfaceId(target.target.surface);
            if (surfaceId.empty()) return false;
            const char* title = action.action.set_tab_title.title;
            std::string titleStr(title ? title : "");
            std::string capturedId = surfaceId;
            if (g_state.titleChangedCallback) {
                g_state.titleChangedCallback.NonBlockingCall(
                    [capturedId, titleStr](Napi::Env env, Napi::Function fn) {
                        fn.Call({Napi::String::New(env, capturedId),
                                 Napi::String::New(env, titleStr)});
                    });
            }
            return true;
        }

        case GHOSTTY_ACTION_RING_BELL: {
            NSBeep();
            return true;
        }

        case GHOSTTY_ACTION_SHOW_CHILD_EXITED: {
            if (target.tag != GHOSTTY_TARGET_SURFACE) return false;
            std::string surfaceId = findSurfaceId(target.target.surface);
            if (surfaceId.empty()) return false;
            std::string capturedId = surfaceId;
            if (g_state.surfaceClosedCallback) {
                g_state.surfaceClosedCallback.NonBlockingCall(
                    [capturedId](Napi::Env env, Napi::Function fn) {
                        fn.Call({Napi::String::New(env, capturedId)});
                    });
            }
            return true;
        }

        case GHOSTTY_ACTION_PWD: {
            return true;
        }

        case GHOSTTY_ACTION_DESKTOP_NOTIFICATION: {
            return true;
        }

        case GHOSTTY_ACTION_OPEN_URL: {
            const char* url = action.action.open_url.url;
            if (url) {
                NSString* urlStr = [[NSString alloc] initWithBytes:url
                    length:action.action.open_url.len encoding:NSUTF8StringEncoding];
                if (urlStr) {
                    [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:urlStr]];
                }
            }
            return true;
        }

        case GHOSTTY_ACTION_MOUSE_SHAPE: {
            switch (action.action.mouse_shape) {
                case GHOSTTY_MOUSE_SHAPE_TEXT:
                    [[NSCursor IBeamCursor] set]; break;
                case GHOSTTY_MOUSE_SHAPE_POINTER:
                    [[NSCursor pointingHandCursor] set]; break;
                case GHOSTTY_MOUSE_SHAPE_DEFAULT:
                default:
                    [[NSCursor arrowCursor] set]; break;
            }
            return true;
        }

        default:
            return false;
    }
}

static bool read_clipboard_cb(void* userdata, ghostty_clipboard_e clipboard, void* context) {
    NSPasteboard* pb = [NSPasteboard generalPasteboard];
    NSString* str = [pb stringForType:NSPasteboardTypeString];
    if (str) {
        const char* cstr = [str UTF8String];
        GhosttyView* focused = findFocusedView();
        if (focused && focused.surface) {
            ghostty_surface_complete_clipboard_request(focused.surface, cstr, context, false);
        }
    }
    return true;
}

static void confirm_read_clipboard_cb(void* userdata, const char* data,
                                       void* context, ghostty_clipboard_request_e req) {
    // Auto-confirm clipboard reads
    GhosttyView* focused = findFocusedView();
    if (focused && focused.surface) {
        ghostty_surface_complete_clipboard_request(focused.surface, data, context, false);
    }
}

static void write_clipboard_cb(void* userdata, ghostty_clipboard_e clipboard,
                                const ghostty_clipboard_content_s* content,
                                size_t content_count, bool confirm) {
    if (content_count == 0) return;
    // Use the first content entry (typically text/plain)
    const char* data = content[0].data;
    if (!data) return;
    NSString* str = [NSString stringWithUTF8String:data];
    if (str) {
        NSPasteboard* pb = [NSPasteboard generalPasteboard];
        [pb clearContents];
        [pb setString:str forType:NSPasteboardTypeString];
    }
}

static void close_surface_cb(void* userdata, bool process_alive) {
    dispatch_async(dispatch_get_main_queue(), ^{
        for (auto& pair : g_state.surfaces) {
            GhosttyView* view = pair.second;
            if (view.surface && ghostty_surface_process_exited(view.surface)) {
                std::string capturedId = pair.first;
                if (g_state.surfaceClosedCallback) {
                    g_state.surfaceClosedCallback.NonBlockingCall(
                        [capturedId](Napi::Env env, Napi::Function fn) {
                            fn.Call({Napi::String::New(env, capturedId)});
                        });
                }
                break;
            }
        }
    });
}

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

static Napi::Value InitGhostty(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected Buffer (native window handle)").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Initialize Ghostty
    ghostty_init(0, nullptr);

    // Get NSView* from Electron's getNativeWindowHandle()
    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    NSView* electronView = *reinterpret_cast<NSView**>(buf.Data());
    g_state.window = [electronView window];

    // Create config
    g_state.config = ghostty_config_new();
    ghostty_config_load_default_files(g_state.config);
    ghostty_config_load_recursive_files(g_state.config);
    ghostty_config_finalize(g_state.config);

    // Set up runtime config
    ghostty_runtime_config_s runtime_cfg = {};
    runtime_cfg.userdata = nullptr;
    runtime_cfg.supports_selection_clipboard = false;
    runtime_cfg.wakeup_cb = wakeup_cb;
    runtime_cfg.action_cb = action_cb;
    runtime_cfg.read_clipboard_cb = read_clipboard_cb;
    runtime_cfg.confirm_read_clipboard_cb = confirm_read_clipboard_cb;
    runtime_cfg.write_clipboard_cb = write_clipboard_cb;
    runtime_cfg.close_surface_cb = close_surface_cb;

    // Create app
    g_state.app = ghostty_app_new(&runtime_cfg, g_state.config);
    if (!g_state.app) {
        NSLog(@"ghostty_bridge: primary config failed, trying fallback");
        ghostty_config_free(g_state.config);
        g_state.config = ghostty_config_new();
        ghostty_config_finalize(g_state.config);
        g_state.app = ghostty_app_new(&runtime_cfg, g_state.config);
    }
    if (!g_state.app) {
        Napi::Error::New(env, "Failed to create ghostty app").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Window background blur
    ghostty_set_window_background_blur(g_state.app, (__bridge void*)(g_state.window));

    // Track app focus
    ghostty_app_set_focus(g_state.app, [NSApp isActive]);

    [[NSNotificationCenter defaultCenter]
        addObserverForName:NSApplicationDidBecomeActiveNotification
        object:nil queue:[NSOperationQueue mainQueue]
        usingBlock:^(NSNotification* note) {
            if (g_state.app) ghostty_app_set_focus(g_state.app, true);
        }];
    [[NSNotificationCenter defaultCenter]
        addObserverForName:NSApplicationDidResignActiveNotification
        object:nil queue:[NSOperationQueue mainQueue]
        usingBlock:^(NSNotification* note) {
            if (g_state.app) ghostty_app_set_focus(g_state.app, false);
        }];

    // Re-apply Y-flip for all surfaces when the window geometry changes.
    // This runs synchronously on the main thread, so native views stay
    // perfectly aligned with the window without waiting for the renderer.
    for (NSNotificationName name in @[
        NSWindowDidResizeNotification,
        NSWindowDidMoveNotification,
    ]) {
        [[NSNotificationCenter defaultCenter]
            addObserverForName:name
            object:g_state.window
            queue:[NSOperationQueue mainQueue]
            usingBlock:^(NSNotification* note) {
                refitAllSurfacesForNewContentHeight();
            }];
    }

    NSLog(@"ghostty_bridge: app initialized successfully");
    return env.Undefined();
}

static Napi::Value CreateSurface(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_state.app || !g_state.window) {
        Napi::Error::New(env, "Ghostty not initialized").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected surfaceId string").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string surfaceId = info[0].As<Napi::String>().Utf8Value();

    // Idempotent: if a surface with this ID already exists, destroy it first.
    // This prevents leaked NSViews when React remounts a TerminalPane component
    // (e.g. during split operations where the parent tree structure changes).
    auto existing = g_state.surfaces.find(surfaceId);
    if (existing != g_state.surfaces.end()) {
        GhosttyView* oldView = existing->second;
        if (oldView.surface) {
            ghostty_surface_free(oldView.surface);
            oldView.surface = nullptr;
        }
        [oldView removeFromSuperview];
        g_state.surfaces.erase(existing);
        NSLog(@"ghostty_bridge: destroyed existing surface %s before recreating", surfaceId.c_str());
    }

    // Create the NSView with a minimal initial frame — caller will set bounds via ResizeSurface
    NSView* contentView = [g_state.window contentView];

    GhosttyView* view = [[GhosttyView alloc] initWithFrame:NSMakeRect(0, 0, 1, 1)];
    view.tabId = [NSString stringWithUTF8String:surfaceId.c_str()];
    view.autoresizingMask = NSViewNotSizable;
    view.wantsLayer = YES;
    [view setHidden:YES]; // Caller will show when ready
    [contentView addSubview:view];

    // Configure surface using the factory function
    ghostty_surface_config_s surface_cfg = ghostty_surface_config_new();
    surface_cfg.platform_tag = GHOSTTY_PLATFORM_MACOS;
    surface_cfg.platform.macos.nsview = (__bridge void*)view;
    surface_cfg.userdata = (__bridge void*)view;
    surface_cfg.scale_factor = [[g_state.window screen] backingScaleFactor];
    surface_cfg.font_size = 0;
    surface_cfg.context = GHOSTTY_SURFACE_CONTEXT_TAB;

    ghostty_surface_t surface = ghostty_surface_new(g_state.app, &surface_cfg);
    if (!surface) {
        [view removeFromSuperview];
        Napi::Error::New(env, "Failed to create ghostty surface").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    view.surface = surface;

    NSNumber* screenNum = [g_state.window.screen deviceDescription][@"NSScreenNumber"];
    if (screenNum) {
        ghostty_surface_set_display_id(surface, [screenNum unsignedIntValue]);
    }
    ghostty_surface_refresh(surface);

    g_state.surfaces[surfaceId] = view;

    NSLog(@"ghostty_bridge: surface created %s", surfaceId.c_str());
    return env.Undefined();
}

static Napi::Value DestroySurface(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string surfaceId = info[0].As<Napi::String>().Utf8Value();

    auto it = g_state.surfaces.find(surfaceId);
    if (it != g_state.surfaces.end()) {
        GhosttyView* view = it->second;
        if (view.surface) {
            ghostty_surface_free(view.surface);
            view.surface = nullptr;
        }
        [view removeFromSuperview];
        g_state.surfaces.erase(it);
    }
    return env.Undefined();
}

static Napi::Value FocusSurface(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string surfaceId = info[0].As<Napi::String>().Utf8Value();

    auto it = g_state.surfaces.find(surfaceId);
    if (it != g_state.surfaces.end()) {
        [g_state.window makeFirstResponder:it->second];
        if (it->second.surface) {
            NSNumber* screenNum = [g_state.window.screen deviceDescription][@"NSScreenNumber"];
            if (screenNum) {
                ghostty_surface_set_display_id(it->second.surface, [screenNum unsignedIntValue]);
            }
        }
    }
    return env.Undefined();
}

static Napi::Value ResizeSurface(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string surfaceId = info[0].As<Napi::String>().Utf8Value();
    double domX = info[1].As<Napi::Number>().DoubleValue();
    double domY = info[2].As<Napi::Number>().DoubleValue();
    double w = info[3].As<Napi::Number>().DoubleValue();
    double h = info[4].As<Napi::Number>().DoubleValue();

    auto it = g_state.surfaces.find(surfaceId);
    if (it != g_state.surfaces.end()) {
        applyDomBounds(it->second, domX, domY, w, h);
        // If the surface was waiting for bounds to show, evaluate now
        evaluateVisibility(it->second);
    }
    return env.Undefined();
}

static Napi::Value ShowSurface(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string surfaceId = info[0].As<Napi::String>().Utf8Value();
    auto it = g_state.surfaces.find(surfaceId);
    if (it != g_state.surfaces.end()) {
        it->second.wantVisible = YES;
        evaluateVisibility(it->second); // only actually shows if hasBounds
    }
    return env.Undefined();
}

static Napi::Value HideSurface(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string surfaceId = info[0].As<Napi::String>().Utf8Value();
    auto it = g_state.surfaces.find(surfaceId);
    if (it != g_state.surfaces.end()) {
        it->second.wantVisible = NO;
        evaluateVisibility(it->second); // immediately hides
    }
    return env.Undefined();
}

// Batch visibility: show only the specified surfaces, hide all others.
// Atomic — all hide/show happens in a single native call, no interleaving.
static Napi::Value SetVisibleSurfaces(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsArray()) {
        return env.Undefined();
    }

    Napi::Array ids = info[0].As<Napi::Array>();
    std::unordered_set<std::string> visibleSet;
    for (uint32_t i = 0; i < ids.Length(); i++) {
        Napi::Value val = ids.Get(i);
        if (val.IsString()) {
            visibleSet.insert(val.As<Napi::String>().Utf8Value());
        }
    }

    for (auto& pair : g_state.surfaces) {
        bool want = visibleSet.count(pair.first) > 0;
        pair.second.wantVisible = want ? YES : NO;
        evaluateVisibility(pair.second);
    }

    return env.Undefined();
}

static Napi::Value SetCallback(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string event = info[0].As<Napi::String>().Utf8Value();
    Napi::Function callback = info[1].As<Napi::Function>();

    if (event == "title-changed") {
        g_state.titleChangedCallback = Napi::ThreadSafeFunction::New(
            env, callback, "titleChanged", 0, 1);
    } else if (event == "surface-closed") {
        g_state.surfaceClosedCallback = Napi::ThreadSafeFunction::New(
            env, callback, "surfaceClosed", 0, 1);
    }
    return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("init", Napi::Function::New(env, InitGhostty));
    exports.Set("createSurface", Napi::Function::New(env, CreateSurface));
    exports.Set("destroySurface", Napi::Function::New(env, DestroySurface));
    exports.Set("focusSurface", Napi::Function::New(env, FocusSurface));
    exports.Set("resizeSurface", Napi::Function::New(env, ResizeSurface));
    exports.Set("showSurface", Napi::Function::New(env, ShowSurface));
    exports.Set("hideSurface", Napi::Function::New(env, HideSurface));
    exports.Set("setVisibleSurfaces", Napi::Function::New(env, SetVisibleSurfaces));
    exports.Set("setCallback", Napi::Function::New(env, SetCallback));
    return exports;
}

NODE_API_MODULE(ghostty_bridge, Init)
