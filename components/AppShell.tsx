'use client';

import { useEffect } from 'react';
import { Header } from '@/components/Header';
import { ScreenNav } from '@/components/ScreenNav';
import { AgentPanel } from '@/components/AgentPanel';
import { useCaseStore } from '@/lib/store/caseStore';
import { APP_VERSION } from '@/lib/version';
import { PARSER_VERSION } from '@/lib/parser';
import { RULES_VERSION } from '@/lib/rules/risk';

/**
 * Application shell (PRD §6): header, screen nav, content column, and the
 * persistent collapsible agent rail on every screen. A skip link and a
 * focusable <main> make keyboard navigation direct (M8 a11y pass).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrate = useCaseStore((s) => s.hydrate);
  const hydrated = useCaseStore((s) => s.hydrated);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-primary focus:shadow-lg"
      >
        Skip to content
      </a>
      <Header />
      <div className="flex flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <ScreenNav />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 outline-none">
            {hydrated ? (
              children
            ) : (
              <div role="status" aria-live="polite" className="py-16 text-center text-sm text-gray-500">
                Loading…
              </div>
            )}
          </main>
          <footer className="px-4 py-4 text-center text-[11px] text-gray-500">
            AMIGO Concierge v{APP_VERSION} · parser {PARSER_VERSION} · rules {RULES_VERSION} · Phase 1
            (local, file-based) · case data stays in this browser except AI agent calls
          </footer>
        </div>
        <AgentPanel />
      </div>
    </div>
  );
}
