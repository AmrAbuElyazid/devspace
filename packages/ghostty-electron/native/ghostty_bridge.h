#pragma once

#include <napi.h>
#import <AppKit/AppKit.h>
#include <mutex>
#include <unordered_map>
#include <vector>
#include <string>

#include "ghostty.h"

@class GhosttyView;

// A reserved shortcut from the JS shortcut registry.
// Used to prevent Ghostty from consuming app-level keyboard shortcuts.
struct ReservedShortcut {
    std::string key;   // normalized key name (e.g. "b", "arrowleft", "enter", "1")
    bool command;
    bool shift;
    bool option;
    bool control;
};

struct GhosttyAppState {
    ghostty_app_t app = nullptr;
    ghostty_config_t config = nullptr;
    NSWindow* window = nullptr;
    std::unordered_map<std::string, GhosttyView*> surfaces;

    // Dynamic reserved shortcuts list — set from JS via setReservedShortcuts().
    // Replaces the hardcoded isAppReservedShortcut() function.
    std::vector<ReservedShortcut> reservedShortcuts;

    Napi::ThreadSafeFunction titleChangedCallback;
    Napi::ThreadSafeFunction surfaceClosedCallback;
    Napi::ThreadSafeFunction surfaceFocusedCallback;
    Napi::ThreadSafeFunction modifierChangedCallback;
    Napi::ThreadSafeFunction pwdChangedCallback;
    Napi::ThreadSafeFunction notificationCallback;
    Napi::ThreadSafeFunction searchStartCallback;
    Napi::ThreadSafeFunction searchEndCallback;
    Napi::ThreadSafeFunction searchTotalCallback;
    Napi::ThreadSafeFunction searchSelectedCallback;

    id appDidBecomeActiveObserver = nil;
    id appDidResignActiveObserver = nil;
    std::vector<id> windowObserverTokens;
    std::mutex surfacesMutex;
};

extern GhosttyAppState g_state;

Napi::Object Init(Napi::Env env, Napi::Object exports);
