import { SettingsFooter } from "@/components/insights-tabs";

/** Insights pages, with where their figures are set at the foot. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SettingsFooter />
    </>
  );
}
