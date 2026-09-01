'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileArchive,
  Loader2,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { parseArchives, type ParseResult } from '@/lib/parser';
import { useCaseStore } from '@/lib/store/caseStore';

/**
 * S2 Intake (PRD §6, FR-4..FR-8).
 *
 * Archives are unpacked and parsed entirely in the browser — nothing leaves the
 * machine. Parse warnings never block intake; they surface in the diagnostics
 * panel below the results.
 *
 * Windows collections arrive as .zip, UNIX ones as .tar.gz/.tgz/.tar. The
 * container format is detected from magic bytes at parse time; the extension
 * filter here is only to keep obviously-wrong files out of the staging list.
 */

const MAX_ARCHIVES = 3;
const ARCHIVE_EXTENSIONS = ['.zip', '.tar.gz', '.tgz', '.tar'];

interface Staged {
  file: File;
  bytes: Uint8Array;
}

export function IntakeScreen() {
  const router = useRouter();
  const doc = useCaseStore((s) => s.doc);
  const applyParseResult = useCaseStore((s) => s.applyParseResult);

  const [staged, setStaged] = useState<Staged[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      const incoming = Array.from(files).filter((f) =>
        ARCHIVE_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)),
      );
      const rejected = Array.from(files).length - incoming.length;
      if (rejected > 0) {
        setError(
          `${rejected} file(s) ignored — HCU archives must be ${ARCHIVE_EXTENSIONS.join(', ')}.`,
        );
      }
      if (incoming.length === 0) return;

      const next: Staged[] = [];
      for (const file of incoming) {
        next.push({ file, bytes: new Uint8Array(await file.arrayBuffer()) });
      }
      setStaged((prev) => {
        const merged = [...prev];
        for (const s of next) {
          if (!merged.some((m) => m.file.name === s.file.name)) merged.push(s);
        }
        if (merged.length > MAX_ARCHIVES) {
          setError(`At most ${MAX_ARCHIVES} archives per case — extras were dropped.`);
        }
        return merged.slice(0, MAX_ARCHIVES);
      });
      setResult(null);
    },
    [],
  );

  function runParse() {
    if (staged.length === 0) return;
    setBusy(true);
    setError(null);
    // Yield a frame so the spinner paints before the synchronous unzip+parse.
    setTimeout(() => {
      try {
        const parsed = parseArchives(
          staged.map((s) => ({ fileName: s.file.name, bytes: s.bytes })),
        );
        setResult(parsed);
        applyParseResult(parsed);
        setShowDiagnostics(parsed.warnings.length > 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Parsing failed.');
      } finally {
        setBusy(false);
      }
    }, 0);
  }

  if (!doc) {
    return (
      <section className="card p-6">
        <h1 className="text-[17px] font-bold text-gray-900">Archive Intake</h1>
        <p className="mt-2 text-[13px] text-gray-600">
          Create or open a case first — parsed facts are stored on the case.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card p-6">
        <div className="flex items-center gap-2">
          <FileArchive size={16} className="text-primary" />
          <h1 className="text-[15px] font-bold text-gray-900">Archive Intake</h1>
        </div>
        <p className="mt-2 text-[13px] text-gray-600">
          Drop 1–{MAX_ARCHIVES} HCU (<code className="font-mono text-[12px]">ctm_data_collector</code>
          ) archives — typically one per collected host.{' '}
          <span className="font-mono text-[12px]">.zip</span> (Windows) or{' '}
          <span className="font-mono text-[12px]">.tar.gz</span> /{' '}
          <span className="font-mono text-[12px]">.tgz</span> /{' '}
          <span className="font-mono text-[12px]">.tar</span> (UNIX). Parsing runs in this browser;
          no archive is uploaded anywhere.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={`mt-4 rounded-card border-2 border-dashed p-8 text-center transition-colors ${
            dragging ? 'border-primary bg-primary-soft' : 'border-gray-300 bg-gray-50'
          }`}
        >
          <UploadCloud size={28} className="mx-auto text-gray-400" />
          <p className="mt-2 text-[13px] font-medium text-gray-700">
            Drag HCU archives here, or
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,.tar,.tar.gz,.tgz,application/zip,application/gzip,application/x-tar"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="mt-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
          >
            Choose archive files…
          </button>
        </div>

        {staged.length > 0 && (
          <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
            {staged.map((s) => (
              <li key={s.file.name} className="flex items-center gap-3 px-3 py-2">
                <FileArchive size={14} className="shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-gray-800">
                  {s.file.name}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-gray-400">
                  {formatBytes(s.file.size)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${s.file.name}`}
                  onClick={() => {
                    setStaged((prev) => prev.filter((p) => p.file.name !== s.file.name));
                    setResult(null);
                  }}
                  className="shrink-0 text-gray-400 hover:text-risk-blocker"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{error}</p>
        )}

        <button
          type="button"
          onClick={runParse}
          disabled={staged.length === 0 || busy}
          className={`mt-4 flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold ${
            staged.length === 0 || busy
              ? 'cursor-not-allowed bg-gray-100 text-gray-400'
              : 'bg-primary text-white hover:bg-primary-hover'
          }`}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy ? 'Parsing…' : `Parse ${staged.length || ''} archive${staged.length === 1 ? '' : 's'}`}
        </button>
      </section>

      {result && <ParseSummary result={result} onContinue={() => router.push('/facts')} />}

      {result && (
        <Diagnostics
          result={result}
          open={showDiagnostics}
          onToggle={() => setShowDiagnostics((v) => !v)}
        />
      )}
    </div>
  );
}

function ParseSummary({ result, onContinue }: { result: ParseResult; onContinue: () => void }) {
  const s = result.summary;
  return (
    <section className="card p-6">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={16} className="text-risk-clear" />
        <h2 className="text-[15px] font-bold text-gray-900">Parsed</h2>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Facts" value={s.facts_total} />
        <Stat label="Exact" value={s.exact} />
        <Stat label="To confirm" value={s.inferred_confirm} tone={s.inferred_confirm > 0 ? 'warn' : undefined} />
        <Stat label="Gaps" value={s.gaps_total} />
      </div>

      <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
        {result.meta.archives.map((a) => (
          <li key={a.file} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12px]">
            <span className="font-mono text-gray-800">{a.file}</span>
            <span className="rounded bg-primary-soft px-1.5 py-0.5 font-medium text-primary-dark">
              {a.product}
            </span>
            {a.host && <span className="font-mono text-gray-500">{a.host}</span>}
            <span
              className={`ml-auto font-medium ${
                a.collector_log_ok ? 'text-risk-clear' : 'text-risk-warning'
              }`}
            >
              {a.collector_log_ok ? 'collection OK' : 'collection not confirmed'}
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onContinue}
        className="mt-4 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover"
      >
        Continue to Facts Review
      </button>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <p
        className={`font-mono text-[22px] font-bold leading-tight ${
          tone === 'warn' ? 'text-risk-warning' : 'text-primary'
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] font-medium text-gray-600">{label}</p>
    </div>
  );
}

function Diagnostics({
  result,
  open,
  onToggle,
}: {
  result: ParseResult;
  open: boolean;
  onToggle: () => void;
}) {
  const warnings = result.warnings;
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50"
      >
        {warnings.length > 0 ? (
          <AlertTriangle size={15} className="text-risk-warning" />
        ) : (
          <CheckCircle2 size={15} className="text-risk-clear" />
        )}
        <span className="flex-1 text-[13px] font-semibold text-gray-900">
          Diagnostics
          <span className="ml-2 font-mono text-[11px] font-normal text-gray-500">
            {warnings.length} warning{warnings.length === 1 ? '' : 's'}
          </span>
        </span>
        <ChevronDown
          size={15}
          className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4">
          {warnings.length === 0 ? (
            <p className="text-[12px] text-gray-600">
              Every extractor ran cleanly and both collector logs report a completed collection.
            </p>
          ) : (
            <ul className="space-y-2">
              {warnings.map((w, i) => (
                <li
                  key={`${w.file}-${w.extractor}-${i}`}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
                >
                  <span className="font-mono text-[11px] font-semibold">
                    {w.file} · {w.extractor}
                  </span>
                  <p className="mt-0.5">{w.message}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-3">
            {result.diagnostics.map((d) => (
              <div key={d.file} className="rounded-lg border border-gray-200 p-3">
                <p className="font-mono text-[12px] font-semibold text-gray-800">{d.file}</p>
                <p className="mt-0.5 text-[11px] text-gray-600">
                  {d.format} · {d.product} · {d.memberCount} members · {d.extractorsRun} extractors ·{' '}
                  {d.collectorOk === null
                    ? 'no collector log'
                    : d.collectorOk
                      ? 'collection completed'
                      : 'collection FAILED — absent values are UNCOLLECTED, not missing'}
                </p>
                {d.sections.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.sections.map((s) => (
                      <span
                        key={s.section}
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                          s.ok
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 font-semibold text-red-700'
                        }`}
                      >
                        {s.section} {s.ok ? 'OK' : 'UNCOLLECTED'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
