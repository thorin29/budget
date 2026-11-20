/**
 * Settings: every setting has one home, in one of three groups. Most pages are sections of
 * /settings/[section]; Bills & income, Budgets & categories, Accounts and Home & net worth are their
 * own pages but sit in the same menu.
 */

export const SECTIONS = [
  { slug: "security", label: "Sign-in & people", detail: "Password, phones, second person" },
  { slug: "appearance", label: "Appearance", detail: "Accent, light or dark" },
  { slug: "planning", label: "Planning", detail: "Month split, cushion, 0% payment" },
  { slug: "pay", label: "Pay calendar", detail: "When money arrives" },
  { slug: "bank", label: "Bank connection", detail: "Sync, raw feed, history files" },
  { slug: "data", label: "Import & export", detail: "Spreadsheet in, CSV out" },
  { slug: "about", label: "About", detail: "Version" },
] as const;

export type SectionSlug = (typeof SECTIONS)[number]["slug"];

export interface NavEntry {
  href: string;
  label: string;
  detail: string;
}

export const GROUPS: Array<{ title: string; items: NavEntry[] }> = [
  {
    title: "Plan",
    items: [
      { href: "/line-items", label: "Bills & income", detail: "Every bill and paycheck, loans included" },
      { href: "/settings/budgets", label: "Budgets & categories", detail: "Limits and categories" },
      { href: "/settings/pay", label: "Pay calendar", detail: "When money arrives" },
      { href: "/settings/planning", label: "Planning", detail: "Month split, cushion, 0% payment" },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/settings/accounts", label: "Accounts", detail: "Names, cards, which holds the bills money" },
      { href: "/settings/home", label: "Home & net worth", detail: "Home value" },
      { href: "/settings/bank", label: "Bank connection", detail: "Sync, raw feed, history files" },
    ],
  },
  {
    title: "App",
    items: [
      { href: "/settings/data", label: "Import & export", detail: "Spreadsheet in, CSV out" },
      { href: "/settings/security", label: "Sign-in & people", detail: "Password, phones, second person" },
      { href: "/settings/appearance", label: "Appearance", detail: "Accent, light or dark" },
      { href: "/settings/about", label: "About", detail: "Version" },
    ],
  },
];
