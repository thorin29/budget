/**
 * Settings: every setting has one home, in one of three groups. Most pages are sections of
 * /settings/[section]; Bills & Income, Budgets, Accounts and Property Management are their own pages
 * in the same menu. Planning lives inside Pay Settings.
 */

export const SECTIONS = [
  { slug: "security", label: "User Accounts" },
  { slug: "appearance", label: "Appearance" },
  { slug: "pay", label: "Pay Settings" },
  { slug: "bank", label: "Bridge Connectivity" },
  { slug: "data", label: "Data Imports & Exports" },
  { slug: "about", label: "About" },
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
      { href: "/line-items", label: "Bills & Income", detail: "Create/edit bill and income details" },
      { href: "/settings/budgets", label: "Budgets", detail: "Set limits and categories" },
      { href: "/settings/pay", label: "Pay Settings", detail: "Employer, pay schedules" },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/settings/accounts", label: "Accounts", detail: "Banking, credit cards, & investments" },
      { href: "/settings/home", label: "Property Management", detail: "Home value" },
      { href: "/settings/bank", label: "Bridge Connectivity", detail: "Sync, raw feed, history files" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/settings/data", label: "Data Imports & Exports", detail: "JSON & CSV files" },
      { href: "/settings/security", label: "User Accounts", detail: "Passwords, devices, sessions" },
      { href: "/settings/appearance", label: "Appearance", detail: "Color themes, light/dark mode" },
      { href: "/settings/about", label: "About", detail: "" },
    ],
  },
];
