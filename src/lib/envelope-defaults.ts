/**
 * A starting set of envelopes, made once from the category names already in
 * use. Everything here can be renamed, moved or removed by the person; a
 * category matching nothing lands in "Everything else".
 */

import type { Tier } from "./envelopes";

export interface DefaultGroup {
  name: string;
  tier: Tier;
  saveUp?: boolean;
  /** Category names (lowercased) that start in this group. */
  match: RegExp;
}

export const DEFAULT_GROUPS: DefaultGroup[] = [
  { name: "Home & bills", tier: "ESSENTIAL", match: /housing|mortgage|\brent\b|utilit|phone|internet|insurance|\bloans?\b|subscriptions?|(?<!sports )\bfees?\b|\binterest\b|\btaxes\b/ },
  { name: "Food at home", tier: "ESSENTIAL", match: /grocer|supermarket|warehouse|costco|sam's|target|walmart|^food$/ },
  { name: "Getting around", tier: "ESSENTIAL", match: /fuel|\bgas\b|\bauto\b|\bcar\b|transit|parking|\btolls?\b/ },
  { name: "Health", tier: "ESSENTIAL", match: /medical|health|pharmacy|dental|vision|personal care/ },
  { name: "School & kids", tier: "ESSENTIAL", match: /school|education|tuition|lessons|childcare|kids/ },
  { name: "Pets", tier: "ESSENTIAL", match: /^pets?$|vet/ },
  { name: "Giving", tier: "PLANNED", match: /giving|church|charit|donat|tithe/ },
  { name: "Sports seasons", tier: "PLANNED", saveUp: true, match: /hockey|soccer|baseball|softball|football|basketball|swim|dance|gymnastics|sports? (fees?|league|club|season)/ },
  { name: "Occasions & trips", tier: "PLANNED", saveUp: true, match: /gifts?|occasions?|holiday|christmas|travel|vacation|trips?/ },
  { name: "Saving & investing", tier: "PLANNED", match: /saving|invest|crypto|retirement/ },
  { name: "Eating out", tier: "FLEXIBLE", match: /fast food|restaurants?|dining|eating out|coffee|treats|takeout|bars?$/ },
  { name: "Clothing", tier: "FLEXIBLE", match: /cloth|apparel|shoes|kohl/ },
  { name: "Shopping", tier: "FLEXIBLE", match: /shopping|^home$|household|electronics|furniture/ },
  { name: "Fun", tier: "FLEXIBLE", match: /entertain|hobb|outdoors|fitness|gym|alcohol|aquarium|cash|games?|books?|music|recreation/ },
];

/** The name of the default group a category starts in, or null. Earlier groups win. */
export function defaultGroupFor(category: string): string | null {
  const name = category.trim().toLowerCase();
  return DEFAULT_GROUPS.find((g) => g.match.test(name))?.name ?? null;
}

/** The implicit envelope for categories in no group, and spending with no category. */
export const OTHER_GROUP = { id: "other", name: "Everything else", tier: "FLEXIBLE" as Tier };
