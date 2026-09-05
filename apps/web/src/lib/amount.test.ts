import { describe, expect, it } from "vitest";
import { formatTokenAmount, parseTokenAmount } from "./amount";

describe("token amount boundaries", () => {
  it("parses six-decimal cUSDC without floating point", () => {
    expect(parseTokenAmount("10.123456")).toBe(10_123_456n);
    expect(parseTokenAmount("0.1")).toBe(100_000n);
  });

  it("rejects malformed, negative, and over-precise input", () => {
    for (const value of ["", "-1", "1.0000001", "1e6", ".", " 1"]) {
      expect(() => parseTokenAmount(value)).toThrow();
    }
  });

  it("formats exact private values without insignificant zeroes", () => {
    expect(formatTokenAmount(10_123_400n)).toBe("10.1234");
    expect(formatTokenAmount(0n)).toBe("0");
  });
});
