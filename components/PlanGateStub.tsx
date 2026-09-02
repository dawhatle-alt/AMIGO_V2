'use client';

import { AlertOctagon, Lock, ShieldCheck } from 'lucide-react';
import { useCaseStore } from '@/lib/store/caseStore';
import { planGenerationBlockers } from '@/lib/rules/risk';
import { MilestoneStub } from '@/components/ui/MilestoneStub';

/**
 * S5 Upgrade Plan — still a milestone stub (M5), but the FR-10 gate is live
 * from M2 so the block is visible where generation will actually happen.
 */
export function PlanGateStub() {
  const doc = useCaseStore((s) => s.doc);
  const blockers = doc ? planGenerationBlockers(doc) : [];
  const hasFacts = doc ? Object.keys(doc.facts).length > 0 : false;

  return (
    <div className="space-y-4">
      {hasFacts &&
        (blockers.length > 0 ? (
          <section className="card border-l-4 border-l-risk-blocker bg-red-50/40 p-4">
            <div className="flex items-start gap-2.5">
              <Lock size={16} className="mt-0.5 shrink-0 text-risk-blocker" />
              <div>
                <p className="text-[13px] font-semibold text-gray-900">
                  Plan generation blocked — {blockers.length} blocker
                  {blockers.length === 1 ? '' : 's'} outstanding
                </p>
                <ul className="mt-2 space-y-1">
                  {blockers.map((b) => (
                    <li key={b.id} className="flex items-start gap-1.5 text-[12px] text-gray-700">
                      <AlertOctagon size={12} className="mt-0.5 shrink-0 text-risk-blocker" />
                      {b.title}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-gray-600">
                  Resolve these on the Facts Review screen.
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section className="card border-l-4 border-l-risk-clear bg-emerald-50/40 p-4">
            <div className="flex items-start gap-2.5">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-risk-clear" />
              <p className="text-[13px] text-gray-800">
                <span className="font-semibold text-gray-900">Ready to generate.</span> No blockers
                outstanding — plan generation itself arrives at M5.
              </p>
            </div>
          </section>
        ))}

      <MilestoneStub
        screen="S5 Upgrade Plan"
        milestone="M5"
        title="Upgrade Plan"
        scope={[
          'Eight sections from Environment Summary through Post-Upgrade Tasks',
          'Status cycle todo → done → n/a, risk badges, command blocks, refs',
          'Deterministic tailoring: OS-correct and DB-correct syntax, topology-correct sequence',
          'Auto-filled items carry a provenance note back to the fact or gap',
        ]}
      />
    </div>
  );
}
