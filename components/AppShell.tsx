'use client';

import { useEffect } from 'react';
import { Header } from '@/components/Header';
import { ScreenNav } from '@/components/ScreenNav';
import { AgentPanel } from '@/components/AgentPanel';
import { useCaseStore } from '@/lib/store/caseStore';

/**
 * Application shell (PRD §6): header, screen nav, content column, and the
 * persistent collapsible agent rail on every screen.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrate = useCaseStore((s) => s.hydrate);
  const hydrated = useCaseStore((s) => s.hydrated);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <ScreenNav />
          <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
            {hydrated ? children : <div className="py-16 text-center text-sm text-gray-400">Loading…</div>}
          </main>
          <footer className="px-4 py-4 text-center text-[11px] text-gray-400">
            AMIGO Concierge · Phase 1 (local, file-based) · case data stays in this browser
            except AI agent calls
          </footer>
        </div>
        <AgentPanel />
      </div>
    </div>
  );
}
