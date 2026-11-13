"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { MODE_COOKIE, THEME_COOKIE, readMode, readTheme } from "@/lib/appearance";

const YEAR = 60 * 60 * 24 * 365;

/** Saves the look for this browser. */
export async function setAppearanceAction(form: FormData): Promise<void> {
  const jar = await cookies();
  const theme = form.get("theme");
  const mode = form.get("mode");

  if (typeof theme === "string") {
    jar.set(THEME_COOKIE, readTheme(theme), { path: "/", maxAge: YEAR, sameSite: "lax" });
  }
  if (typeof mode === "string") {
    jar.set(MODE_COOKIE, readMode(mode), { path: "/", maxAge: YEAR, sameSite: "lax" });
  }
  revalidatePath("/", "layout");
}
