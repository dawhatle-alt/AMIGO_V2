import { SCHEMA_VERSION, type CaseDocument, type TargetVersion } from '@/lib/types/case';

export interface NewCaseInput {
  name: string;
  case_number?: string;
  target_version?: TargetVersion;
}

/** A fresh, empty case document (PRD §7.1). */
export function createEmptyCase(input: NewCaseInput): CaseDocument {
  const now = new Date().toISOString();
  return {
    schema_version: SCHEMA_VERSION,
    case: {
      name: input.name.trim(),
      case_number: (input.case_number ?? '').trim(),
      target_version: input.target_version ?? '9.0.22',
      created_at: now,
      updated_at: now,
    },
    archives: [],
    facts: {},
    confirmations: {},
    gaps: [],
    answers: {},
    plan: { generated_at: '', items: [] },
    runbook: { steps: [], outage_started_at: null, window_minutes: null },
    chat_history: [],
    activity_log: [
      { ts: now, actor: 'TSA', action: 'case.created', detail: input.name.trim() },
    ],
  };
}

/** Filename-safe slug for downloads, e.g. "Acme Corp / 0042" -> "acme-corp-0042". */
export function caseSlug(doc: CaseDocument): string {
  const parts = [doc.case.name, doc.case.case_number].filter(Boolean).join('-');
  const slug = parts
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'amigo-case';
}
