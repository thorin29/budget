/**
 * A starting set of envelopes, made once from the category names already in
 * use. Everything here can be renamed, moved or removed by the person; a
 * category matching nothing lands in "Everything else".
 */

import type { GroupTier, Tier } from "./envelopes";

export interface DefaultGroup {
  name: string;
  tier: GroupTier;
  saveUp?: boolean;
  /** Category names (lowercased) that start in this group. */
  match: RegExp;
}

export const DEFAULT_GROUPS: DefaultGroup[] = [
  // Spending these categories is the plan's bills; step 1 counts them.
  { name: "Paid as bills", tier: "BILLS", match: /housing|mortgage|\brent\b|utilit|phone|internet|insurance|\bloans?\b|\btaxes\b/ },
  { name: "Fees & interest", tier: "ESSENTIAL", match: /(?<!sports )\bfees?\b|\binterest\b|penalt|late charge/ },
  { name: "Groceries & household", tier: "ESSENTIAL", match: /grocer|supermarket|warehouse|costco|sam's|target|walmart|^food$|household|toiletr/ },
  { name: "Vehicles", tier: "ESSENTIAL", match: /fuel|\bgas\b|\bauto\b|\bcar\b|vehicle|transit|parking|\btolls?\b/ },
  { name: "Health", tier: "ESSENTIAL", match: /medical|health|pharmacy|dental|vision|personal care/ },
  { name: "School & lessons", tier: "ESSENTIAL", match: /school|education|tuition|lessons|childcare/ },
  { name: "Home upkeep", tier: "ESSENTIAL", match: /home repair|home upkeep|maintenance|pest|lawn|yard/ },
  { name: "Pets", tier: "ESSENTIAL", match: /^pets?$|vet/ },
  { name: "Giving", tier: "PLANNED", match: /giving|church|charit|donat|tithe/ },
  { name: "Sports", tier: "PLANNED", match: /hockey|soccer|baseball|softball|football|basketball|swim|dance|gymnastics|sports? (fees?|league|club|season)/ },
  { name: "Saving & investing", tier: "PLANNED", match: /saving|invest|crypto|retirement/ },
  { name: "Eating out", tier: "FLEXIBLE", match: /fast food|restaurants?|dining|eating out|coffee|treats|takeout|bars?$/ },
  { name: "Clothing", tier: "FLEXIBLE", match: /cloth|apparel|shoes|kohl/ },
  { name: "Shopping", tier: "FLEXIBLE", match: /shopping|^home$|electronics|furniture|decor/ },
  { name: "Subscriptions", tier: "FLEXIBLE", match: /subscriptions?|streaming|memberships?/ },
  { name: "Fitness", tier: "FLEXIBLE", match: /fitness|gym/ },
  { name: "Gifts & trips", tier: "FLEXIBLE", match: /gifts?|occasions?|holiday|christmas|travel|vacation|trips?/ },
  { name: "Fun", tier: "FLEXIBLE", match: /entertain|hobb|outdoors|alcohol|aquarium|cash|games?|toys?|books?|music|recreation/ },
];

/** The name of the default group a category starts in, or null. Earlier groups win. */
export function defaultGroupFor(category: string): string | null {
  const name = category.trim().toLowerCase();
  return DEFAULT_GROUPS.find((g) => g.match.test(name))?.name ?? null;
}

/** The implicit envelope for categories in no group, and spending with no category. */
export const OTHER_GROUP = { id: "other", name: "Everything else", tier: "FLEXIBLE" as Tier };
