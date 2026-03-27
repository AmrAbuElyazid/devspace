#include "ghostty_bridge.h"
#include <napi.h>
#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>
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
        // Notify JS that this surface received focus so the renderer
        // can update focusedGroupId for correct shortcut dispatch.
        if (self.tabId && g_state.surfaceFocusedCallback) {
            std::string sid = [self.tabId UTF8String];
            g_state.surfaceFocusedCallback.NonBlockingCall(
                [sid](Napi::Env env, Napi::Function fn) {
                    fn.Call({ Napi::String::New(env, sid) });
                }
            );
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
    [super dealloc];
}

- (void)screenDidChange:(NSNotification*)notification {
    if (!self.surface || !self.window) return;
    [self setNeedsLayout:YES];
    NSNumber* screenNum = [self.window.screen deviceDescription][@"NSScreenNumber"];
    if (screenNum) {
        ghostty_surface_set_display_id(self.surface, [screenNum unsignedIntValue]);
    }
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

// Map NSEvent modifier flags to Ghostty modifier bitmask.
// CapsLock is intentionally excluded — it interferes with keybinding matching
// and Ghostty handles it internally via the text translation path.
static ghostty_input_mods_e translateMods(NSEventModifierFlags flags) {
    uint32_t mods = GHOSTTY_MODS_NONE;
    if (flags & NSEventModifierFlagShift)   mods |= GHOSTTY_MODS_SHIFT;
    if (flags & NSEventModifierFlagControl) mods |= GHOSTTY_MODS_CTRL;
    if (flags & NSEventModifierFlagOption)  mods |= GHOSTTY_MODS_ALT;
    if (flags & NSEventModifierFlagCommand) mods |= GHOSTTY_MODS_SUPER;
    return (ghostty_input_mods_e)mods;
}

// Consumed mods are modifiers that were used for text translation.
// Control and Command never contribute to text translation, so they
// should be excluded from consumed_mods.  Only Shift and Option can
// be consumed (Shift for uppercase, Option for special characters).
static ghostty_input_mods_e consumedMods(NSEventModifierFlags flags) {
    uint32_t mods = GHOSTTY_MODS_NONE;
    if (flags & NSEventModifierFlagShift)  mods |= GHOSTTY_MODS_SHIFT;
    if (flags & NSEventModifierFlagOption) mods |= GHOSTTY_MODS_ALT;
    return (ghostty_input_mods_e)mods;
}

// Return true if the character is a control character that should NOT
// be sent as text to Ghostty (Ghostty encodes these from keycodes).
static bool isControlCharacter(unichar ch) {
    return ch < 0x20 || ch == 0x7F;
}

// Return true if the character is in the macOS Private Use Area range
// used for function/arrow keys.  These must never be sent as text.
static bool isPUA(unichar ch) {
    return ch >= 0xF700 && ch <= 0xF8FF;
}

// Get the unshifted codepoint for a key event using UCKeyTranslate.
// This is more reliable than charactersIgnoringModifiers for non-Latin
// keyboard layouts (e.g. Korean, Japanese, Dvorak-QWERTY).
static uint32_t unshiftedCodepointFromEvent(NSEvent* event) {
    // Try UCKeyTranslate with the current keyboard layout
    TISInputSourceRef source = TISCopyCurrentKeyboardInputSource();
    if (source) {
        CFDataRef layoutData = (CFDataRef)TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData);
        if (layoutData) {
            const UCKeyboardLayout* keyboardLayout =
                (const UCKeyboardLayout*)CFDataGetBytePtr(layoutData);
            UInt32 deadKeyState = 0;
            UniChar chars[4] = {};
            UniCharCount length = 0;
            OSStatus status = UCKeyTranslate(
                keyboardLayout,
                event.keyCode,
                kUCKeyActionDisplay,
                0,  // no modifiers — we want the unshifted character
                LMGetKbdType(),
                kUCKeyTranslateNoDeadKeysBit,
                &deadKeyState,
                4,
                &length,
                chars
            );
            CFRelease(source);
            if (status == noErr && length > 0) {
                unichar ch = chars[0];
                // Only use if it's a printable, non-PUA character
                if (ch >= 0x20 && !isPUA(ch)) {
                    // Lowercase for consistency (UCKeyTranslate returns uppercase for some layouts)
                    NSString* str = [[NSString stringWithCharacters:chars length:length] lowercaseString];
                    if (str.length > 0) return (uint32_t)[str characterAtIndex:0];
                }
            }
        } else {
            CFRelease(source);
        }
    }

    // Fallback: try ASCII-capable keyboard source
    TISInputSourceRef asciiSource = TISCopyCurrentASCIICapableKeyboardInputSource();
    if (asciiSource) {
        CFDataRef layoutData = (CFDataRef)TISGetInputSourceProperty(asciiSource, kTISPropertyUnicodeKeyLayoutData);
        if (layoutData) {
            const UCKeyboardLayout* keyboardLayout =
                (const UCKeyboardLayout*)CFDataGetBytePtr(layoutData);
            UInt32 deadKeyState = 0;
            UniChar chars[4] = {};
            UniCharCount length = 0;
            OSStatus status = UCKeyTranslate(
                keyboardLayout,
                event.keyCode,
                kUCKeyActionDisplay,
                0,
                LMGetKbdType(),
                kUCKeyTranslateNoDeadKeysBit,
                &deadKeyState,
                4,
                &length,
                chars
            );
            CFRelease(asciiSource);
            if (status == noErr && length > 0) {
                unichar ch = chars[0];
                if (ch >= 0x20 && !isPUA(ch)) {
                    // Lowercase for consistency with the primary layout branch
                    NSString* str = [[NSString stringWithCharacters:chars length:length] lowercaseString];
                    if (str.length > 0) return (uint32_t)[str characterAtIndex:0];
                }
            }
        } else {
            CFRelease(asciiSource);
        }
    }

    // Final fallback: use event's charactersIgnoringModifiers
    NSString* unshifted = event.charactersIgnoringModifiers;
    if (unshifted && unshifted.length > 0) {
        unichar ch = [unshifted characterAtIndex:0];
        if (!isPUA(ch)) return (uint32_t)ch;
    }
    return 0;
}

