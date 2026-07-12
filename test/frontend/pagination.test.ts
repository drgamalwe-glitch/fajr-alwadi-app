import { describe, expect, it } from "vitest";
import { PAGE_SIZE } from "../../src/constants";
import { changePageByDelta } from "../../src/utils/pagination";

describe("car pagination", () => {
  it("keeps the thirteenth car on the first page", () => {
    expect(PAGE_SIZE).toBe(13);
  });
  it("clamps navigation to valid pages", () => {
    expect(changePageByDelta(0, 2, -1)).toBe(0);
    expect(changePageByDelta(0, 2, 1)).toBe(1);
    expect(changePageByDelta(1, 2, 1)).toBe(1);
  });
});
