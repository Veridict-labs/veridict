import { digest } from '../audit/audit.service';
import type { IngestInput, Evidence } from '@veridict/contracts';
import type { KnowledgeSource, SourceChunk } from '../generated/prisma/client';

export function maskPII(value: string) {
  return value
    .replace(/\b\d{16}\b/g, '[REDACTED_NIK]')
    .replace(/(?:\+62|\b62|\b08)[\d ()-]{7,18}\d\b/g, '[REDACTED_PHONE]');
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
  const excerpt = maskPII(chunk.content);
  return {
    source_id: source.id,
    chunk_id: chunk.id,
    title: maskPII(source.title),
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
