import type { Answer, CaseDocument, Confirmation, TargetVersion } from '@/lib/types/case';
import { SCHEMA_VERSION } from '@/lib/types/case';
import { buildPlanEnv } from '@/lib/plan/env';

/**
 * amigo-wizard-answers.json (PRD FR-24d): the TSA's confirmations and gap
 * answers only — no facts, plan or runbook. The `confirmations` / `answers`
 * blocks use the case.json shapes (PRD §7.1) so the skill or another AMIGO
 * instance can merge them back losslessly; the `environment` header matches
 * the gap wizard's export (reference/make_gap_wizard.py) so a reader can
 * tell which environment the answers belong to.
 */

export const WIZARD_ANSWERS_FILE = 'amigo-wizard-answers.json';

export interface WizardAnswers {
  format: 'amigo-wizard-answers';
  schema_version: string;
  exported_at: string;
  source: 'AMIGO Concierge';
  case: { name: string; case_number: string; target_version: TargetVersion };
  environment: {
    em_host: string | null;
    server_host: string | null;
    em_version: string | null;
    server_version: string | null;
  };
  confirmations: Record<string, Confirmation>;
  answers: Record<string, Answer>;
}

export function buildWizardAnswers(doc: CaseDocument, now: Date = new Date()): WizardAnswers {
  const env = buildPlanEnv(doc);
  return {
    format: 'amigo-wizard-answers',
    schema_version: SCHEMA_VERSION,
    exported_at: now.toISOString(),
    source: 'AMIGO Concierge',
    case: { name: doc.case.name, case_number: doc.case.case_number, target_version: doc.case.target_version },
    environment: {
      em_host: env.em.present ? env.em.host : null,
      server_host: env.server.present ? env.server.host : null,
      em_version: env.em.present ? env.em.version : null,
      server_version: env.server.present ? env.server.version : null,
    },
    confirmations: structuredClone(doc.confirmations),
    answers: structuredClone(doc.answers),
  };
}

export function serializeWizardAnswers(doc: CaseDocument, now: Date = new Date()): string {
  return JSON.stringify(buildWizardAnswers(doc, now), null, 2);
}
