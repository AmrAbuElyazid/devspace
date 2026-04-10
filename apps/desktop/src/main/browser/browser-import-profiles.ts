import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function parseProfilesIni(
  iniContent: string,
): Array<{ name: string; path: string; isRelative: boolean }> {
  const profiles: Array<{ name: string; path: string; isRelative: boolean }> = [];
  let current: { name?: string; path?: string; isRelative?: boolean } | null = null;
  let isProfileSection = false;

  for (const rawLine of iniContent.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith("[")) {
      if (isProfileSection && current?.name && current.path) {
        profiles.push({
          name: current.name,
          path: current.path,
          isRelative: current.isRelative ?? true,
        });
      }

      isProfileSection = /^\[Profile\d+\]$/i.test(line);
      current = isProfileSection ? {} : null;
      continue;
    }

    if (!isProfileSection || !current) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex < 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();

    if (key === "Name") {
      current.name = value;
    } else if (key === "Path") {
      current.path = value;
    } else if (key === "IsRelative") {
      current.isRelative = value === "1";
    }
  }

  if (isProfileSection && current?.name && current.path) {
    profiles.push({
      name: current.name,
      path: current.path,
      isRelative: current.isRelative ?? true,
    });
  }

  return profiles;
}

export function readChromiumProfileMetadata(root: string): Record<string, string> {
  const localStatePath = join(root, "Local State");
  if (!existsSync(localStatePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(localStatePath, "utf8")) as {
      profile?: { info_cache?: Record<string, { name?: string }> };
    };
    const infoCache = parsed.profile?.info_cache ?? {};
    return Object.fromEntries(
      Object.entries(infoCache)
        .filter(([, value]) => typeof value?.name === "string" && value.name.length > 0)
        .map(([key, value]) => [key, value.name as string]),
    );
  } catch (err) {
    console.warn("[browser-import] Chromium profile name parsing failed:", err);
    return {};
  }
}

export function hasChromiumImportableData(profilePath: string): boolean {
  return (
    existsSync(join(profilePath, "History")) ||
    existsSync(join(profilePath, "Network", "Cookies")) ||
    existsSync(join(profilePath, "Cookies"))
  );
}

export function hasZenImportableData(profilePath: string): boolean {
  return (
    existsSync(join(profilePath, "places.sqlite")) ||
    existsSync(join(profilePath, "cookies.sqlite"))
  );
}

export function resolveChromeCookiesDbPath(profilePath: string): string | null {
  const candidates = [join(profilePath, "Network", "Cookies"), join(profilePath, "Cookies")];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
