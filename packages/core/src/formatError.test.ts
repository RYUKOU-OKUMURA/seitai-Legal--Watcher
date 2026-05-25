import { describe, expect, it } from "vitest";
import { truncateForReport } from "./formatError.js";

describe("truncateForReport", () => {
  it("truncates long text", () => {
    const long = "a".repeat(400);
    expect(truncateForReport(long, 300).length).toBe(301);
    expect(truncateForReport(long, 300).endsWith("…")).toBe(true);
  });
});
