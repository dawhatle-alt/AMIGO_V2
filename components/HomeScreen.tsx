'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus2, FolderOpen, History } from 'lucide-react';
import { useCaseStore } from '@/lib/store/caseStore';
import { CaseFileError } from '@/lib/case/serialize';
import { loadRecentCases } from '@/lib/store/persist';
import type { TargetVersion } from '@/lib/types/case';

/** S1 Home (PRD §6): new case / open case file / recent cases. */
export function HomeScreen() {
  const router = useRouter();
  const doc = useCaseStore((s) => s.doc);
  const newCase = useCaseStore((s) => s.newCase);
  const openCaseFromText = useCaseStore((s) => s.openCaseFromText);

  const [name, setName] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [target, setTarget] = useState<TargetVersion>('9.0.22');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recent = loadRecentCases();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give the case a name (customer or case number).');
      return;
    }
    setError(null);
    newCase({ name, case_number: caseNumber, target_version: target });
    router.push('/intake');
  }

  async function handleFile(file: File) {
    setError(null);
    try {
      openCaseFromText(await file.text(), file.name);
    } catch (err) {
      setError(err instanceof CaseFileError ? err.message : 'Could not read that file.');
    }
  }

  return (
    <div className="space-y-4">
      {doc && (
        <section className="card border-primary-border bg-primary-soft p-5">
          <p className="text-[13px] font-semibold text-primary-dark">Case open</p>
          <p className="mt-1 text-[15px] font-bold text-gray-900">
            {doc.case.name}
            {doc.case.case_number && (
              <span className="ml-2 font-mono text-[12px] font-normal text-gray-500">
                #{doc.case.case_number}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[12px] text-gray-600">
            Target {doc.case.target_version} · {doc.archives.length} archive
            {doc.archives.length === 1 ? '' : 's'} · {Object.keys(doc.facts).length} facts ·{' '}
            {doc.gaps.length} gaps · {doc.activity_log.length} activity entries
          </p>
          <p className="mt-1 font-mono text-[11px] text-gray-500">
            created {doc.case.created_at} · updated {doc.case.updated_at}
          </p>
          <button
            type="button"
            onClick={() => router.push('/intake')}
            className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-white hover:bg-primary-hover"
          >
            Continue to Intake
          </button>
        </section>
      )}

      <section className="card p-6">
        <div className="flex items-center gap-2">
          <FilePlus2 size={16} className="text-primary" />
          <h2 className="text-[15px] font-bold text-gray-900">New case</h2>
        </div>
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="sm:col-span-2 block">
            <span className="mb-1 block text-[12px] font-semibold text-gray-700">
              Customer / case name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AZAMA79 upgrade review"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-primary focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-gray-700">Case number</span>
            <input
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              placeholder="optional"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-[13px] focus:border-primary focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-gray-700">
              Target version
            </span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as TargetVersion)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:border-primary focus:outline-none"
            >
              <option value="9.0.22">9.0.22</option>
              <option value="9.0.21">9.0.21</option>
            </select>
          </label>
          <div className="flex items-end sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover"
            >
              Create case
            </button>
          </div>
        </form>
        {error && <p className="mt-3 text-[12px] text-risk-blocker">{error}</p>}
        {doc && (
          <p className="mt-3 text-[12px] text-gray-500">
            Creating a new case replaces the one currently open — save its case file first.
          </p>
        )}
      </section>

      <section className="card p-6">
        <div className="flex items-center gap-2">
          <FolderOpen size={16} className="text-primary" />
          <h2 className="text-[15px] font-bold text-gray-900">Open a case file</h2>
        </div>
        <p className="mt-2 text-[13px] text-gray-600">
          Load a previously saved <code className="font-mono text-[12px]">case.json</code> — facts,
          confirmations, answers, plan, runbook and audit trail come back exactly as saved.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
        >
          Choose case.json…
        </button>
      </section>

      {recent.length > 0 && (
        <section className="card p-6">
          <div className="flex items-center gap-2">
            <History size={16} className="text-primary" />
            <h2 className="text-[15px] font-bold text-gray-900">Recent</h2>
          </div>
          <ul className="mt-3 divide-y divide-gray-100">
            {recent.map((r) => (
              <li key={r.id} className="flex items-baseline gap-2 py-2 text-[13px]">
                <span className="font-medium text-gray-800">{r.name}</span>
                {r.case_number && (
                  <span className="font-mono text-[11px] text-gray-500">#{r.case_number}</span>
                )}
                <span className="ml-auto font-mono text-[11px] text-gray-400">{r.updated_at}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-gray-500">
            Recents are a local index only — the browser keeps just the most recent case in full.
            Open its case file to restore any other.
          </p>
        </section>
      )}
    </div>
  );
}
