import { describe, expect, it } from "vitest";
import { ruleGate } from "./ruleGate.js";
import type { DetectedChange } from "./types.js";

const baseChange: DetectedChange = {
  id: "1",
  sourceId: "s",
  sourceName: "S",
  sourceWeight: "low",
  targetKey: "k",
  url: "https://example.com",
  title: "一般健康ニュース",
  detectedAt: new Date().toISOString(),
  changeType: "updated",
  bodyExcerpt: "健康に関するお知らせ",
  links: [],
};

describe("ruleGate", () => {
  it("passes high weight without keywords", () => {
    const r = ruleGate(
      { ...baseChange, sourceWeight: "high" },
      [],
      "high",
      false,
    );
    expect(r.pass).toBe(true);
  });

  it("fails low weight without keywords", () => {
    const r = ruleGate(baseChange, ["療養費"], "low", false);
    expect(r.pass).toBe(false);
    expect(r.reasons).toContain("low_weight,no_keyword");
  });

  it("passes when keyword matches", () => {
    const r = ruleGate(
      { ...baseChange, title: "柔道整復療養費の見直し" },
      ["療養費", "柔道整復"],
      "low",
      false,
    );
    expect(r.pass).toBe(true);
  });

  it("fails on fetch failure", () => {
    const r = ruleGate(
      { ...baseChange, changeType: "failed" },
      ["療養費"],
      "high",
      false,
    );
    expect(r.pass).toBe(false);
  });
});
