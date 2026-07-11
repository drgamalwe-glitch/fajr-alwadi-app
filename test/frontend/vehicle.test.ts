import { describe, expect, it } from "vitest";
import { normalizeVehicleIdentifier } from "../../src/utils/vehicle";

describe("normalizeVehicleIdentifier", () => {
  it("normalizes case and all whitespace for VIN comparisons", () => {
    expect(normalizeVehicleIdentifier(" ab 12\tcd\n34 ")).toBe("AB12CD34");
  });
  it("preserves non-whitespace characters while uppercasing", () => {
    expect(normalizeVehicleIdentifier("vin-123")).toBe("VIN-123");
  });
  it("returns an empty identifier for nullish input", () => {
    expect(normalizeVehicleIdentifier(null)).toBe("");
  });
});