// Get the text to send for a key event.
// For control-modified keys, strips the Ctrl modifier and returns the
// base character so Ghostty's KeyEncoder can apply its own encoding.
// Filters out PUA characters (arrows, function keys).
static NSString* textForKeyEvent(NSEvent* event) {
    NSString* chars = event.characters;
    if (!chars || chars.length == 0) return nil;

    if (chars.length == 1) {
        unichar ch = [chars characterAtIndex:0];
        NSEventModifierFlags flags = event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask;

        // Control characters: strip Ctrl and ask AppKit for the base character
        // so Ghostty's KeyEncoder handles ctrl encoding (not us).
        if (isControlCharacter(ch)) {
            if (flags & NSEventModifierFlagControl) {
                NSEventModifierFlags strippedMods = event.modifierFlags & ~NSEventModifierFlagControl;
                NSString* baseChar = [event charactersByApplyingModifiers:strippedMods];
                return (baseChar && baseChar.length > 0) ? baseChar : event.charactersIgnoringModifiers;
            }
            // AppKit bug: Shift+` can produce ESC (0x1B) instead of "~"
            if (ch == 0x1B && (flags == NSEventModifierFlagShift)) {
                NSString* ignoring = event.charactersIgnoringModifiers;
                if (ignoring && [ignoring isEqualToString:@"`"]) {
                    return @"~";
                }
            }
        }

        // Filter Private Use Area characters (function keys, arrows)
        if (isPUA(ch)) return nil;
    }

    return chars;
}

// Return true if text should be sent to Ghostty.
// Suppresses control characters (< 0x20 and 0x7F) — Ghostty encodes
// these from keycodes, sending them as text would cause double-encoding.
static bool shouldSendText(NSString* text) {
    if (!text || text.length == 0) return false;
    if (text.length == 1) {
        return !isControlCharacter([text characterAtIndex:0]);
    }
    return true;
}

