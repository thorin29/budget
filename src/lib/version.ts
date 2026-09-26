/**
 * Set from package.json by next.config.ts at build time. `BUILD_SHA` is
 * optional and supplied by the container build, so a running instance can be
 * traced to an exact commit even between releases.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
export const BUILD_SHA = process.env.BUILD_SHA ?? null;

export function versionLabel(): string {
  return BUILD_SHA ? `v${APP_VERSION} (${BUILD_SHA.slice(0, 7)})` : `v${APP_VERSION}`;
}
