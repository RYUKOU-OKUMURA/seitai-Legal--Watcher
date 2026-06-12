import { describe, expect, it, vi } from "vitest";
import type { WatchTargetConfig } from "@seitai-legal-watch/core";
import { fetchRssSnapshots } from "./rssFetcher.js";
import { fetchWithRetry } from "./http.js";

vi.mock("./http.js", () => ({
  fetchWithRetry: vi.fn(),
}));

const source: WatchTargetConfig = {
  id: "egov-pubcomment-list-health",
  name: "e-Govパブコメ 意見募集（厚生）",
  type: "rss",
  url: "https://public-comment.e-gov.go.jp/rss/pcm_list_0000000048.xml",
  weight: "medium",
  alwaysAnalyze: false,
  enabled: true,
};

function mockResponse(body: string): Response {
  return { status: 200, text: async () => body } as unknown as Response;
}

const RDF_FEED = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rdf:RDF xmlns="http://purl.org/rss/1.0/"
  xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <channel rdf:about="https://public-comment.e-gov.go.jp/rss/pcm_list_0000000048.xml">
    <title>パブリックコメント・意見募集案件一覧/厚生</title>
    <link>https://public-comment.e-gov.go.jp/servlet/Public?CLASSNAME=PCMMSTLIST&amp;Mode=0</link>
    <items><rdf:Seq><rdf:li rdf:resource="https://public-comment.e-gov.go.jp/servlet/Public?CLASSNAME=PCMMSTDETAIL&amp;id=1&amp;Mode=0"/></rdf:Seq></items>
  </channel>
  <item rdf:about="https://public-comment.e-gov.go.jp/servlet/Public?CLASSNAME=PCMMSTDETAIL&amp;id=1&amp;Mode=0">
    <title>柔道整復療養費の改定案に関する意見募集について</title>
    <link>https://public-comment.e-gov.go.jp/servlet/Public?CLASSNAME=PCMMSTDETAIL&amp;id=1&amp;Mode=0</link>
    <description>案の公示日：2026/06/10&lt;br/&gt;受付締切日時：2026/07/10 00:00&lt;br/&gt;カテゴリー：厚生&lt;br/&gt;</description>
    <dc:date>2026-06-09T15:00:Z</dc:date>
  </item>
  <item rdf:about="https://public-comment.e-gov.go.jp/servlet/Public?CLASSNAME=PCMMSTDETAIL&amp;id=2&amp;Mode=0">
    <title>薬局製剤指針の一部改正（案）について</title>
    <link>https://public-comment.e-gov.go.jp/servlet/Public?CLASSNAME=PCMMSTDETAIL&amp;id=2&amp;Mode=0</link>
    <description>案の公示日：2026/06/04&lt;br/&gt;</description>
    <dc:date>2026-06-03T15:00:Z</dc:date>
  </item>
</rdf:RDF>`;

const RSS2_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>新着情報</title>
    <item>
      <title>記事A</title>
      <link>https://example.com/a.html</link>
      <pubDate>Tue, 09 Jun 2026 15:00:00 +0900</pubDate>
      <description>本文A</description>
    </item>
  </channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>新着情報</title>
  <entry>
    <title>記事B</title>
    <link href="https://example.com/b.html"/>
    <updated>2026-06-09T15:00:00Z</updated>
    <summary>本文B</summary>
  </entry>
</feed>`;

describe("fetchRssSnapshots", () => {
  it("parses RSS 1.0 (RDF) feeds such as e-Gov public comments", async () => {
    vi.mocked(fetchWithRetry).mockResolvedValueOnce(mockResponse(RDF_FEED));

    const snapshots = await fetchRssSnapshots(source, "2026-06-12T00:00:00.000Z");

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({
      sourceId: source.id,
      title: "柔道整復療養費の改定案に関する意見募集について",
      publishedAt: "2026-06-09T15:00:Z",
    });
    expect(snapshots[0]!.url).toContain("PCMMSTDETAIL");
    expect(snapshots[0]!.targetKey.startsWith("rss:")).toBe(true);
    expect(snapshots[0]!.bodyText).toContain("案の公示日：2026/06/10");
    expect(snapshots[0]!.bodyText).not.toContain("<br");
    expect(snapshots[0]!.contentHash).not.toBe(snapshots[1]!.contentHash);
  });

  it("still parses RSS 2.0 feeds", async () => {
    vi.mocked(fetchWithRetry).mockResolvedValueOnce(mockResponse(RSS2_FEED));

    const snapshots = await fetchRssSnapshots(source, "2026-06-12T00:00:00.000Z");

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      title: "記事A",
      url: "https://example.com/a.html",
      bodyText: "本文A",
    });
  });

  it("still parses Atom feeds", async () => {
    vi.mocked(fetchWithRetry).mockResolvedValueOnce(mockResponse(ATOM_FEED));

    const snapshots = await fetchRssSnapshots(source, "2026-06-12T00:00:00.000Z");

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      title: "記事B",
      url: "https://example.com/b.html",
    });
  });
});