// Build a ghostty_input_key_s with translation mods and consumed_mods
// properly set.  Used by performKeyEquivalent and keyUp for consistency.
static ghostty_input_key_s buildKeyEvent(NSEvent* event, ghostty_surface_t surface) {
    ghostty_input_key_s key = {};
    key.action = GHOSTTY_ACTION_PRESS;
    key.keycode = (uint32_t)event.keyCode;
    key.mods = translateMods(event.modifierFlags);

    // Translate mods to respect Ghostty config (e.g., macos-option-as-alt)
    ghostty_input_mods_e translatedMods =
        ghostty_surface_key_translation_mods(surface, key.mods);

    // Reconstruct NSEventModifierFlags from translated Ghostty mods for consumed_mods
    NSEventModifierFlags translatedFlags = 0;
    if (translatedMods & GHOSTTY_MODS_SHIFT)  translatedFlags |= NSEventModifierFlagShift;
    if (translatedMods & GHOSTTY_MODS_CTRL)   translatedFlags |= NSEventModifierFlagControl;
    if (translatedMods & GHOSTTY_MODS_ALT)    translatedFlags |= NSEventModifierFlagOption;
    if (translatedMods & GHOSTTY_MODS_SUPER)  translatedFlags |= NSEventModifierFlagCommand;

    key.consumed_mods = consumedMods(translatedFlags);
    key.text = nullptr;
    key.composing = false;
    key.unshifted_codepoint = unshiftedCodepointFromEvent(event);
    return key;
}

// ---- Keyboard ----

// Convert an NSEvent to a normalized key name string matching the JS
// shortcut registry format (e.g. "b", "arrowleft", "enter", "1").
// Uses keyCode for special keys and unshiftedCodepointFromEvent for
// layout-independent character identification.
static NSString* eventToKeyName(NSEvent* event) {
    // Special keys by keyCode (layout-independent)
    switch (event.keyCode) {
        case 123: return @"arrowleft";
        case 124: return @"arrowright";
        case 125: return @"arrowdown";
        case 126: return @"arrowup";
        case 36:  return @"enter";
        case 48:  return @"tab";
        case 53:  return @"escape";
        case 49:  return @"space";
        case 51:  return @"backspace";
        case 117: return @"delete";
        case 122: return @"f1";
        case 120: return @"f2";
        case 99:  return @"f3";
        case 118: return @"f4";
        case 96:  return @"f5";
        case 97:  return @"f6";
        case 98:  return @"f7";
        case 100: return @"f8";
        case 101: return @"f9";
        case 109: return @"f10";
        case 103: return @"f11";
        case 111: return @"f12";
        default: break;
    }

    // For regular keys, use UCKeyTranslate to get the base unshifted character.
    // This handles non-Latin layouts and ensures Shift+[ gives "[" not "{".
    uint32_t cp = unshiftedCodepointFromEvent(event);
    if (cp > 0) {
        unichar ch = (unichar)cp;
        NSString* str = [[NSString stringWithCharacters:&ch length:1] lowercaseString];
        if (str.length > 0) return str;
    }

    return nil;
}

// Check if a key event matches any reserved shortcut from the dynamic list.
// These shortcuts always propagate to Electron's menu system instead of
// being consumed by Ghostty.
static bool isAppReservedShortcut(NSEvent* event) {
    if (g_state.reservedShortcuts.empty()) return false;

    NSString* keyName = eventToKeyName(event);
    if (!keyName) return false;

    NSEventModifierFlags flags = event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask;
    bool hasCmd   = (flags & NSEventModifierFlagCommand) != 0;
    bool hasShift = (flags & NSEventModifierFlagShift) != 0;
    bool hasOpt   = (flags & NSEventModifierFlagOption) != 0;
    bool hasCtrl  = (flags & NSEventModifierFlagControl) != 0;

    std::string key = [keyName UTF8String];

    for (const auto& s : g_state.reservedShortcuts) {
        if (s.key == key &&
            s.command == hasCmd &&
            s.shift == hasShift &&
            s.option == hasOpt &&
            s.control == hasCtrl) {
            return true;
        }
    }

    return false;
}

