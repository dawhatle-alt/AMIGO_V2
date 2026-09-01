import { MilestoneStub } from '@/components/ui/MilestoneStub';

export default function PlanPage() {
  return (
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
  );
}
