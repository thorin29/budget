import { SettingsNav } from "./nav";

/** Settings' heading and menu (pinned while the page beside them scrolls) around a page. */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1400px] items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-7 lg:max-h-[calc(100vh-3.5rem)] lg:overflow-y-auto">
        <h1 className="mb-4 text-[30px] font-bold leading-tight tracking-tight">Settings</h1>
        <SettingsNav />
      </div>
      <div className="min-w-0 lg:pt-1">{children}</div>
    </div>
  );
}
