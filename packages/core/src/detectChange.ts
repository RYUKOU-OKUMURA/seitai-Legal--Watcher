import { createTwoFilesPatch } from "diff";
import { randomUUID } from "node:crypto";
import type { ChangeType, FetchSnapshot, TargetState } from "./types.js";
import type { DetectedChange } from "./types.js";
import { truncateExcerpt, contentHash, buildSnapshotPayload } from "./hash.js";
import { EXCERPT_MAX_CHARS } from "./constants.js";

export function resolveChangeType(
  prev: TargetState | undefined,
  current: FetchSnapshot,
): ChangeType | null {
  if (current.httpStatus < 200 || current.httpStatus >= 400) {
    return "failed";
  }
  if (!prev) return "new";
  if (prev.contentHash === current.contentHash) return null;
  return "updated";
}

export function buildDiffText(
  prev: TargetState | undefined,
  current: FetchSnapshot,
): string | undefined {
  if (!prev?.bodyExcerpt) return undefined;
  const oldPdfs = Object.entries(prev.pdfs ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([url, pdf]) => `PDF ${url}\n${pdf.contentHash}\n${pdf.textExcerpt ?? ""}`)
    .join("\n");
  const newPdfs = (current.pdfExcerpts ?? [])
    .map((pdf) => `PDF ${pdf.url}\n${pdf.contentHash}\n${pdf.textExcerpt}`)
    .sort()
    .join("\n");
  const oldPdfErrors = (prev.pdfErrors ?? [])
    .map((pdf) => `PDF_ERROR ${pdf.url}\n${pdf.error}`)
    .sort()
    .join("\n");
  const newPdfErrors = (current.pdfErrors ?? [])
    .map((pdf) => `PDF_ERROR ${pdf.url}\n${pdf.error}`)
    .sort()
    .join("\n");
  // prev.bodyExcerpt は保存時に EXCERPT_MAX_CHARS で切り詰め済みのため、
  // 新側も同じ長さに切らないと長文ページで末尾が偽の追加差分になる
  const oldText = `${prev.title ?? ""}\n${prev.bodyExcerpt}\n${(prev.links ?? []).join("\n")}\n${oldPdfs}\n${oldPdfErrors}`;
  const newText = `${current.title}\n${truncateExcerpt(current.bodyText, EXCERPT_MAX_CHARS)}\n${current.links.join("\n")}\n${newPdfs}\n${newPdfErrors}`;
  if (oldText === newText) return undefined;
  return createTwoFilesPatch("previous", "current", oldText, newText) ?? undefined;
}

export function createDetectedChange(
  snapshot: FetchSnapshot,
  sourceWeight: import("./types.js").SourceWeight,
  prev: TargetState | undefined,
  changeType: ChangeType,
): DetectedChange {
  const diffText = changeType === "failed" ? undefined : buildDiffText(prev, snapshot);
  return {
    id: randomUUID(),
    sourceId: snapshot.sourceId,
    sourceName: snapshot.sourceName,
    sourceWeight,
    targetKey: snapshot.targetKey,
    url: snapshot.url,
    title: snapshot.title,
    publishedAt: snapshot.publishedAt,
    detectedAt: snapshot.fetchedAt,
    changeType,
    diffText,
    bodyExcerpt: truncateExcerpt(snapshot.bodyText, EXCERPT_MAX_CHARS),
    links: snapshot.links,
    pdfExcerpts: snapshot.pdfExcerpts,
    pdfErrors: snapshot.pdfErrors,
    httpStatus: snapshot.httpStatus,
  };
}

export function snapshotToTargetState(snapshot: FetchSnapshot): TargetState {
  return {
    contentHash: snapshot.contentHash,
    title: snapshot.title,
    lastFetchedAt: snapshot.fetchedAt,
    lastHttpStatus: snapshot.httpStatus,
    bodyExcerpt: truncateExcerpt(snapshot.bodyText, EXCERPT_MAX_CHARS),
    links: snapshot.links,
    pdfs: Object.fromEntries(
      (snapshot.pdfExcerpts ?? []).map((pdf) => [
        pdf.url,
        {
          contentHash: pdf.contentHash,
          textExcerpt: pdf.textExcerpt,
          title: pdf.title,
        },
      ]),
    ),
    pdfErrors: snapshot.pdfErrors,
  };
}

export function hashFromSnapshot(snapshot: Omit<FetchSnapshot, "contentHash">): string {
  return contentHash(
    buildSnapshotPayload(
      snapshot.title,
      snapshot.bodyText,
      snapshot.links,
      (snapshot.pdfExcerpts ?? []).map((pdf) => `${pdf.url}:${pdf.contentHash}`),
      (snapshot.pdfErrors ?? []).map((pdf) => `${pdf.url}:${pdf.error}`),
    ),
  );
}
