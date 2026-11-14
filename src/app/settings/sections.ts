/** Settings sections, shared by the server page and the client nav. */

export const SECTIONS = [
  { slug: "security", label: "Sign-in & people", detail: "Password, sessions, second person" },
  { slug: "appearance", label: "Appearance", detail: "Theme and light or dark" },
  { slug: "planning", label: "Planning", detail: "Bills account, split day, look-ahead" },
  { slug: "accounts", label: "Accounts", detail: "Where money leaves from" },
  { slug: "categories", label: "Categories", detail: "Groupings for reports" },
  { slug: "pay", label: "Pay calendar", detail: "When money arrives" },
  { slug: "data", label: "Import & export", detail: "Workbooks and CSV" },
  { slug: "about", label: "About", detail: "Version and links" },
] as const;

export type SectionSlug = (typeof SECTIONS)[number]["slug"];
