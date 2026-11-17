/**
 * Colors a card can be drawn in. Plain presets the person picks to match the
 * card in their wallet; no issuer designs or marks are reproduced.
 */

export interface CardColor {
  id: string;
  label: string;
  /** CSS background. */
  background: string;
  /** Text on the card. */
  ink: "light" | "dark";
}

/** The two ends of a preset's gradient, for clients that draw their own (the phone app). */
export function colorStops(color: CardColor): [string, string] {
  const hex = color.background.match(/#[0-9a-f]{6}/gi) ?? ["#2b2f36", "#4a505a"];
  return [hex[0], hex[hex.length - 1]];
}

export const CARD_COLORS: CardColor[] = [
  { id: "graphite", label: "Graphite", background: "linear-gradient(135deg, #2b2f36 0%, #4a505a 100%)", ink: "light" },
  { id: "midnight", label: "Midnight", background: "linear-gradient(135deg, #0a1428 0%, #1d2c4c 60%, #2a3b60 100%)", ink: "light" },
  { id: "navy", label: "Navy", background: "linear-gradient(135deg, #0d2a4f 0%, #1f4f86 100%)", ink: "light" },
  { id: "sky", label: "Sky blue", background: "linear-gradient(135deg, #1e4fa8 0%, #3b7be0 100%)", ink: "light" },
  { id: "burgundy", label: "Burgundy", background: "linear-gradient(135deg, #5c0a24 0%, #8e1238 55%, #a3153f 100%)", ink: "light" },
  { id: "crimson", label: "Crimson", background: "linear-gradient(135deg, #8f1a1a 0%, #c62f2f 100%)", ink: "light" },
  { id: "plum", label: "Plum", background: "linear-gradient(135deg, #3d1a4f 0%, #6b3285 100%)", ink: "light" },
  { id: "forest", label: "Forest", background: "linear-gradient(135deg, #12392a 0%, #1f6b4a 100%)", ink: "light" },
  { id: "ocean", label: "Ocean", background: "linear-gradient(135deg, #0f4c5c 0%, #17778a 100%)", ink: "light" },
  { id: "platinum", label: "Platinum", background: "linear-gradient(135deg, #8e959d 0%, #c4c9cf 55%, #e1e4e8 100%)", ink: "dark" },
  { id: "gold", label: "Gold", background: "linear-gradient(135deg, #8a6a1f 0%, #c9a24a 60%, #e2c47a 100%)", ink: "dark" },
  { id: "black", label: "Black", background: "linear-gradient(135deg, #0b0b0d 0%, #26272b 100%)", ink: "light" },
];

export function cardColor(id: string | null | undefined): CardColor {
  return CARD_COLORS.find((c) => c.id === id) ?? CARD_COLORS[0];
}
