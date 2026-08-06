/**
 * `devspace-note-asset://` — images pasted into notes.
 *
 * A note is a plain markdown file, so an image has to live beside it and be
 * referenced by URL. `file://` is not an option: the renderer runs with
 * `webSecurity: true`, which blocks it from a normal page. A dedicated scheme
 * keeps the reference readable in the markdown (`![](devspace-note-asset://
 * <hash>.png)`) while confining reads to the notes assets directory.
 */

import { app, net, protocol } from "electron";
import { basename, join } from "path";
import { pathToFileURL } from "url";

export const NOTE_ASSET_SCHEME = "devspace-note-asset";

const CONTENT_TYPES: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

/**
 * Must run before `app.whenReady()`.
 *
 * `standard` gives the scheme normal URL parsing, and `secure` keeps it from
 * being treated as mixed content inside the renderer.
 */
export function registerNoteAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      privileges: { secure: true, standard: true, supportFetchAPI: true },
      scheme: NOTE_ASSET_SCHEME,
    },
  ]);
}

export function installNoteAssetProtocol(): void {
  const assetsDir = join(app.getPath("userData"), "notes", "assets");

  protocol.handle(NOTE_ASSET_SCHEME, async (request) => {
    // `basename` is the containment check: whatever a URL claims, only a
    // filename directly inside the assets directory can ever be read.
    const requested = decodeURIComponent(new URL(request.url).hostname || "");
    const fileName = basename(requested);

    if (!fileName || fileName !== requested) {
      return new Response("Not found", { status: 404 });
    }

    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    const contentType = CONTENT_TYPES[extension];
    if (!contentType) {
      return new Response("Unsupported asset type", { status: 415 });
    }

    try {
      const response = await net.fetch(pathToFileURL(join(assetsDir, fileName)).toString());
      if (!response.ok) return new Response("Not found", { status: 404 });

      return new Response(response.body, {
        headers: { "Content-Type": contentType },
        status: 200,
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}
