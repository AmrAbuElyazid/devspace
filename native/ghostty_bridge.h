#pragma once

#include <napi.h>
#import <AppKit/AppKit.h>
#include <unordered_map>
#include <string>

#include "ghostty.h"

@class GhosttyView;

struct GhosttyAppState {
    ghostty_app_t app = nullptr;
    ghostty_config_t config = nullptr;
    NSWindow* window = nullptr;
    std::unordered_map<std::string, GhosttyView*> surfaces;

    Napi::ThreadSafeFunction titleChangedCallback;
    Napi::ThreadSafeFunction surfaceClosedCallback;
};

extern GhosttyAppState g_state;

Napi::Object Init(Napi::Env env, Napi::Object exports);
