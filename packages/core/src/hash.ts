import { createHash } from "node:crypto";

export function contentHash(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function buildSnapshotPayload(
  title: string,
  bodyText: string,
  links: string[],
  pdfHashes: string[] = [],
  pdfErrors: string[] = [],
): string {
  const sortedLinks = [...links].sort().join("\n");
  const sortedPdfHashes = [...pdfHashes].sort().join("\n");
  const sortedPdfErrors = [...pdfErrors].sort().join("\n");
  return `${title}\n---\n${bodyText}\n---\n${sortedLinks}\n---\n${sortedPdfHashes}\n---\n${sortedPdfErrors}`;
}

export function truncateExcerpt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}
