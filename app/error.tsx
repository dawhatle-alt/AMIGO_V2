'use client';

import { useEffect } from 'react';
import { AlertOctagon, RefreshCw, Save } from 'lucide-react';
import { useCaseStore } from '@/lib/store/caseStore';

/**
 * Route error boundary (M8 hardening). A crash in one screen keeps the header,
 * nav and case: the TSA can save the case file, retry the screen, or reload.
 */
export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const doc = useCaseStore((s) => s.doc);
  const saveCaseToFile = useCaseStore((s) => s.saveCaseToFile);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section role="alert" className="card border-red-200 p-6">
      <div className="flex items-start gap-3">
        <AlertOctagon size={20} className="mt-0.5 shrink-0 text-risk-blocker" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold text-gray-900">This screen hit an error</h1>
          <p className="mt-1 text-[13px] text-gray-600">
            The rest of AMIGO Concierge is unaffected and the case is still autosaved in this browser.
            Save the case file to keep a copy, then try the screen again.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-50 p-3 font-mono text-[11px] text-gray-700">
            {error.message || String(error)}
            {error.digest ? `\n(digest ${error.digest})` : ''}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-primary-hover"
            >
              <RefreshCw size={13} /> Try again
            </button>
            {doc && (
              <button
                type="button"
                onClick={saveCaseToFile}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
              >
                <Save size={13} /> Save case file
              </button>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
            >
              Reload the app
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
