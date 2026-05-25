import { z } from "zod";

export const analysisSchema = z.object({
  relevance: z.enum(["high", "medium", "low"]),
  importance: z.enum(["high", "medium", "low"]),
  category: z.string(),
  targetBusiness: z.array(z.string()),
  summary: z.string(),
  whatChanged: z.string(),
  impact: z.string(),
  adImpact: z.string(),
  operator_checkpoints: z.array(z.string()),
  needsOriginalCheck: z.boolean(),
  needsLocalGovernmentCheck: z.boolean(),
  needsExpertReview: z.boolean(),
  confidence: z.number().min(0).max(1),
  unknowns: z.array(z.string()),
  sourceUrl: z.string().url(),
});

export type AnalysisPayload = z.infer<typeof analysisSchema>;
