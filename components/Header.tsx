'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, FolderOpen, Save, ServerCog, X } from 'lucide-react';
import { useCaseStore } from '@/lib/store/caseStore';
import { CaseFileError } from '@/lib/case/serialize';

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const doc = useCaseStore((s) => s.doc);
  const lastSavedAt = useCaseStore((s) => s.lastSavedAt);
  const autosaveOk = useCaseStore((s) => s.autosaveOk);
  const openCaseFromText = useCaseStore((s) => s.openCaseFromText);
  const saveCaseToFile = useCaseStore((s) => s.saveCaseToFile);
  const closeCase = useCaseStore((s) => s.closeCase);

  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // A stale file error must not follow the TSA to the next screen.
  useEffect(() => {
    setError(null);
  }, [pathname]);

  async function handleFile(file: File) {
    setError(null);
    try {
      openCaseFromText(await file.text(), file.name);
      router.push('/');
    } catch (e) {
      setError(e instanceof CaseFileError ? e.message : 'Could not read that file.');
    }
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary text-white">
            <ServerCog size={20} />
          </span>
          <span>
            <span className="block text-[15px] font-bold leading-tight text-gray-900">
              AMIGO Concierge
            </span>
            <span className="block text-[12px] leading-tight text-gray-500">
              HCU-driven upgrade planning for Control-M
            </span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {doc && (
            <div className="mr-2 hidden text-right sm:block">
              <p className="text-[13px] font-semibold leading-tight text-gray-900">
                {doc.case.name}
                {doc.case.case_number && (
                  <span className="ml-1 font-mono text-[11px] font-normal text-gray-500">
                    #{doc.case.case_number}
                  </span>
                )}
              </p>
              <p className="text-[11px] leading-tight text-gray-500">
                Target {doc.case.target_version}
                {lastSavedAt && ' · autosaved'}
              </p>
            </div>
          )}

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
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <FolderOpen size={14} /> Open case file
          </button>

          {doc && (
            <>
              <button
                type="button"
                onClick={saveCaseToFile}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-white hover:bg-primary-hover"
              >
                <Save size={14} /> Save case file
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm('Close this case? The browser autosave slot is cleared — save the case file first if you have not.')) return;
                  closeCase();
                  router.push('/');
                }}
                title="Close case (clears the autosave slot — save the file first)"
                aria-label="Close case"
                className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              >
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-center gap-3 border-t border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="rounded p-0.5 hover:bg-red-100">
            <X size={13} />
          </button>
        </div>
      )}
      {doc && !autosaveOk && (
        <div role="alert" className="flex items-center justify-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-800">
          <AlertTriangle size={13} className="shrink-0" />
          Autosave is unavailable in this browser (storage full or blocked) — use Save case file to keep your work.
        </div>
      )}
    </header>
  );
}
