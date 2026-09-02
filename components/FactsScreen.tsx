'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  Lock,
  Pencil,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useCaseStore } from '@/lib/store/caseStore';
import { groupFacts, pendingConfirmations, type FactRow } from '@/lib/facts/domains';
import { canGeneratePlan, evaluateRisks, type RiskFlag } from '@/lib/rules/risk';
import { isRecordArray, RecordTable } from '@/components/ui/RecordTable';
import type { Confidence, Ref } from '@/lib/types/case';

/**
 * S3 Facts Review (PRD §6, FR-9..FR-11).
 *
 * Three stacked concerns, in the order a TSA works them: risk banners first
 * (what could stop the upgrade), then the confirmation queue (what must be
 * resolved before a plan can be generated), then the full facts table.
 */
export function FactsScreen() {
  const router = useRouter();
  const doc = useCaseStore((s) => s.doc);

  const risks = useMemo(() => (doc ? evaluateRisks(doc) : []), [doc]);
  const pending = useMemo(() => (doc ? pendingConfirmations(doc) : []), [doc]);
  const groups = useMemo(() => (doc ? groupFacts(doc) : []), [doc]);

  if (!doc) {
    return (
      <section className="card p-6">
        <h1 className="text-[17px] font-bold text-gray-900">Facts Review</h1>
        <p className="mt-2 text-[13px] text-gray-600">
          Create or open a case first.
        </p>
      </section>
    );
  }

  if (Object.keys(doc.facts).length === 0) {
    return (
      <section className="card p-6">
        <h1 className="text-[17px] font-bold text-gray-900">Facts Review</h1>
        <p className="mt-2 text-[13px] text-gray-600">
          No facts yet — parse an HCU archive on the Intake screen first.
        </p>
        <button
          type="button"
          onClick={() => router.push('/intake')}
          className="mt-3 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover"
        >
          Go to Intake
        </button>
      </section>
    );
  }

  const ready = canGeneratePlan(doc);

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h1 className="text-[15px] font-bold text-gray-900">Facts Review</h1>
        <p className="mt-1 text-[13px] text-gray-600">
          {Object.keys(doc.facts).length} facts extracted from{' '}
          {doc.archives.length} archive{doc.archives.length === 1 ? '' : 's'} · target{' '}
          {doc.case.target_version}
        </p>
        <div
          className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${
            ready
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {ready ? (
            <ShieldCheck size={15} className="mt-px shrink-0" />
          ) : (
            <Lock size={15} className="mt-px shrink-0" />
          )}
          <p>
            {ready
              ? 'All inferred values resolved and no blockers outstanding — plan generation is unblocked.'
              : 'Plan generation is blocked until every blocker below is resolved.'}
          </p>
        </div>
      </section>

      {risks.length > 0 && (
        <section className="space-y-2">
          {risks.map((flag) => (
            <RiskBanner key={flag.id} flag={flag} />
          ))}
        </section>
      )}

      {pending.length > 0 && (
        <section className="card p-5">
          <h2 className="text-[14px] font-bold text-gray-900">
            Confirm inferred values
            <span className="ml-2 font-mono text-[11px] font-normal text-gray-500">
              {pending.length} outstanding
            </span>
          </h2>
          <p className="mt-1 text-[12px] text-gray-600">
            These were not read directly from the archive. Confirm each one, or correct it — both
            values are kept in the audit trail.
          </p>
          <div className="mt-3 space-y-3">
            {pending.map((row) => (
              <ConfirmationCard key={row.key} row={row} />
            ))}
          </div>
        </section>
      )}

      {groups.map((group) => (
        <FactTable key={group.domain} domain={group.domain} rows={group.rows} />
      ))}
    </div>
  );
}

function RiskBanner({ flag }: { flag: RiskFlag }) {
  const isBlocker = flag.risk === 'blocker';
  return (
    <div
      className={`card border-l-4 p-4 ${
        isBlocker ? 'border-l-risk-blocker bg-red-50/40' : 'border-l-risk-warning bg-amber-50/40'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {isBlocker ? (
          <AlertOctagon size={16} className="mt-0.5 shrink-0 text-risk-blocker" />
        ) : (
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-risk-warning" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-gray-900">
            {flag.title}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                isBlocker ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {flag.risk}
            </span>
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-700">{flag.detail}</p>
          {flag.refs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {flag.refs.map((ref) => (
                <RefLink key={ref.url} refItem={ref} />
              ))}
            </div>
          )}
          {flag.evidence.length > 0 && (
            <p className="mt-2 font-mono text-xs text-gray-600">
              from {flag.evidence.join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RefLink({ refItem }: { refItem: Ref }) {
  return (
    <a
      href={refItem.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary-dark hover:underline"
    >
      <ExternalLink size={11} />
      {refItem.label}
    </a>
  );
}

function ConfirmationCard({ row }: { row: FactRow }) {
  const confirmFact = useCaseStore((s) => s.confirmFact);
  const correctFact = useCaseStore((s) => s.correctFact);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => formatValue(row.fact.value));

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <p className="text-[13px] font-semibold text-gray-900">{row.label}</p>
      <p className="mt-1 break-words text-[13px] text-gray-800">{formatValue(row.fact.value)}</p>
      <Provenance row={row} />

      {editing ? (
        <div className="mt-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-gray-700">
              Correct value
            </span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-primary focus:outline-none"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={draft.trim() === ''}
              onClick={() => {
                correctFact(row.key, draft.trim());
                setEditing(false);
              }}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
                draft.trim() === ''
                  ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                  : 'bg-primary text-white hover:bg-primary-hover'
              }`}
            >
              Save correction
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(formatValue(row.fact.value));
                setEditing(false);
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => confirmFact(row.key)}
            className="flex items-center gap-1.5 rounded-lg bg-risk-clear px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700"
          >
            <Check size={13} /> Confirm
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <Pencil size={13} /> Correct
          </button>
        </div>
      )}
    </div>
  );
}

