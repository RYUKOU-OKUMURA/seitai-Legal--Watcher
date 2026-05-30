import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { afterEach, describe, expect, it } from "vitest";
import {
  enrichDailyMarkdownForObsidian,
  enrichWeeklyMarkdownForObsidian,
  syncDailyReportToObsidian,
  syncWeeklyReportToObsidian,
} from "./obsidianSync.js";

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeDailyReport(
  root: string,
  date: string,
  content: string,
): Promise<string> {
  const reportPath = path.join(root, "reports", "daily", `${date}.md`);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, content, "utf8");
  return reportPath;
}

async function writeWeeklyReport(
  root: string,
  week: string,
  content: string,
): Promise<string> {
  const reportPath = path.join(root, "reports", "weekly", `${week}_legal_watch.md`);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, content, "utf8");
  return reportPath;
}

function analyzedReport(blocks: string[]): string {
  return [
    "---",
    "type: legal-watch-daily",
    "date: 2026-05-26",
    "content_update_count: 1",
    "analyzed_count: 1",
    "gated_out_count: 0",
    "fetch_failure_count: 0",
    "---",
    "",
    "# Daily",
    "",
    "## 分析済み更新",
    "",
    ...blocks,
    "",
  ].join("\n");
}

function analyzedBlock(importance: "high" | "medium" | "low", title: string): string {
  return [
    `### [${importance}] ${title}`,
    "",
    "- 情報源: 厚生労働省報道発表（月別一覧）",
    "- 原典: https://example.com/source",
    "- カテゴリ: 広告規制",
    "- 対象業態: 整体院、整骨院",
    "- 関連度: high",
    "",
    "**要約**",
    "要約です。",
    "",
    "**実務影響（要確認）**",
    "実務影響です。",
    "",
    "**広告・LP・SNS（要確認）**",
    "広告影響です。",
    "",
    "**確認ポイント**",
    "- 原典を確認する",
    "- LP表現を確認する",
    "",
    "> 要専門家確認",
    "",
    "**不明点**",
    "- 適用日",
  ].join("\n");
}

