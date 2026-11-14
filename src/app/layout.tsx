import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import "./globals.css";
import { MODE_COOKIE, THEME_COOKIE, readMode, readTheme } from "@/lib/appearance";
import { versionLabel } from "@/lib/version";
import { Sidebar } from "@/components/sidebar";
import { currentUser } from "@/server/auth";

export const metadata: Metadata = {
  title: "Budget",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0e8f5b",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = readTheme(jar.get(THEME_COOKIE)?.value);
  const mode = readMode(jar.get(MODE_COOKIE)?.value);
  // The proxy has already decided who may see this page; this only chooses
  // between the app's frame and the bare sign-in frame.
  const user = await currentUser().catch(() => null);

  return (
    <html lang="en" data-theme={theme} data-mode={mode}>
      <body className="min-h-screen antialiased">
        {user ? (
          <div className="lg:flex">
            <Sidebar version={versionLabel()} username={user.username} />
            <main className="min-w-0 flex-1 px-4 pb-16 pt-5 sm:px-8 lg:pt-7">{children}</main>
          </div>
        ) : (
          <main className="px-4 py-8">{children}</main>
        )}
      </body>
    </html>
  );
}