// Intercept Cmd+key combos before Electron's menu system eats them.
// App-reserved shortcuts are always passed through to Electron.
// Also checks Ghostty keybindings via ghostty_surface_key_is_binding.
- (BOOL)performKeyEquivalent:(NSEvent*)event {
    if (!self.surface) return NO;
    if (event.type != NSEventTypeKeyDown) return NO;
    if ([self.window firstResponder] != self) return NO;

    // During IME composition, don't intercept unless Cmd is held
    // (Cmd is never part of IME input sequences).
    if ([self hasMarkedText] &&
        !(event.modifierFlags & NSEventModifierFlagCommand)) {
        return NO;
    }

    // Let app-reserved shortcuts propagate to Electron's menu accelerators
    if (isAppReservedShortcut(event)) return NO;

    // Check if this key matches a Ghostty keybinding.
    // This allows Ghostty bindings (e.g. Cmd+K for clear) to be routed
    // correctly even before we check the Cmd modifier.
    {
        ghostty_input_key_s bindKey = buildKeyEvent(event, self.surface);
        bindKey.action = event.isARepeat ? GHOSTTY_ACTION_REPEAT : GHOSTTY_ACTION_PRESS;
        NSString* text = textForKeyEvent(event);
        if (text && shouldSendText(text)) {
            const char* ctext = [text UTF8String];
            bindKey.text = ctext;
        }
        ghostty_binding_flags_e flags = (ghostty_binding_flags_e)0;
        if (ghostty_surface_key_is_binding(self.surface, bindKey, &flags)) {
            bool isConsumed = (flags & GHOSTTY_BINDING_FLAGS_CONSUMED) != 0;
            bool isAll = (flags & GHOSTTY_BINDING_FLAGS_ALL) != 0;
            bool isPerformable = (flags & GHOSTTY_BINDING_FLAGS_PERFORMABLE) != 0;

            // If the binding is consumed and not meant for all/performable,
            // let the menu system try first (so app shortcuts still work).
            if (isConsumed && !isAll && !isPerformable) {
                return NO;
            }

            // Route directly to keyDown for Ghostty to handle
            [self keyDown:event];
            return YES;
        }
    }

    if (event.modifierFlags & NSEventModifierFlagCommand) {
        ghostty_input_key_s key = buildKeyEvent(event, self.surface);
        key.action = event.isARepeat ? GHOSTTY_ACTION_REPEAT : GHOSTTY_ACTION_PRESS;

        NSString* text = textForKeyEvent(event);
        if (text && shouldSendText(text)) {
            const char* ctext = [text UTF8String];
            key.text = ctext;
            bool handled = ghostty_surface_key(self.surface, key);
            if (handled) return YES;
        } else {
            key.text = nullptr;
            key.consumed_mods = GHOSTTY_MODS_NONE;
            bool handled = ghostty_surface_key(self.surface, key);
            if (handled) return YES;
        }
    }

    return NO;
}

