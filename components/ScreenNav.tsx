'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCaseStore } from '@/lib/store/caseStore';

/** Screens S1–S6 (PRD §6). Everything past Home needs an open case. */
const SCREENS = [
  { href: '/', label: 'Home', code: 'S1', needsCase: false },
  { href: '/intake', label: 'Intake', code: 'S2', needsCase: true },
  { href: '/facts', label: 'Facts Review', code: 'S3', needsCase: true },
  { href: '/gaps', label: 'Gap Walkthrough', code: 'S4', needsCase: true },
  { href: '/plan', label: 'Upgrade Plan', code: 'S5', needsCase: true },
  { href: '/runbook', label: 'Runbook', code: 'S6', needsCase: true },
] as const;

export function ScreenNav() {
  const pathname = usePathname();
  const hasCase = useCaseStore((s) => s.doc !== null);

  return (
    <nav aria-label="Screens" className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-4xl gap-1 overflow-x-auto px-4">
        {SCREENS.map((s) => {
          const active = pathname === s.href;
          const disabled = s.needsCase && !hasCase;
          const base =
            'whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors';

          if (disabled) {
            return (
              <span
                key={s.href}
                title="Create or open a case first"
                aria-disabled="true"
                className={`${base} cursor-not-allowed border-transparent text-gray-300`}
              >
                {s.label}
              </span>
            );
          }

          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? 'page' : undefined}
              className={`${base} ${
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
