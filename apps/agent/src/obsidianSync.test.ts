import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncDailyReportToObsidian } from "./obsidianSync.js";

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
    const markdown = "---\ntype: legal-watch-daily\n---\n\n# Daily\n";
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
    expect(result).toEqual({
      date: "2026-05-26",
      sourcePath,
      destinationPath,
      skipped: false,
    });
    await expect(readFile(destinationPath, "utf8")).resolves.toBe(markdown);
    await expect(readFile(sourcePath, "utf8")).resolves.toBe(markdown);
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
    ).resolves.toBe("# Daily\n");
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
    await expect(readFile(destinationPath, "utf8")).resolves.toBe(
      "# Source report\n",
    );
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
    ).resolves.toBe("# Daily\n");
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
});
