import { existsSync } from "fs";
import { resolve } from "path";

type PathExists = (candidate: string) => boolean;

type ResolveDevelopmentPathOptions = {
  appPath: string;
  cwd: string;
  moduleDir: string;
  pathExists?: PathExists;
};

function expandCandidateBases(base: string): string[] {
  return [
    base,
    resolve(base, ".."),
    resolve(base, "../.."),
    resolve(base, "../../.."),
    resolve(base, "../../../.."),
  ];
}

function getRepoRootCandidates(base: string): string[] {
  const marker = `${base.includes("\\") ? "apps\\desktop" : "apps/desktop"}`;
  const markerIndex = base.lastIndexOf(marker);
  if (markerIndex === -1) {
    return [];
  }

  return [base.slice(0, markerIndex)].filter(Boolean);
}

export function resolveDevelopmentPath(
  relativePath: string,
  options: ResolveDevelopmentPathOptions,
): string {
  const pathExists = options.pathExists ?? existsSync;
  const bases = [options.cwd, options.appPath, options.moduleDir];
  const repoRootCandidates = Array.from(
    new Set(bases.flatMap(getRepoRootCandidates).map((base) => resolve(base, relativePath))),
  );
  const candidates = Array.from(
    new Set([
      ...repoRootCandidates,
      ...bases.flatMap(expandCandidateBases).map((base) => resolve(base, relativePath)),
    ]),
  );

  const resolvedPath = candidates.find((candidate) => pathExists(candidate));
  if (resolvedPath) {
    return resolvedPath;
  }

  if (repoRootCandidates[0]) {
    return repoRootCandidates[0];
  }

  throw new Error(
    `Could not resolve development path for ${relativePath}. Tried: ${candidates.join(", ")}`,
  );
}
