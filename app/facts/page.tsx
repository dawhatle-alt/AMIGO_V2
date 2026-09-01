import { MilestoneStub } from '@/components/ui/MilestoneStub';

export default function FactsPage() {
  return (
    <MilestoneStub
      screen="S3 Facts Review"
      milestone="M2"
      title="Facts Review &amp; Confirmation"
      scope={[
        'Facts table grouped by domain with confidence badges and source paths',
        'INFERRED facts as Confirm / Correct cards — plan generation blocked until resolved',
        'Risk-flag banners (version path, Compatibility Mode, KA 000419757, unavailable agents)',
      ]}
    />
  );
}
