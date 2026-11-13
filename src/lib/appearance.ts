/**
 * Appearance is a per-browser choice, kept in cookies rather than the
 * database: it costs no query on every page, and a phone and a desktop can
 * reasonably differ.
 */

export const THEMES = ["cool", "warm"] as const;
export const MODES = ["system", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];
export type Mode = (typeof MODES)[number];

export const THEME_COOKIE = "budget-theme";
export const MODE_COOKIE = "budget-mode";

export function readTheme(value: string | undefined): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "cool";
}

export function readMode(value: string | undefined): Mode {
  return (MODES as readonly string[]).includes(value ?? "") ? (value as Mode) : "system";
}
