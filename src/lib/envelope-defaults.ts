/**
 * A starting set of budgets, made from the category names already in use.
 * Everything here can be renamed, moved or removed by the person; a category
 * matching nothing lands in "Needs a budget". Earlier groups win, so the more
 * specific patterns come first.
 */

import type { GroupTier } from "./month-plan";

export interface DefaultGroup {
  name: string;
  tier: GroupTier;
  /** Category names (lowercased) that start in this group. */
  match: RegExp;
}

const SPORTS = "hockey|soccer|baseball|softball|football|basketball|lacrosse|volleyball|swim|dance|gymnastics|sports?";

export const DEFAULT_GROUPS: DefaultGroup[] = [
  // Spending in these categories is paid through the bills.
  { name: "Paid as bills", tier: "BILLS", match: /housing|mortgage|\brent\b|utilit|phone|internet|insurance|\bloans?\b|\btaxes\b|\bdebt\b|^payments?$|^giving$|^church$|tithe|donat|charit|saving|invest|crypto|retirement/ },
  // Needed every month.
  { name: "Groceries & household", tier: "ESSENTIAL", match: /grocer|supermarket|warehouse|costco|sam's|target|walmart|^food$|household|toiletr|personal care/ },
  { name: "Fuel", tier: "ESSENTIAL", match: /^fuel$|^gas$|gasoline|\bfuel\b|transit|parking|\btolls?\b/ },
  // Extras.
  { name: "Sports gear", tier: "FLEXIBLE", match: new RegExp(`(${SPORTS}).*(gear|equipment|store)|(gear|equipment)`) },
  { name: "Eating out", tier: "FLEXIBLE", match: /fast food|restaurants?|dining|eating out|coffee|treats|takeout|bars?$/ },
  { name: "Clothing", tier: "FLEXIBLE", match: /cloth|apparel|shoes|kohl/ },
  { name: "Shopping", tier: "FLEXIBLE", match: /shopping|^home$|electronics|furniture|decor/ },
  { name: "Subscriptions", tier: "FLEXIBLE", match: /subscriptions?|streaming|memberships?/ },
  { name: "Fitness", tier: "FLEXIBLE", match: /fitness|gym/ },
  { name: "Gifts & trips", tier: "FLEXIBLE", match: /gifts?|occasions?|holiday|christmas|travel|vacation|trips?/ },
  // Irregular: no guardrail, never averaged.
  { name: "Car repairs", tier: "UNPLANNED", match: /\bauto\b|\bcar\b|vehicle|repairs?$|tires?|registration/ },
  { name: "Medical", tier: "UNPLANNED", match: /medical|health|pharmacy|dental|vision|doctor/ },
  { name: "School & lessons", tier: "UNPLANNED", match: /school|education|tuition|lessons|childcare|camp/ },
  { name: "Sports fees", tier: "UNPLANNED", match: new RegExp(`^(${SPORTS})$|(${SPORTS}) (fees?|league|club|season|registration)|^league fees?$`) },
  { name: "Pets", tier: "UNPLANNED", match: /^pets?$|\bvet\b|veterinar/ },
  { name: "Home upkeep", tier: "UNPLANNED", match: /home repair|home upkeep|maintenance|pest|lawn|yard/ },
  { name: "Fees & interest", tier: "UNPLANNED", match: /\bfees?\b|\binterest\b|penalt|late charge/ },
  // Extras that match broadly, last.
  { name: "Fun", tier: "FLEXIBLE", match: /entertain|hobb|outdoors|alcohol|aquarium|cash|games?|toys?|books?|music|recreation|activit/ },
];

/** The name of the default group a category starts in, or null. Earlier groups win. */
export function defaultGroupFor(category: string): string | null {
  const name = category.trim().toLowerCase();
  return DEFAULT_GROUPS.find((g) => g.match.test(name))?.name ?? null;
}

/** Categories in no budget yet. Their spending counts as an extra with no guardrail until they're placed. */
export const OTHER_GROUP = { id: "other", name: "Needs a budget", tier: "FLEXIBLE" as const };