function FactTable({ domain, rows }: { domain: string; rows: FactRow[] }) {
  const [open, setOpen] = useState(true);
  const clearConfirmation = useCaseStore((s) => s.clearConfirmation);

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="flex-1 text-[14px] font-bold text-gray-900">
          {domain}
          <span className="ml-2 font-mono text-[11px] font-normal text-gray-500">
            {rows.length}
          </span>
        </span>
        <ChevronDown
          size={15}
          className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {rows.map((row) => (
            <div key={row.key} className="border-b border-gray-50 px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13px] font-medium text-gray-900">{row.label}</span>
                <ConfidenceBadge confidence={row.fact.confidence} />
                {row.confirmed && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    confirmed
                  </span>
                )}
                {row.corrected && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                    corrected
                  </span>
                )}
                {(row.confirmed || row.corrected) && (
                  <button
                    type="button"
                    title="Undo this confirmation"
                    aria-label={`Undo confirmation for ${row.label}`}
                    onClick={() => clearConfirmation(row.key)}
                    className="text-gray-400 hover:text-gray-700"
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
              </div>

              <ValueBlock row={row} />

              <Provenance row={row} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ValueBlock({ row }: { row: FactRow }) {
  if (row.corrected) {
    return (
      <div className="mt-1 text-[13px]">
        <p className="break-words text-gray-900">{formatValue(row.correctedValue)}</p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          extracted value was{' '}
          <span className="line-through">{formatValue(row.fact.value)}</span>
        </p>
      </div>
    );
  }
  // Record arrays (patch history, agents, disk) read as a table, not a sentence.
  if (isRecordArray(row.fact.value)) {
    return <RecordTable rows={row.fact.value} />;
  }
  return <p className="mt-1 break-words text-[13px] text-gray-800">{formatValue(row.fact.value)}</p>;
}

const BADGE: Record<Confidence, string> = {
  EXACT: 'bg-emerald-50 text-emerald-700',
  DERIVED: 'bg-blue-50 text-blue-700',
  INFERRED: 'bg-amber-50 text-amber-800',
};

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-medium ${BADGE[confidence]}`}
    >
      {confidence}
    </span>
  );
}

/** Renders any extractor value readably without hiding detail. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return 'none';
    if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      return value.join(', ');
    }
    return value.map((v) => formatRecord(v)).join(' · ');
  }
  return formatRecord(value);
}

function formatRecord(value: unknown): string {
  if (typeof value !== 'object' || value === null) return String(value);
  return Object.entries(value)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('/') : String(v)}`)
    .join(', ');
}

/**
 * Where a fact came from. Key and extractor on one line; the archive member
 * path on its own line so it wraps at path separators instead of mid-word.
 * The raw extracted record (when present) is exposed as a hover title.
 */
function Provenance({ row }: { row: FactRow }) {
  const [file, member] = splitSource(row.fact.source);
  return (
    <div
      className="mt-1.5 space-y-0.5 font-mono text-xs leading-snug text-gray-600"
      title={row.fact.raw ? `raw: ${row.fact.raw}` : undefined}
    >
      <p>
        <span className="text-gray-800">{row.key}</span>
        <span className="text-gray-400"> · </span>
        {row.fact.extractor}
        {row.fact.raw && <span className="text-gray-400"> · hover for raw value</span>}
      </p>
      <p className="break-words">
        {file && <span className="text-gray-800">{file}</span>}
        {file && member && <span className="text-gray-400"> : </span>}
        {member ?? row.fact.source}
      </p>
    </div>
  );
}

/** "archive.zip:root/path/member.txt" → ["archive.zip", "root/path/member.txt"]. */
function splitSource(source: string): [string | null, string | null] {
  const i = source.indexOf(':');
  if (i <= 0) return [null, null];
  return [source.slice(0, i), source.slice(i + 1)];
}
