import { digest } from '../audit/audit.service';
import type { IngestInput, Evidence } from '@veridict/contracts';
import type {
  KnowledgeSource,
  SourceChunk,
  Prisma,
} from '../generated/prisma/client';
import { personalDataKind, type PersonalDataKind } from '@veridict/contracts';
import { z } from 'zod';

const localSpan = z.object({
  field_type: personalDataKind,
  start: z.number().int().min(0),
  end: z.number().int().positive(),
  complete: z.boolean().default(true),
});
type Span = z.infer<typeof localSpan>;
export function readPersonalDataSpans(value: unknown): Span[] {
  const parsed = z.array(localSpan).safeParse(value);
  return parsed.success ? parsed.data : [];
}
export function personalDataSpans(value: string, annotations: Span[] = []) {
  const candidates: Span[] = annotations
    .filter((s) => s.start < s.end && s.end <= value.length)
    .map((s) => ({ ...s }));
  const capture = (
    pattern: RegExp,
    field_type: PersonalDataKind,
    group = 0,
  ) => {
    for (const match of value.matchAll(pattern)) {
      const start = match.index + match[0].indexOf(match[group]);
      candidates.push({
        field_type,
        start,
        end: start + match[group].length,
        complete: true,
      });
    }
  };
  capture(/\b[\w.+%-]+@[\w.-]+\.[a-z]{2,}\b/gi, 'EMAIL');
  capture(/\b\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}\b/g, 'NPWP');
  capture(/(?:NPWP)\s*[:=]\s*([\d.-]{15,24})/gi, 'NPWP', 1);
  capture(
    /(?:bank account|nomor rekening|no\.? rekening|rekening)\s*[:=]\s*(\d[\d -]{4,28}\d)/gi,
    'BANK_ACCOUNT',
    1,
  );
  capture(
    /(?:date of birth|DOB|tanggal lahir|tgl lahir)\s*[:=]\s*(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})/gi,
    'DATE_OF_BIRTH',
    1,
  );
  capture(
    /(?:passport(?: number)?|nomor paspor)\s*[:=]\s*([a-z0-9]{6,12})\b/gi,
    'PASSPORT_NUMBER',
    1,
  );
  capture(/\b\d{16}\b/g, 'NIK');
  capture(/(?:\+62|\b62|\b08)[\d ()-]{7,18}\d\b/g, 'PHONE');
  const spans: Span[] = [];
  for (const candidate of candidates) {
    const overlaps = spans.filter(
      (s) => candidate.start < s.end && candidate.end > s.start,
    );
    if (
      overlaps.some(
        (s) => s.start === candidate.start && s.end === candidate.end,
      )
    )
      continue;
    if (!overlaps.length) {
      spans.push(candidate);
      continue;
    }
    const start = Math.min(candidate.start, ...overlaps.map((s) => s.start));
    const end = Math.max(candidate.end, ...overlaps.map((s) => s.end));
    for (const existing of overlaps) spans.splice(spans.indexOf(existing), 1);
    spans.push({ ...overlaps[0], start, end, complete: false });
  }
  return spans
    .sort((a, b) => a.start - b.start)
    .map((s) => ({ ...s, value: value.slice(s.start, s.end) }));
}
export function maskPII(
  value: string,
  allowedValues: string[] = [],
  annotations: Span[] = [],
) {
  let output = '';
  let start = 0;
  for (const span of personalDataSpans(value, annotations)) {
    output +=
      value.slice(start, span.start) +
      (allowedValues.includes(span.value)
        ? span.value
        : `[REDACTED_${span.field_type}]`);
    start = span.end;
  }
  return output + value.slice(start);
}
export function maskUsingChunks(
  value: string,
  chunks: Pick<SourceChunk, 'content' | 'personalDataSpans'>[],
  allowedValues: string[] = [],
) {
  const annotations: Span[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks)
    for (const span of personalDataSpans(
      chunk.content,
      readPersonalDataSpans(chunk.personalDataSpans),
    )) {
      if (seen.has(span.value)) continue;
      seen.add(span.value);
      let from = 0;
      let start: number;
      while ((start = value.indexOf(span.value, from)) >= 0) {
        annotations.push({
          field_type: span.field_type,
          start,
          end: start + span.value.length,
          complete: true,
        });
        from = start + span.value.length;
      }
    }
  return maskPII(value, allowedValues, annotations);
}
export function maskJsonUsingChunks(
  value: Prisma.JsonValue,
  chunks: Pick<SourceChunk, 'content' | 'personalDataSpans'>[],
): Prisma.JsonValue {
  if (typeof value === 'string') return maskUsingChunks(value, chunks);
  if (typeof value === 'number') {
    const masked = maskUsingChunks(String(value), chunks);
    return masked === String(value) ? value : masked;
  }
  if (Array.isArray(value))
    return value.map((v) => maskJsonUsingChunks(v, chunks));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        maskUsingChunks(k, chunks),
        maskJsonUsingChunks(v ?? null, chunks),
      ]),
    );
  return value;
}
export function normalize(input: IngestInput) {
  if (input.content !== undefined) return input.content;
  return input
    .records!.map((r, i) =>
      [
        `[${input.type.toLowerCase()} ${i + 1}]`,
        r.author ? `Author: ${r.author}` : '',
        r.timestamp ? `Timestamp: ${r.timestamp}` : '',
        r.reference ? `Reference: ${r.reference}` : '',
        r.text,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
}
export function splitContent(content: string) {
  const chunks: {
    content: string;
    chunkIndex: number;
    spanStart: number;
    spanEnd: number;
    integrityHash: string;
  }[] = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(start + 1600, content.length);
    if (end < content.length) {
      const boundary = content.lastIndexOf('\n', end);
      if (boundary > start + 800) end = boundary;
      // Avoid splitting a UTF-16 surrogate pair.
      const char = content.charCodeAt(end - 1);
      if (char >= 0xd800 && char <= 0xdbff) end--;
    }
    const text = content.slice(start, end);
    chunks.push({
      content: text,
      chunkIndex: chunks.length,
      spanStart: start,
      spanEnd: end,
      integrityHash: digest(text),
    });
    if (end === content.length) break;
    start = end - 200;
    const char = content.charCodeAt(start);
    if (char >= 0xdc00 && char <= 0xdfff) start++;
  }
  return chunks;
}
export function evidence(
  chunk: SourceChunk & { source: KnowledgeSource },
): Evidence & { redacted: boolean } {
  const source = chunk.source;
  const excerpt = maskPII(
    chunk.content,
    [],
    readPersonalDataSpans(chunk.personalDataSpans),
  );
  return {
    source_id: source.id,
    chunk_id: chunk.id,
    title: maskUsingChunks(source.title, [chunk]),
    source_type: source.type,
    excerpt,
    redacted: excerpt !== chunk.content,
    span_start: chunk.spanStart,
    span_end: chunk.spanEnd,
    integrity_hash: chunk.integrityHash,
    source_state: source.state,
    version: source.version,
    issuer_id: source.issuerId,
    valid_from: source.validFrom?.toISOString() ?? null,
    valid_until: source.validUntil?.toISOString() ?? null,
    recorded_at: source.recordedAt.toISOString(),
  };
}
