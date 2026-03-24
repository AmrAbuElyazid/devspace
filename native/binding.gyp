{
  "targets": [
    {
      "target_name": "ghostty_bridge",
      "sources": ["ghostty_bridge.mm"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "../deps/libghostty/include"
      ],
      "libraries": [
        "<(module_root_dir)/../deps/libghostty/lib/libghostty.a"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "xcode_settings": {
        "OTHER_CPLUSPLUSFLAGS": ["-ObjC++", "-std=c++17"],
        "OTHER_LDFLAGS": [
          "-ObjC",
          "-framework Metal",
          "-framework AppKit",
          "-framework CoreText",
          "-framework QuartzCore",
          "-framework CoreGraphics",
          "-framework Foundation",
          "-framework IOKit",
          "-framework CoreFoundation",
          "-framework UniformTypeIdentifiers"
        ],
        "MACOSX_DEPLOYMENT_TARGET": "13.0"
      }
    }
  ]
}
