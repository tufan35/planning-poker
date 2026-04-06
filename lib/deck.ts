/** Planning poker card values (wire format). Display labels mapped in UI. */
export const CARD_VALUES = [
  "0",
  "half",
  "1",
  "2",
  "3",
  "5",
  "8",
  "13",
  "20",
  "40",
  "100",
  "question",
  "coffee",
] as const;

export type CardValue = (typeof CARD_VALUES)[number];

export const CARD_LABEL: Record<CardValue, string> = {
  "0": "0",
  half: "½",
  "1": "1",
  "2": "2",
  "3": "3",
  "5": "5",
  "8": "8",
  "13": "13",
  "20": "20",
  "40": "40",
  "100": "100",
  question: "?",
  coffee: "☕",
};

/** Lower index = earlier in deck; used for tie-break (pick earlier / smaller in planning sense). */
export function cardSortIndex(value: string): number {
  const i = CARD_VALUES.indexOf(value as CardValue);
  return i === -1 ? 999 : i;
}

export function isCardValue(v: string): v is CardValue {
  return (CARD_VALUES as readonly string[]).includes(v);
}
