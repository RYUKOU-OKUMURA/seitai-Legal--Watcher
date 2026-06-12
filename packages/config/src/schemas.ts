import { z } from "zod";

export const watchTargetSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["rss", "html", "api", "pdf"]),
  url: z.string().min(1),
  weight: z.enum(["high", "medium", "low"]),
  alwaysAnalyze: z.boolean().default(false),
  enabled: z.boolean().default(true),
  stableIdField: z.string().optional(),
  itemsPath: z.string().optional(),
  contentSelector: z.string().optional(),
  followPdfLinks: z.boolean().optional(),
  pdfLinkSelector: z.string().optional(),
  pdfMaxLinks: z.number().int().positive().optional(),
  keywordProfile: z.string().optional(),
});

export const sourcesFileSchema = z.object({
  sources: z.array(watchTargetSchema),
});

export const keywordsFileSchema = z.object({
  keywords: z.array(z.string()),
  profiles: z.record(z.string(), z.array(z.string())).optional(),
});

export const displayFileSchema = z.object({
  operator_label: z.string().default("Operator"),
  checkpoints_heading: z.string().default("確認ポイント"),
});

export type SourcesFile = z.infer<typeof sourcesFileSchema>;
export type KeywordsFile = z.infer<typeof keywordsFileSchema>;
export type DisplayFile = z.infer<typeof displayFileSchema>;
