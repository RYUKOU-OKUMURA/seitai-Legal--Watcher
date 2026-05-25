import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { WatchTargetConfig } from "@seitai-legal-watch/core";
import {
  displayFileSchema,
  keywordsFileSchema,
  sourcesFileSchema,
  type DisplayFile,
} from "./schemas.js";

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_CONFIG_DIR = path.join(CONFIG_DIR, "..");

export interface AppConfig {
  sources: WatchTargetConfig[];
  enabledSources: WatchTargetConfig[];
  keywords: string[];
  display: DisplayFile;
}

export async function loadConfig(configDir?: string): Promise<AppConfig> {
  const dir = configDir ?? PACKAGE_CONFIG_DIR;

  const [sourcesRaw, keywordsRaw, displayRaw] = await Promise.all([
    readFile(path.join(dir, "sources.yaml"), "utf8"),
    readFile(path.join(dir, "keywords.yaml"), "utf8"),
    readFile(path.join(dir, "display.yaml"), "utf8"),
  ]);

  const sourcesFile = sourcesFileSchema.parse(parse(sourcesRaw));
  const keywordsFile = keywordsFileSchema.parse(parse(keywordsRaw));
  const display = displayFileSchema.parse(parse(displayRaw));

  const sources = sourcesFile.sources as WatchTargetConfig[];
  const enabledSources = sources.filter((s) => s.enabled);

  return {
    sources,
    enabledSources,
    keywords: keywordsFile.keywords,
    display,
  };
}
