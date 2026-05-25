import { describe, expect, it } from "vitest";

/** decodeHtmlBody logic tested via inline replicate */
function parseCharsetFromMeta(htmlHead: string): string | undefined {
  const httpEquiv = htmlHead.match(/charset\s*=\s*["']?([\w-]+)/i);
  if (httpEquiv?.[1]) return httpEquiv[1].toLowerCase();
  const metaCharset = htmlHead.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i);
  if (metaCharset?.[1]) return metaCharset[1].toLowerCase();
  return undefined;
}

describe("parseCharsetFromMeta", () => {
  it("reads euc-jp from meta", () => {
    const head = `<meta http-equiv="Content-Type" content="text/html; charset=euc-jp">`;
    expect(parseCharsetFromMeta(head)).toBe("euc-jp");
  });
});
