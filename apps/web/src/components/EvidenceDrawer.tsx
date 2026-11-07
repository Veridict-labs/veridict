'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import type { Citation, Evidence } from '@/lib/types';
import { Icon } from './Icon';
import { SourceStatePill, SourceTypeLabel, formatDate } from './ui';
import { PersonalDataRequestForm } from './PersonalDataRequestForm';

type Load =
  | { state: 'loading' }
  | { state: 'ok'; evidence: Evidence }
  | { state: 'denied' };

/**
 * Opens one citation. The excerpt is fetched again on every open, so revoked access shows as denied.
 * Render with key={citation.chunk_id} so each source starts from the loading state.
 */
export function EvidenceDrawer({
  citation,
  onClose,
}: {
  citation: Citation | null;
  onClose(): void;
}) {
  const { client } = useSession();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!citation || !client) return;
    let live = true;
    client
      .evidence(citation.source_id, citation.chunk_id)
      .then((evidence) => live && setLoad({ state: 'ok', evidence }))
      .catch(() => live && setLoad({ state: 'denied' }));
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      live = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [citation, client, onClose]);

  if (!citation) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Source evidence"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <Icon name="shield" size={17} className="text-brand" />
            Source evidence
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
            aria-label="Close evidence"
          >
            <Icon name="x" size={17} />
          </button>
        </div>

        <div className="flex-1 px-5 py-5">
          {load.state === 'loading' && (
            <p className="vd-pulse text-sm text-ink-3">
              Checking your access to this source…
            </p>
          )}

          {load.state === 'denied' && (
            <div className="rounded-xl border border-line bg-surface-2 p-5">
              <Icon name="lock" size={22} className="mb-2 text-ink-3" />
              <p className="font-semibold">
                This source is not available to you
              </p>
              <p className="mt-1 text-sm text-ink-2">
                Access is checked again every time a source is opened. If your
                permissions changed after this answer was written, the evidence
                will no longer open.
              </p>
            </div>
          )}

          {load.state === 'ok' && (
            <article>
              <div className="flex flex-wrap items-center gap-2">
                <SourceTypeLabel type={load.evidence.source_type} />
                <SourceStatePill state={load.evidence.source_state} />
                <span className="text-xs text-ink-3">
                  v{load.evidence.version}
                </span>
              </div>
              <h2 className="mt-2 text-xl font-bold">{load.evidence.title}</h2>

              <blockquote className="mt-4 rounded-xl border-l-4 border-brand bg-brand-soft/60 px-4 py-3 leading-relaxed">
                {load.evidence.excerpt}
              </blockquote>
              {load.evidence.redacted && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-3">
                  <Icon name="lock" size={13} />
                  Personal data in this excerpt is masked.
                </p>
              )}
              {load.evidence.redacted && <PersonalDataRequestForm citation={citation} />}

              <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Meta
                  label="Valid from"
                  value={formatDate(load.evidence.valid_from)}
                />
                <Meta
                  label="Valid until"
                  value={
                    load.evidence.valid_until
                      ? formatDate(load.evidence.valid_until)
                      : 'No end date'
                  }
                />
                <Meta
                  label="Recorded"
                  value={formatDate(load.evidence.recorded_at, true)}
                />
                <Meta
                  label="Characters"
                  value={`${load.evidence.span_start}–${load.evidence.span_end}`}
                />
                <div className="col-span-2">
                  <dt className="text-xs text-ink-3">Integrity hash</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-ink-2">
                    {load.evidence.integrity_hash}
                  </dd>
                </div>
              </dl>
            </article>
          )}
        </div>
      </aside>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