- (void)keyDown:(NSEvent*)event {
    if (!self.surface) return;

    NSEventModifierFlags flags = event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask;
    BOOL hadMarkedText = [self hasMarkedText];

    // ---- Ctrl fast path ----
    // For Ctrl-modified terminal input (Ctrl+C, Ctrl+D, etc.), bypass
    // interpretKeyEvents and send directly to Ghostty.  This avoids IME
    // interference and ensures reliable control character delivery.
    if ((flags & NSEventModifierFlagControl) &&
        !(flags & NSEventModifierFlagCommand) &&
        !(flags & NSEventModifierFlagOption) &&
        !hadMarkedText) {

        ghostty_surface_set_focus(self.surface, true);

        ghostty_input_key_s key = {};
        key.action = event.isARepeat ? GHOSTTY_ACTION_REPEAT : GHOSTTY_ACTION_PRESS;
        key.keycode = (uint32_t)event.keyCode;
        key.mods = translateMods(event.modifierFlags);
        key.consumed_mods = GHOSTTY_MODS_NONE;  // Ctrl is never consumed for text
        key.composing = false;
        key.unshifted_codepoint = unshiftedCodepointFromEvent(event);

        // Use charactersIgnoringModifiers to get the base letter (e.g. "c" for Ctrl+C)
        // instead of the pre-encoded control character ("\x03").
        NSString* text = event.charactersIgnoringModifiers;
        if (text && text.length > 0) {
            key.text = [text UTF8String];
        }

        ghostty_surface_key(self.surface, key);
        return;
    }

    // ---- IME path: route through interpretKeyEvents ----
    // Only use interpretKeyEvents when IME composition is active.
    // For normal input, we compute text directly from the event —
    // interpretKeyEvents can interfere with non-IME text delivery
    // in an Electron/NSView context.
    if (hadMarkedText) {
        [self.keyTextAccumulator removeAllObjects];
        [self interpretKeyEvents:@[event]];

        ghostty_input_key_s key = {};
        key.action = event.isARepeat ? GHOSTTY_ACTION_REPEAT : GHOSTTY_ACTION_PRESS;
        key.keycode = (uint32_t)event.keyCode;
        key.composing = [self hasMarkedText];
        key.mods = translateMods(event.modifierFlags);
        key.consumed_mods = GHOSTTY_MODS_NONE;
        key.unshifted_codepoint = unshiftedCodepointFromEvent(event);

        if (self.keyTextAccumulator.count > 0) {
            NSString* accum = [self.keyTextAccumulator componentsJoinedByString:@""];
            if (accum.length > 0) {
                key.text = [accum UTF8String];
                if (!key.composing) {
                    key.consumed_mods = consumedMods(event.modifierFlags);
                }
            }
        }

        ghostty_surface_key(self.surface, key);
        return;
    }

    // ---- Normal path: send key directly to Ghostty ----

    ghostty_input_mods_e originalMods = translateMods(event.modifierFlags);
    ghostty_input_mods_e translatedMods =
        ghostty_surface_key_translation_mods(self.surface, originalMods);

    ghostty_input_key_s key = {};
    key.action = event.isARepeat ? GHOSTTY_ACTION_REPEAT : GHOSTTY_ACTION_PRESS;
    key.keycode = (uint32_t)event.keyCode;
    key.composing = false;
    key.unshifted_codepoint = unshiftedCodepointFromEvent(event);

    if (translatedMods != originalMods) {
        // Mods were translated (e.g. Option treated as Alt via macos-option-as-alt).
        // Use charactersIgnoringModifiers for text since the original characters
        // would include the Option-modified glyph.
        key.mods = translatedMods;
        NSString* text = event.charactersIgnoringModifiers;
        if (text && text.length > 0 && !isPUA([text characterAtIndex:0])) {
            key.text = [text UTF8String];
            // Only Shift can be consumed here (Option was stripped by translation)
            key.consumed_mods = (translatedMods & GHOSTTY_MODS_SHIFT)
                ? GHOSTTY_MODS_SHIFT : GHOSTTY_MODS_NONE;
        } else {
            key.consumed_mods = GHOSTTY_MODS_NONE;
        }
    } else {
        // No mod translation — use textForKeyEvent for proper handling
        // of control characters, PUA filtering, etc.
        key.mods = originalMods;
        NSString* text = textForKeyEvent(event);
        if (text && shouldSendText(text)) {
            key.text = [text UTF8String];
            key.consumed_mods = consumedMods(event.modifierFlags);
        } else {
            key.consumed_mods = GHOSTTY_MODS_NONE;
        }
    }

    ghostty_surface_key(self.surface, key);
}

- (void)keyUp:(NSEvent*)event {
    if (!self.surface) return;

    // Use buildKeyEvent for consistent translation mods between PRESS and RELEASE
    ghostty_input_key_s key = buildKeyEvent(event, self.surface);
    key.action = GHOSTTY_ACTION_RELEASE;
    key.text = nullptr;
    key.composing = false;
    key.consumed_mods = GHOSTTY_MODS_NONE;
    ghostty_surface_key(self.surface, key);
}

- (void)flagsChanged:(NSEvent*)event {
    if (!self.surface) return;
    ghostty_input_key_s key = {};
    key.action = GHOSTTY_ACTION_PRESS;  // always PRESS for modifier events
    key.mods = translateMods(event.modifierFlags);
    key.keycode = (uint32_t)event.keyCode;
    key.consumed_mods = GHOSTTY_MODS_NONE;
    key.text = nullptr;
    key.composing = false;
    ghostty_surface_key(self.surface, key);
}

// ---- NSTextInputClient (IME) ----

