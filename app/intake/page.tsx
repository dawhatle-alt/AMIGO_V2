import { MilestoneStub } from '@/components/ui/MilestoneStub';

export default function IntakePage() {
  return (
    <MilestoneStub
      screen="S2 Intake"
      milestone="M1"
      title="Archive Intake"
      scope={[
        'Drag-drop 1–3 HCU .zip archives, unzipped client-side with fflate',
        'Product detection (EM / Server / Agent) by directory signature',
        'Collector-log precheck — failed sections yield UNCOLLECTED, not MISSING',
        'X01–X27 extractor port producing facts + gaps',
        'Collapsible diagnostics panel for per-extractor warnings',
      ]}
    />
  );
}
