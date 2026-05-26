import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { afterEach, describe, expect, it } from "vitest";
import {
  enrichDailyMarkdownForObsidian,
  syncDailyReportToObsidian,
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
});
