import { SettingsShell } from "../settings/shell";

/** Bills & income is the first page of Settings. */
export default function LineItemsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>;
}
