/**
 * case.json — the single source of truth for a case (PRD §7.1).
 *
 * SCHEMA IS A CONTRACT (CLAUDE.md). The `facts` and `gaps` shapes below are
 * identical to the Python reference parser's `environment_facts.json`
 * (fixtures/facts.reference.json) so the skill, this app and a future Hermes
 * agent interoperate. Any change here requires bumping SCHEMA_VERSION, updating
 * reference/amigo_prefill.py to match, and calling it out at the milestone gate.
 */

export const SCHEMA_VERSION = '1.0';

export type Confidence = 'EXACT' | 'DERIVED' | 'INFERRED';
export type Product = 'EM' | 'Server' | 'Agent';
export type TargetVersion = '9.0.21' | '9.0.22';

/** A reference link. `label` carries the 🔒 marker when login is required. */
export interface Ref {
  label: string;
  url: string;
}

/** One extracted environment fact with provenance (PRD FR-7). */
export interface Fact {
  value: unknown;
  confidence: Confidence;
  source: string;
  extractor: string;
  raw?: string;
}

export interface ArchiveRecord {
  file: string;
  product: Product;
  host: string;
  collector_log_ok: boolean;
}

export interface Confirmation {
  status: 'confirmed' | 'corrected';
  corrected_value: unknown | null;
  ts: string;
}

export type GapState = 'run-command' | 'console' | 'interview';

/** A question the archive could not answer (PRD FR-12). */
export interface Gap {
  id: string;
  question: string;
  why: string;
  state: GapState;
  command?: string;
  console?: string;
  refs?: Ref[];
}

export interface Answer {
  value: string;
  ts: string;
}

export type PlanItemStatus = 'todo' | 'done' | 'na';
export type Risk = 'blocker' | 'warning' | 'clear';

export interface PlanItem {
  id: string;
  section: string;
  text: string;
  status: PlanItemStatus;
  risk: Risk;
  detail: string;
  cmd: string;
  refs: Ref[];
  /** Fact key or gap id this item was auto-populated from (provenance note). */
  autofilled_from: string | null;
}

export interface Plan {
  generated_at: string;
  items: PlanItem[];
}

export type RunbookPhase = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export type RunbookStepType = 'step' | 'gate' | 'ponr';
export type RunbookStepStatus = 'pending' | 'active' | 'done' | 'na';

export interface RunbookStep {
  id: string;
  phase: RunbookPhase;
  type: RunbookStepType;
  title: string;
  est_min: number;
  status: RunbookStepStatus;
  started_at: string | null;
  completed_at: string | null;
}

export interface Runbook {
  steps: RunbookStep[];
  outage_started_at: string | null;
  window_minutes: number | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

/** Audit trail entry (PRD FR-2). */
export interface ActivityEntry {
  ts: string;
  actor: 'TSA';
  action: string;
  detail: string;
}

export interface CaseMeta {
  name: string;
  case_number: string;
  target_version: TargetVersion;
  created_at: string;
  updated_at: string;
}

export interface CaseDocument {
  schema_version: string;
  case: CaseMeta;
  archives: ArchiveRecord[];
  facts: Record<string, Fact>;
  confirmations: Record<string, Confirmation>;
  gaps: Gap[];
  answers: Record<string, Answer>;
  plan: Plan;
  runbook: Runbook;
  chat_history: ChatMessage[];
  activity_log: ActivityEntry[];
}

/**
 * Parser output shape (fixtures/facts.reference.json). The M1 golden test diffs
 * the TypeScript port's output against the reference file field-for-field.
 */
export interface ParserMeta {
  parser_version: string;
  generated_at: string;
  archives: ArchiveRecord[];
}

export interface ParserSummary {
  facts_total: number;
  exact: number;
  derived: number;
  inferred_confirm: number;
  gaps_total: number;
}

export interface EnvironmentFacts {
  meta: ParserMeta;
  facts: Record<string, Fact>;
  gaps: Gap[];
  summary: ParserSummary;
}
