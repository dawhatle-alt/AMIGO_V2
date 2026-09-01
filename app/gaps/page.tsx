import { MilestoneStub } from '@/components/ui/MilestoneStub';

export default function GapsPage() {
  return (
    <MilestoneStub
      screen="S4 Gap Walkthrough"
      milestone="M3"
      title="Gap Walkthrough"
      scope={[
        'Ordered gap cards: question, why it matters, command / console path / refs',
        'Copy buttons on terminal blocks; answer capture with progress bar',
        'Decision gaps feed plan parameters (downtime window ⇒ runbook clock budget)',
        '“Ask agent about this gap” pre-fills the advisor (M4)',
      ]}
    />
  );
}