// Some third-party voice input apps inject committed text by sending
// the responder-chain insertText: action (single-argument form).
// Route that into our NSTextInputClient path so text lands in the terminal.
- (void)insertText:(id)string {
    [self insertText:string replacementRange:NSMakeRange(NSNotFound, 0)];
}

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
            if (target.tag != GHOSTTY_TARGET_SURFACE) return false;
            std::string surfaceId = findSurfaceId(target.target.surface);
            if (surfaceId.empty()) return false;
            const char* pwd = action.action.pwd.pwd;
            std::string pwdStr(pwd ? pwd : "");
            std::string capturedId = surfaceId;
            if (g_state.pwdChangedCallback) {
                g_state.pwdChangedCallback.NonBlockingCall(
                    [capturedId, pwdStr](Napi::Env env, Napi::Function fn) {
                        fn.Call({Napi::String::New(env, capturedId),
                                 Napi::String::New(env, pwdStr)});
                    });
            }
            return true;
        }

        case GHOSTTY_ACTION_DESKTOP_NOTIFICATION: {
            if (target.tag != GHOSTTY_TARGET_SURFACE) return false;
            std::string surfaceId = findSurfaceId(target.target.surface);
            if (surfaceId.empty()) return false;
            const char* title = action.action.desktop_notification.title;
            const char* body = action.action.desktop_notification.body;
            std::string titleStr(title ? title : "");
            std::string bodyStr(body ? body : "");
            std::string capturedId = surfaceId;
            if (g_state.notificationCallback) {
                g_state.notificationCallback.NonBlockingCall(
                    [capturedId, titleStr, bodyStr](Napi::Env env, Napi::Function fn) {
                        fn.Call({Napi::String::New(env, capturedId),
                                 Napi::String::New(env, titleStr),
                                 Napi::String::New(env, bodyStr)});
                    });
            }
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

// Resolve the surface userdata pointer to a GhosttyView.
// The surface_cfg.userdata is set to (__bridge void*)view during CreateSurface.
static GhosttyView* viewFromUserdata(void* userdata) {
    if (!userdata) return nil;
    return (__bridge GhosttyView*)userdata;
}

// Find the surface ID for a given GhosttyView.
static std::string findSurfaceIdForView(GhosttyView* view) {
    if (!view) return "";
    for (auto& pair : g_state.surfaces) {
        if (pair.second == view) return pair.first;
    }
    return "";
}

static bool read_clipboard_cb(void* userdata, ghostty_clipboard_e clipboard, void* context) {
    // userdata is the per-surface GhosttyView* that initiated the clipboard request
    GhosttyView* view = viewFromUserdata(userdata);
    if (!view) view = findFocusedView();  // fallback

    NSPasteboard* pb = [NSPasteboard generalPasteboard];
    NSString* str = [pb stringForType:NSPasteboardTypeString];

    // If no text on the clipboard, check for image data.
    // Save the image to a temp file and paste the file path instead (file-path paste fallback).
    if (!str) {
        NSData* imageData = [pb dataForType:NSPasteboardTypePNG];
        BOOL needsConversion = NO;
        if (!imageData) {
            imageData = [pb dataForType:NSPasteboardTypeTIFF];
            needsConversion = YES;
        }
        if (imageData) {
            // Convert TIFF → PNG
            if (needsConversion) {
                NSBitmapImageRep* rep = [NSBitmapImageRep imageRepWithData:imageData];
                if (rep) {
                    imageData = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
                }
            }
            if (imageData) {
                NSString* tempDir = NSTemporaryDirectory();
                NSString* filename = [NSString stringWithFormat:@"devspace-paste-%@.png",
                    [[NSUUID UUID] UUIDString]];
                NSString* tempPath = [tempDir stringByAppendingPathComponent:filename];
                if ([imageData writeToFile:tempPath atomically:YES]) {
                    // Shell-escape the path and use it as paste text
                    NSString* escaped = [tempPath stringByReplacingOccurrencesOfString:@"'" withString:@"'\\''"];
                    str = [NSString stringWithFormat:@"'%@'", escaped];
                }
            }
        }
    }

    if (str && view && view.surface) {
        ghostty_surface_complete_clipboard_request(view.surface, [str UTF8String], context, false);
    }
    return true;
}

static void confirm_read_clipboard_cb(void* userdata, const char* data,
                                       void* context, ghostty_clipboard_request_e req) {
    // Auto-confirm clipboard reads, routing to the requesting surface
    GhosttyView* view = viewFromUserdata(userdata);
    if (!view) view = findFocusedView();

    if (view && view.surface) {
        ghostty_surface_complete_clipboard_request(view.surface, data, context, false);
    }
}

static void write_clipboard_cb(void* userdata, ghostty_clipboard_e clipboard,
                                const ghostty_clipboard_content_s* content,
                                size_t content_count, bool confirm) {
    if (content_count == 0 || !content) return;

    // Iterate content entries looking for text/plain MIME type
    const char* fallback = nullptr;
    for (size_t i = 0; i < content_count; i++) {
        const char* data = content[i].data;
        if (!data) continue;

        if (content[i].mime) {
            NSString* mime = [NSString stringWithUTF8String:content[i].mime];
            if ([mime hasPrefix:@"text/plain"]) {
                NSString* str = [NSString stringWithUTF8String:data];
                if (str) {
                    NSPasteboard* pb = [NSPasteboard generalPasteboard];
                    [pb clearContents];
                    [pb setString:str forType:NSPasteboardTypeString];
                }
                return;
            }
        }
        if (!fallback) fallback = data;
    }

    // Fallback: use first available content
    if (fallback) {
        NSString* str = [NSString stringWithUTF8String:fallback];
        if (str) {
            NSPasteboard* pb = [NSPasteboard generalPasteboard];
            [pb clearContents];
            [pb setString:str forType:NSPasteboardTypeString];
        }
    }
}

static void close_surface_cb(void* userdata, bool process_alive) {
    // userdata is the per-surface GhosttyView* whose process exited
    GhosttyView* view = viewFromUserdata(userdata);
    if (!view) return;

    std::string capturedId = findSurfaceIdForView(view);
    if (capturedId.empty()) return;

    dispatch_async(dispatch_get_main_queue(), ^{
        if (g_state.surfaceClosedCallback) {
            g_state.surfaceClosedCallback.NonBlockingCall(
                [capturedId](Napi::Env env, Napi::Function fn) {
                    fn.Call({Napi::String::New(env, capturedId)});
                });
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

    // Ensure TUI apps get colors
    unsetenv("NO_COLOR");

    // Set GHOSTTY_RESOURCES_DIR so Ghostty can find terminfo (xterm-ghostty),
    // shell integration scripts, and themes.  Without this, programs won't
    // know the terminal's capabilities and may produce garbled output.
    if (!getenv("GHOSTTY_RESOURCES_DIR")) {
        // Check for system Ghostty installation
        NSString* ghosttyAppResources = @"/Applications/Ghostty.app/Contents/Resources/ghostty";
        if ([[NSFileManager defaultManager] fileExistsAtPath:ghosttyAppResources]) {
            setenv("GHOSTTY_RESOURCES_DIR", [ghosttyAppResources UTF8String], 0);
        }
    }

    // Set TERM so programs know the terminal capabilities.
    // Only set if not already present (respect user overrides).
    // Ghostty also sets TERM internally when spawning PTYs.
    if (!getenv("TERM")) {
        // Only set if the terminfo entry exists
        NSString* ghosttyResources = [NSString stringWithUTF8String:getenv("GHOSTTY_RESOURCES_DIR") ?: ""];
        NSString* terminfoPath = [ghosttyResources stringByAppendingPathComponent:@"terminfo"];
        if ([[NSFileManager defaultManager] fileExistsAtPath:terminfoPath]) {
            setenv("TERM", "xterm-ghostty", 1);
            // Also set TERMINFO so ncurses can find the entry
            if (!getenv("TERMINFO")) {
                setenv("TERMINFO", [terminfoPath UTF8String], 0);
            }
        }
    }

    // Set TERM_PROGRAM for shell integration detection
    setenv("TERM_PROGRAM", "ghostty", 0);

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

    // Optionally accept a second argument (options object with `cwd`)
    NSString* workingDirectory = nil;
    if (info.Length() > 1 && info[1].IsObject()) {
        Napi::Object opts = info[1].As<Napi::Object>();
        Napi::Value cwdVal = opts.Get("cwd");
        if (cwdVal.IsString()) {
            workingDirectory = [NSString stringWithUTF8String:cwdVal.As<Napi::String>().Utf8Value().c_str()];
        }
    }

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

    if (workingDirectory) {
        surface_cfg.working_directory = [workingDirectory UTF8String];
    }

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
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected surfaceId string").ThrowAsJavaScriptException();
        return env.Undefined();
    }
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
    if (info.Length() < 1 || !info[0].IsString()) return env.Undefined();
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
    if (info.Length() < 1 || !info[0].IsString()) return env.Undefined();
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
    if (info.Length() < 1 || !info[0].IsString()) return env.Undefined();
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
    } else if (event == "surface-focused") {
        g_state.surfaceFocusedCallback = Napi::ThreadSafeFunction::New(
            env, callback, "surfaceFocused", 0, 1);
    } else if (event == "pwd-changed") {
        g_state.pwdChangedCallback = Napi::ThreadSafeFunction::New(
            env, callback, "pwdChanged", 0, 1);
    } else if (event == "notification") {
        g_state.notificationCallback = Napi::ThreadSafeFunction::New(
            env, callback, "notification", 0, 1);
    }
    return env.Undefined();
}

// Send a Ghostty binding action string to a surface (e.g. "increase_font_size:1").
// Returns true if the action was handled by Ghostty.
static Napi::Value SendBindingAction(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
        return Napi::Boolean::New(env, false);
    }

    std::string surfaceId = info[0].As<Napi::String>().Utf8Value();
    std::string action = info[1].As<Napi::String>().Utf8Value();

    auto it = g_state.surfaces.find(surfaceId);
    if (it == g_state.surfaces.end() || !it->second.surface) {
        return Napi::Boolean::New(env, false);
    }

    bool handled = ghostty_surface_binding_action(
        it->second.surface,
        action.c_str(),
        (uintptr_t)action.length()
    );
    return Napi::Boolean::New(env, handled);
}

// Set the dynamic list of reserved shortcuts from the JS shortcut registry.
// Called on init and whenever user shortcuts change.
// Accepts an array of objects: [{ key, command, shift, option, control }, ...]
static Napi::Value SetReservedShortcuts(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsArray()) return env.Undefined();

    Napi::Array arr = info[0].As<Napi::Array>();
    std::vector<ReservedShortcut> shortcuts;
    shortcuts.reserve(arr.Length());

    for (uint32_t i = 0; i < arr.Length(); i++) {
        Napi::Value val = arr.Get(i);
        if (!val.IsObject()) continue;
        Napi::Object obj = val.As<Napi::Object>();

        Napi::Value keyVal = obj.Get("key");
        Napi::Value cmdVal = obj.Get("command");
        Napi::Value shiftVal = obj.Get("shift");
        Napi::Value optVal = obj.Get("option");
        Napi::Value ctrlVal = obj.Get("control");

        if (!keyVal.IsString() || !cmdVal.IsBoolean() || !shiftVal.IsBoolean() ||
            !optVal.IsBoolean() || !ctrlVal.IsBoolean()) {
            continue;
        }

        ReservedShortcut s;
        s.key = keyVal.As<Napi::String>().Utf8Value();
        s.command = cmdVal.As<Napi::Boolean>().Value();
        s.shift = shiftVal.As<Napi::Boolean>().Value();
        s.option = optVal.As<Napi::Boolean>().Value();
        s.control = ctrlVal.As<Napi::Boolean>().Value();
        shortcuts.push_back(std::move(s));
    }

    g_state.reservedShortcuts = std::move(shortcuts);
    return env.Undefined();
}

// Resign first responder if a GhosttyView currently has it, returning
// keyboard focus to the Electron web content view.
static Napi::Value BlurSurfaces(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_state.window) return env.Undefined();

    NSResponder* responder = [g_state.window firstResponder];
    if ([responder isKindOfClass:[GhosttyView class]]) {
        [g_state.window makeFirstResponder:[g_state.window contentView]];
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
    exports.Set("blurSurfaces", Napi::Function::New(env, BlurSurfaces));
    exports.Set("sendBindingAction", Napi::Function::New(env, SendBindingAction));
    exports.Set("setReservedShortcuts", Napi::Function::New(env, SetReservedShortcuts));
    exports.Set("setCallback", Napi::Function::New(env, SetCallback));
    return exports;
}

NODE_API_MODULE(ghostty_bridge, Init)
