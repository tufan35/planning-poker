import { describe, expect, it } from "vitest";
import { computeConsensus, HIDDEN } from "./consensus";

describe("computeConsensus", () => {
  it("returns null for empty input", () => {
    expect(computeConsensus([])).toBeNull();
    expect(computeConsensus([null, undefined, ""])).toBeNull();
  });

  it("returns the only vote", () => {
    expect(computeConsensus(["5"])).toBe("5");
  });

  it("returns mode", () => {
    expect(computeConsensus(["3", "3", "5", "5", "5"])).toBe("5");
  });

  it("ignores hidden sentinels", () => {
    expect(computeConsensus(["8", HIDDEN, "8"])).toBe("8");
  });

  it("tie-breaks by earlier deck order (smaller index)", () => {
    // "3" comes before "5" in CARD_VALUES
    expect(computeConsensus(["3", "5"])).toBe("3");
    expect(computeConsensus(["5", "3"])).toBe("3");
    expect(computeConsensus(["5", "5", "8", "8"])).toBe("5");
  });
});
