import { SCHEMA_VERSION, type CaseDocument } from '@/lib/types/case';
import { caseSlug } from '@/lib/case/emptyCase';
import { downloadText } from '@/lib/export/download';

/**
 * Case-file round-trip (PRD FR-1). Save writes the whole document; open parses
 * and validates it. Validation is structural only — it never repairs or invents
 * data, it reports what is wrong.
 */

export class CaseFileError extends Error {}

/** Validate a parsed JSON blob as a CaseDocument. Throws CaseFileError. */
export function parseCaseFile(text: string): CaseDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CaseFileError('Not valid JSON — is this an AMIGO case file?');
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CaseFileError('Case file must be a JSON object.');
  }

  const doc = raw as Partial<CaseDocument>;

  if (typeof doc.schema_version !== 'string') {
    throw new CaseFileError('Missing "schema_version" — this is not an AMIGO case file.');
  }
  if (doc.schema_version !== SCHEMA_VERSION) {
    throw new CaseFileError(
      `Case file schema ${doc.schema_version} does not match this build (${SCHEMA_VERSION}).`,
    );
  }
  if (typeof doc.case !== 'object' || doc.case === null || typeof doc.case.name !== 'string') {
    throw new CaseFileError('Missing or malformed "case" block.');
  }

  const required: (keyof CaseDocument)[] = [
    'archives',
    'facts',
    'confirmations',
    'gaps',
    'answers',
    'plan',
    'runbook',
    'chat_history',
    'activity_log',
  ];
  for (const key of required) {
    if (doc[key] === undefined) {
      throw new CaseFileError(`Case file is missing the "${key}" block.`);
    }
  }

  return doc as CaseDocument;
}

export function serializeCaseFile(doc: CaseDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function caseFileName(doc: CaseDocument): string {
  return `${caseSlug(doc)}-case.json`;
}

/** Browser-only: trigger a download of the case document. */
export function downloadCaseFile(doc: CaseDocument): void {
  downloadText(caseFileName(doc), serializeCaseFile(doc), 'application/json');
}