describe("syncDailyReportToObsidian", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    delete process.env.LEGAL_WATCH_OBSIDIAN_VAULT_PATH;
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("copies a daily report into the Obsidian daily directory", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    const markdown =
      "---\ntype: legal-watch-daily\ndate: 2026-05-26\ncontent_update_count: 1\n---\n\n# Daily\n";
    const sourcePath = await writeDailyReport(root, "2026-05-26", markdown);

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });

    const destinationPath = path.join(
      vault,
      "Legal Watch",
      "daily",
      "2026-05-26.md",
    );
    const indexPath = path.join(vault, "Legal Watch", "index.md");
    expect(result).toEqual({
      date: "2026-05-26",
      sourcePath,
      destinationPath,
      indexPath,
      topicPaths: [],
      skippedTopicPaths: [],
      skipped: false,
    });
    const destination = matter(await readFile(destinationPath, "utf8"));
    expect(destination.data).toMatchObject({
      type: "legal-watch-daily",
      date: "2026-05-26",
      content_update_count: 1,
    });
    expect(destination.data.tags).toEqual(["legal-watch", "法令監視"]);
    await expect(readFile(sourcePath, "utf8")).resolves.toBe(markdown);
    await expect(readFile(indexPath, "utf8")).resolves.toContain(
      "[[daily/2026-05-26|2026-05-26]]",
    );
  });

  it("creates missing Obsidian destination directories", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = path.join(await makeTempDir("legal-watch-vault-parent-"), "Vault");
    tempDirs.push(root, path.dirname(vault));
    await writeDailyReport(root, "2026-05-26", "# Daily\n");

    await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });

    await expect(
      readFile(
        path.join(vault, "Legal Watch", "daily", "2026-05-26.md"),
        "utf8",
      ),
    ).resolves.toContain("# Daily");
  });

  it("skips an existing Obsidian file by default", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    await writeDailyReport(root, "2026-05-26", "# Source report\n");
    const destinationPath = path.join(
      vault,
      "Legal Watch",
      "daily",
      "2026-05-26.md",
    );
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, "# Manual Obsidian notes\n", "utf8");

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });

    expect(result.skipped).toBe(true);
    await expect(readFile(destinationPath, "utf8")).resolves.toBe(
      "# Manual Obsidian notes\n",
    );
    await expect(
      readFile(path.join(vault, "Legal Watch", "index.md"), "utf8"),
    ).resolves.toContain("[[daily/2026-05-26|2026-05-26]]");
  });

  it("overwrites an existing Obsidian file when force is true", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    await writeDailyReport(root, "2026-05-26", "# Source report\n");
    const destinationPath = path.join(
      vault,
      "Legal Watch",
      "daily",
      "2026-05-26.md",
    );
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, "# Manual Obsidian notes\n", "utf8");

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
      force: true,
    });

    expect(result.skipped).toBe(false);
    const destination = await readFile(destinationPath, "utf8");
    expect(destination).toContain("# Source report");
    expect(matter(destination).data.tags).toEqual(["legal-watch", "法令監視"]);
  });

  it("uses LEGAL_WATCH_OBSIDIAN_VAULT_PATH when vaultPath is omitted", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    process.env.LEGAL_WATCH_OBSIDIAN_VAULT_PATH = vault;
    await writeDailyReport(root, "2026-05-26", "# Daily\n");

    await syncDailyReportToObsidian({ root, date: "2026-05-26" });

    await expect(
      readFile(
        path.join(vault, "Legal Watch", "daily", "2026-05-26.md"),
        "utf8",
      ),
    ).resolves.toContain("# Daily");
  });

  it("throws a useful error when the Obsidian Vault path is not configured", async () => {
    const root = await makeTempDir("legal-watch-root-");
    tempDirs.push(root);

    await expect(
      syncDailyReportToObsidian({ root, date: "2026-05-26" }),
    ).rejects.toThrow("LEGAL_WATCH_OBSIDIAN_VAULT_PATH is not set");
  });

  it("throws a useful error when the daily report is missing", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);

    await expect(
      syncDailyReportToObsidian({
        root,
        vaultPath: vault,
        date: "2026-05-26",
      }),
    ).rejects.toThrow("Daily report not found");
  });

  it("rejects malformed dates before using them as file paths", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);

    await expect(
      syncDailyReportToObsidian({
        root,
        vaultPath: vault,
        date: "../outside",
        force: true,
      }),
    ).rejects.toThrow('Invalid date "../outside". Expected YYYY-MM-DD.');
  });

  it("adds Obsidian-only tags from report body while preserving source bytes", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    const markdown = [
      "---",
      "type: legal-watch-daily",
      "date: 2026-05-26",
      "tags:",
      "  - existing",
      "  - legal-watch",
      "---",
      "",
      "# Daily",
      "",
      "- 情報源: 厚生労働省報道発表（月別一覧）",
      "- カテゴリ: 広告規制",
      "- 対象業態: 整体院、整骨院",
      "",
      "> 要専門家確認",
      "",
    ].join("\n");
    const sourcePath = await writeDailyReport(root, "2026-05-26", markdown);

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });

    const destination = matter(await readFile(result.destinationPath, "utf8"));
    expect(destination.data.tags).toEqual([
      "existing",
      "legal-watch",
      "法令監視",
      "厚労省",
      "広告規制",
      "整体院",
      "整骨院",
      "要専門家確認",
    ]);
    expect(destination.data).not.toHaveProperty("status");
    expect(destination.data).not.toHaveProperty("confirmation_status");
    await expect(readFile(sourcePath, "utf8")).resolves.toBe(markdown);
  });

  it("preserves and de-duplicates existing tags during enrichment", () => {
    const enriched = matter(
      enrichDailyMarkdownForObsidian(
        [
          "---",
          "type: legal-watch-daily",
          "tags:",
          "  - '#legal-watch'",
          "  - 法令監視",
          "  - custom",
          "---",
          "",
          "# Daily",
          "- 情報源: 消費者庁ウェブサイト",
          "- カテゴリ: 景品表示法",
          "",
        ].join("\n"),
      ),
    );

    expect(enriched.data.tags).toEqual([
      "legal-watch",
      "法令監視",
      "custom",
      "消費者庁",
      "景品表示法",
    ]);
  });

  it("derives source tags from bootstrap baseline item lines", () => {
    const enriched = matter(
      enrichDailyMarkdownForObsidian(
        [
          "---",
          "type: legal-watch-daily",
          "bootstrap: true",
          "---",
          "",
          "# Daily",
          "",
          "- [new] 厚生労働省報道発表（月別一覧）: 報道発表資料",
          "  - 原典: https://www.mhlw.go.jp/",
          "- [new] e-Gov法令API（更新法令一覧）: 更新法令",
          "  - 原典: https://laws.e-gov.go.jp/",
          "- [new] 東京都 施術所手続き: 手続き",
          "  - 原典: https://www.hokeniryo.metro.tokyo.lg.jp/",
          "- [new] 官報発行サイト: 官報",
          "  - 原典: https://www.kanpo.go.jp/",
          "",
        ].join("\n"),
      ),
    );

    expect(enriched.data.tags).toEqual([
      "legal-watch",
      "法令監視",
      "厚労省",
      "e-Gov",
      "自治体通知",
      "官報",
    ]);
  });

  it("generates index.md from synced daily files sorted newest first", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    const dailyDir = path.join(vault, "Legal Watch", "daily");
    await mkdir(dailyDir, { recursive: true });
    await writeFile(
      path.join(dailyDir, "2026-05-25.md"),
      "---\ndate: 2026-05-25\ncontent_update_count: 2\n---\n# Older\n",
      "utf8",
    );
    await writeFile(
      path.join(dailyDir, "2026-05-27.md"),
      "---\ndate: 2026-05-27\ncontent_update_count: 4\nanalyzed_count: 3\ngated_out_count: 1\nfetch_failure_count: 0\n---\n# Newer\n",
      "utf8",
    );
    await writeDailyReport(
      root,
      "2026-05-26",
      "---\ndate: 2026-05-26\ncontent_update_count: 1\n---\n# Current\n",
    );

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });
    const index = await readFile(result.indexPath, "utf8");

    expect(index).toContain("自動生成されます");
    expect(index.indexOf("[[daily/2026-05-27|2026-05-27]]")).toBeLessThan(
      index.indexOf("[[daily/2026-05-26|2026-05-26]]"),
    );
    expect(index.indexOf("[[daily/2026-05-26|2026-05-26]]")).toBeLessThan(
      index.indexOf("[[daily/2026-05-25|2026-05-25]]"),
    );
    expect(index).toContain(
      "| [[daily/2026-05-27|2026-05-27]] | 4 | 3 | 1 | 0 |",
    );
    expect(index).toContain(
      "| [[daily/2026-05-25|2026-05-25]] | 2 | - | - | - |",
    );
  });

  it("generates index entries for daily files with missing frontmatter", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    const dailyDir = path.join(vault, "Legal Watch", "daily");
    await mkdir(dailyDir, { recursive: true });
    await writeFile(path.join(dailyDir, "2026-05-25.md"), "# No metadata\n", "utf8");
    await writeDailyReport(
      root,
      "2026-05-26",
      "---\ndate: 2026-05-26\n---\n# Current\n",
    );

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });

    await expect(readFile(result.indexPath, "utf8")).resolves.toContain(
      "| [[daily/2026-05-25|2026-05-25]] | - | - | - | - |",
    );
  });

  it("creates one topic note for each high-importance block", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    const markdown = analyzedReport([analyzedBlock("high", "厚労省資料更新")]);
    const sourcePath = await writeDailyReport(root, "2026-05-26", markdown);

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });

    const topicPath = path.join(
      vault,
      "Legal Watch",
      "topics",
      "広告規制",
      "2026-05-26_厚労省資料更新.md",
    );
    expect(result.topicPaths).toEqual([topicPath]);
    expect(result.skippedTopicPaths).toEqual([]);
    const topic = matter(await readFile(topicPath, "utf8"));
    expect(topic.data).toMatchObject({
      type: "legal-watch-topic",
      date: "2026-05-26",
      importance: "high",
      category: "広告規制",
      source_report: "daily/2026-05-26",
      source_url: "https://example.com/source",
    });
    expect(topic.data.tags).toEqual([
      "legal-watch",
      "法令監視",
      "広告規制",
      "厚労省",
      "整体院",
      "整骨院",
      "要専門家確認",
    ]);
    expect(topic.data).not.toHaveProperty("status");
    expect(topic.data).not.toHaveProperty("confirmation_status");
    expect(topic.content).toContain("# 厚労省資料更新");
    expect(topic.content).toContain("- 日次レポート: [[daily/2026-05-26|2026-05-26]]");
    expect(topic.content).toContain("## 日次レポート抜粋");
    expect(topic.content).toContain("### [high] 厚労省資料更新");
    await expect(readFile(sourcePath, "utf8")).resolves.toBe(markdown);
  });

  it("does not create topic notes for medium or low blocks", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    await writeDailyReport(
      root,
      "2026-05-26",
      analyzedReport([
        analyzedBlock("medium", "中重要度"),
        analyzedBlock("low", "低重要度"),
      ]),
    );

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });

    expect(result.topicPaths).toEqual([]);
    expect(result.skippedTopicPaths).toEqual([]);
    await expect(readFile(result.indexPath, "utf8")).resolves.toContain(
      "生成済みの重要度高トピックはありません。",
    );
  });

  it("skips an existing topic note by default", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    await writeDailyReport(root, "2026-05-26", analyzedReport([analyzedBlock("high", "厚労省資料更新")]));
    const topicPath = path.join(
      vault,
      "Legal Watch",
      "topics",
      "広告規制",
      "2026-05-26_厚労省資料更新.md",
    );
    await mkdir(path.dirname(topicPath), { recursive: true });
    await writeFile(topicPath, "# Manual topic note\n", "utf8");

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });

    expect(result.topicPaths).toEqual([]);
    expect(result.skippedTopicPaths).toEqual([topicPath]);
    await expect(readFile(topicPath, "utf8")).resolves.toBe("# Manual topic note\n");
  });

  it("overwrites an existing topic note when force is true", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    await writeDailyReport(root, "2026-05-26", analyzedReport([analyzedBlock("high", "厚労省資料更新")]));
    const topicPath = path.join(
      vault,
      "Legal Watch",
      "topics",
      "広告規制",
      "2026-05-26_厚労省資料更新.md",
    );
    await mkdir(path.dirname(topicPath), { recursive: true });
    await writeFile(topicPath, "# Manual topic note\n", "utf8");

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
      force: true,
    });

    expect(result.topicPaths).toEqual([topicPath]);
    expect(result.skippedTopicPaths).toEqual([]);
    await expect(readFile(topicPath, "utf8")).resolves.toContain("# 厚労省資料更新");
  });

  it("creates unique topic filenames for duplicate high titles", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    await writeDailyReport(
      root,
      "2026-05-26",
      analyzedReport([
        analyzedBlock("high", "同じタイトル"),
        analyzedBlock("high", "同じタイトル"),
      ]),
    );

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });

    expect(result.topicPaths.map((topicPath) => path.basename(topicPath))).toEqual([
      "2026-05-26_同じタイトル.md",
      "2026-05-26_同じタイトル-2.md",
    ]);
  });

  it("sanitizes unsafe category and title path characters", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    const markdown = analyzedReport([
      analyzedBlock("high", "危険/タイトル:*?[]#").replace(
        "- カテゴリ: 広告規制",
        "- カテゴリ: 広告/規制:*?[]#",
      ),
    ]);
    await writeDailyReport(root, "2026-05-26", markdown);

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });

    expect(result.topicPaths[0]).toBe(
      path.join(
        vault,
        "Legal Watch",
        "topics",
        "広告 規制",
        "2026-05-26_危険 タイトル.md",
      ),
    );
  });

  it("adds topic links to the generated index sorted newest first", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    const olderTopic = path.join(
      vault,
      "Legal Watch",
      "topics",
      "広告規制",
      "2026-05-25_古い高重要度.md",
    );
    await mkdir(path.dirname(olderTopic), { recursive: true });
    await writeFile(
      olderTopic,
      "---\ntype: legal-watch-topic\ndate: 2026-05-25\nimportance: high\ncategory: 広告規制\nsource_url: https://example.com/old\n---\n# 古い高重要度\n",
      "utf8",
    );
    await writeDailyReport(root, "2026-05-26", analyzedReport([analyzedBlock("high", "新しい高重要度")]));

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });
    const index = await readFile(result.indexPath, "utf8");

    expect(index).toContain("## 重要度高トピック");
    expect(index.indexOf("[[topics/広告規制/2026-05-26_新しい高重要度|新しい高重要度]]")).toBeLessThan(
      index.indexOf("[[topics/広告規制/2026-05-25_古い高重要度|古い高重要度]]"),
    );
    expect(index).toContain(
      "| [[topics/広告規制/2026-05-26_新しい高重要度|新しい高重要度]] | 広告規制 | 2026-05-26 | [あり](https://example.com/source) |",
    );
  });

  it("only includes high legal-watch topic files in the topic index", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    const topicsDir = path.join(vault, "Legal Watch", "topics", "広告規制");
    await mkdir(topicsDir, { recursive: true });
    await writeFile(
      path.join(topicsDir, "2026-05-25_手動メモ.md"),
      "# 手動メモ\n",
      "utf8",
    );
    await writeFile(
      path.join(topicsDir, "2026-05-25_中重要度.md"),
      "---\ntype: legal-watch-topic\ndate: 2026-05-25\nimportance: medium\ncategory: 広告規制\n---\n# 中重要度\n",
      "utf8",
    );
    await writeDailyReport(root, "2026-05-26", analyzedReport([analyzedBlock("high", "新しい高重要度")]));

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });
    const index = await readFile(result.indexPath, "utf8");

    expect(index).toContain("新しい高重要度");
    expect(index).not.toContain("手動メモ");
    expect(index).not.toContain("中重要度");
  });

  it("escapes source URLs in topic index links", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    const markdown = analyzedReport([
      analyzedBlock("high", "URLに記号").replace(
        "- 原典: https://example.com/source",
        "- 原典: https://example.com/a)b|c d",
      ),
    ]);
    await writeDailyReport(root, "2026-05-26", markdown);

    const result = await syncDailyReportToObsidian({
      root,
      vaultPath: vault,
      date: "2026-05-26",
    });

    await expect(readFile(result.indexPath, "utf8")).resolves.toContain(
      "[あり](https://example.com/a%29b%7Cc%20d)",
    );
  });
});

