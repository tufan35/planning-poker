/** PartyKit dev server default port is 1999. Use 127.0.0.1 for consistent WS on Windows. */
export function getPartyKitHost(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_PARTYKIT_HOST) {
    return process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  }
  return "127.0.0.1:1999";
}
