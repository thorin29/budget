import { SettingsNav } from "./nav";

/** Settings' heading and menu around a page; Bills & income uses it too, from its own address. */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1400px]">
      <h1 className="text-[30px] font-bold leading-tight tracking-tight">Settings</h1>
      <div className="mt-5 grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
