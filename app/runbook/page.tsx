import { MilestoneStub } from '@/components/ui/MilestoneStub';

export default function RunbookPage() {
  return (
    <MilestoneStub
      screen="S6 Runbook"
      milestone="M6"
      title="Execution Runbook"
      scope={[
        'Phases A–G with sequential locking and per-step timestamps',
        'Gate 0 blockers, Gate 1 GO/NO-GO starting the outage clock, PONR confirmation, Gate 2',
        'Window countdown from the answered downtime-window gap, over-budget warning',
        'Always-visible rollback panel with DB-correct restore syntax',
      ]}
    />
  );
}