describe("syncWeeklyReportToObsidian", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    delete process.env.LEGAL_WATCH_OBSIDIAN_VAULT_PATH;
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("copies a weekly report into the Obsidian weekly directory", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    const markdown = [
      "---",
      "type: legal-watch-weekly",
      "week: 2026-W22",
      "period_start: 2026-05-25",
      "period_end: 2026-05-31",
      "analyzed_count: 5",
      "---",
      "",
      "# Weekly",
      "",
    ].join("\n");
    const sourcePath = await writeWeeklyReport(root, "2026-W22", markdown);

    const result = await syncWeeklyReportToObsidian({
      root,
      vaultPath: vault,
      week: "2026-W22",
    });

    const destinationPath = path.join(
      vault,
      "Legal Watch",
      "weekly",
      "2026-W22_legal_watch.md",
    );
    const indexPath = path.join(vault, "Legal Watch", "index.md");
    expect(result).toEqual({
      week: "2026-W22",
      sourcePath,
      destinationPath,
      indexPath,
      skipped: false,
    });
    const destination = matter(await readFile(destinationPath, "utf8"));
    expect(destination.data).toMatchObject({
      type: "legal-watch-weekly",
      week: "2026-W22",
      period_start: "2026-05-25",
      period_end: "2026-05-31",
      analyzed_count: 5,
    });
    expect(destination.data.tags).toEqual(["legal-watch", "法令監視", "週次"]);
    await expect(readFile(sourcePath, "utf8")).resolves.toBe(markdown);
    await expect(readFile(indexPath, "utf8")).resolves.toContain(
      "| [[weekly/2026-W22_legal_watch|2026-W22]] | 2026-05-25〜2026-05-31 | 5 |",
    );
  });

  it("creates missing Obsidian weekly destination directories", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = path.join(await makeTempDir("legal-watch-vault-parent-"), "Vault");
    tempDirs.push(root, path.dirname(vault));
    await writeWeeklyReport(root, "2026-W22", "# Weekly\n");

    await syncWeeklyReportToObsidian({
      root,
      vaultPath: vault,
      week: "2026-W22",
    });

    await expect(
      readFile(
        path.join(vault, "Legal Watch", "weekly", "2026-W22_legal_watch.md"),
        "utf8",
      ),
    ).resolves.toContain("# Weekly");
  });

  it("skips an existing Obsidian weekly file by default", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    await writeWeeklyReport(root, "2026-W22", "# Source weekly\n");
    const destinationPath = path.join(
      vault,
      "Legal Watch",
      "weekly",
      "2026-W22_legal_watch.md",
    );
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, "# Manual weekly notes\n", "utf8");

    const result = await syncWeeklyReportToObsidian({
      root,
      vaultPath: vault,
      week: "2026-W22",
    });

    expect(result.skipped).toBe(true);
    await expect(readFile(destinationPath, "utf8")).resolves.toBe(
      "# Manual weekly notes\n",
    );
    await expect(readFile(result.indexPath, "utf8")).resolves.toContain(
      "[[weekly/2026-W22_legal_watch|2026-W22]]",
    );
  });

  it("overwrites an existing Obsidian weekly file when force is true", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    await writeWeeklyReport(root, "2026-W22", "# Source weekly\n");
    const destinationPath = path.join(
      vault,
      "Legal Watch",
      "weekly",
      "2026-W22_legal_watch.md",
    );
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, "# Manual weekly notes\n", "utf8");

    const result = await syncWeeklyReportToObsidian({
      root,
      vaultPath: vault,
      week: "2026-W22",
      force: true,
    });

    expect(result.skipped).toBe(false);
    const destination = await readFile(destinationPath, "utf8");
    expect(destination).toContain("# Source weekly");
    expect(matter(destination).data.tags).toEqual([
      "legal-watch",
      "法令監視",
      "週次",
    ]);
  });

  it("uses LEGAL_WATCH_OBSIDIAN_VAULT_PATH when vaultPath is omitted", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    process.env.LEGAL_WATCH_OBSIDIAN_VAULT_PATH = vault;
    await writeWeeklyReport(root, "2026-W22", "# Weekly\n");

    await syncWeeklyReportToObsidian({ root, week: "2026-W22" });

    await expect(
      readFile(
        path.join(vault, "Legal Watch", "weekly", "2026-W22_legal_watch.md"),
        "utf8",
      ),
    ).resolves.toContain("# Weekly");
  });

  it("throws a useful error when the Obsidian Vault path is not configured", async () => {
    const root = await makeTempDir("legal-watch-root-");
    tempDirs.push(root);

    await expect(
      syncWeeklyReportToObsidian({ root, week: "2026-W22" }),
    ).rejects.toThrow("LEGAL_WATCH_OBSIDIAN_VAULT_PATH is not set");
  });

  it("throws a useful error when the weekly report is missing", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);

    await expect(
      syncWeeklyReportToObsidian({
        root,
        vaultPath: vault,
        week: "2026-W22",
      }),
    ).rejects.toThrow("Weekly report not found");
  });

  it("rejects malformed weeks before using them as file paths", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);

    await expect(
      syncWeeklyReportToObsidian({
        root,
        vaultPath: vault,
        week: "../outside",
        force: true,
      }),
    ).rejects.toThrow("Invalid ISO week: ../outside");
  });

  it("preserves and de-duplicates existing weekly tags during enrichment", () => {
    const enriched = matter(
      enrichWeeklyMarkdownForObsidian(
        [
          "---",
          "type: legal-watch-weekly",
          "week: 2026-W22",
          "period_start: 2026-05-25",
          "period_end: 2026-05-31",
          "tags:",
          "  - '#legal-watch'",
          "  - custom",
          "---",
          "",
          "# Weekly",
          "",
        ].join("\n"),
      ),
    );

    expect(enriched.data).toMatchObject({
      period_start: "2026-05-25",
      period_end: "2026-05-31",
    });
    expect(enriched.data.tags).toEqual([
      "legal-watch",
      "custom",
      "法令監視",
      "週次",
    ]);
  });

  it("adds weekly links to the generated index sorted newest first", async () => {
    const root = await makeTempDir("legal-watch-root-");
    const vault = await makeTempDir("legal-watch-vault-");
    tempDirs.push(root, vault);
    const weeklyDir = path.join(vault, "Legal Watch", "weekly");
    await mkdir(weeklyDir, { recursive: true });
    await writeFile(
      path.join(weeklyDir, "2026-W21_legal_watch.md"),
      "---\ntype: legal-watch-weekly\nweek: 2026-W21\nperiod_start: 2026-05-18\nperiod_end: 2026-05-24\nanalyzed_count: 2\n---\n# Older\n",
      "utf8",
    );
    await writeFile(
      path.join(weeklyDir, "2026-W23_legal_watch.md"),
      "---\ntype: legal-watch-weekly\nweek: 2026-W23\nperiod_start: 2026-06-01\nperiod_end: 2026-06-07\nanalyzed_count: 3\n---\n# Newer\n",
      "utf8",
    );
    await writeWeeklyReport(
      root,
      "2026-W22",
      "---\ntype: legal-watch-weekly\nweek: 2026-W22\nperiod_start: 2026-05-25\nperiod_end: 2026-05-31\nanalyzed_count: 5\n---\n# Current\n",
    );

    const result = await syncWeeklyReportToObsidian({
      root,
      vaultPath: vault,
      week: "2026-W22",
    });
    const index = await readFile(result.indexPath, "utf8");

    expect(index).toContain("## 最近の週次レポート");
    expect(index.indexOf("[[weekly/2026-W23_legal_watch|2026-W23]]")).toBeLessThan(
      index.indexOf("[[weekly/2026-W22_legal_watch|2026-W22]]"),
    );
    expect(index.indexOf("[[weekly/2026-W22_legal_watch|2026-W22]]")).toBeLessThan(
      index.indexOf("[[weekly/2026-W21_legal_watch|2026-W21]]"),
    );
    expect(index).toContain(
      "| [[weekly/2026-W21_legal_watch|2026-W21]] | 2026-05-18〜2026-05-24 | 2 |",
    );
  });
});
