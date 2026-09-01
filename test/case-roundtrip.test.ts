import { describe, expect, it } from 'vitest';
import { createEmptyCase, caseSlug } from '@/lib/case/emptyCase';
import { CaseFileError, parseCaseFile, serializeCaseFile } from '@/lib/case/serialize';
import { SCHEMA_VERSION } from '@/lib/types/case';

/** M0 gate evidence: an empty case can be created, saved and reopened losslessly. */
describe('empty case round-trip (M0)', () => {
  it('creates an empty case at the current schema version', () => {
    const doc = createEmptyCase({ name: 'AZAMA79 upgrade review', case_number: '00123456' });
    expect(doc.schema_version).toBe(SCHEMA_VERSION);
    expect(doc.case.name).toBe('AZAMA79 upgrade review');
    expect(doc.case.target_version).toBe('9.0.22');
    expect(doc.archives).toEqual([]);
    expect(doc.facts).toEqual({});
    expect(doc.gaps).toEqual([]);
    expect(doc.plan.items).toEqual([]);
    expect(doc.runbook.steps).toEqual([]);
  });

  it('opens a new case with the creation logged in the audit trail (FR-2)', () => {
    const doc = createEmptyCase({ name: 'Acme' });
    expect(doc.activity_log).toHaveLength(1);
    expect(doc.activity_log[0]?.action).toBe('case.created');
    expect(doc.activity_log[0]?.actor).toBe('TSA');
  });

  it('serialize → parse returns an identical document', () => {
    const doc = createEmptyCase({ name: 'Acme Corp', case_number: '42', target_version: '9.0.21' });
    const reopened = parseCaseFile(serializeCaseFile(doc));
    expect(reopened).toEqual(doc);
  });

  it('rejects non-JSON, wrong-schema and structurally incomplete files', () => {
    expect(() => parseCaseFile('not json')).toThrow(CaseFileError);
    expect(() => parseCaseFile('[]')).toThrow(CaseFileError);
    expect(() => parseCaseFile(JSON.stringify({ schema_version: '0.9' }))).toThrow(CaseFileError);

    const doc = createEmptyCase({ name: 'Acme' }) as unknown as Record<string, unknown>;
    delete doc.gaps;
    expect(() => parseCaseFile(JSON.stringify(doc))).toThrow(/missing the "gaps" block/);
  });

  it('derives a filename-safe slug', () => {
    expect(caseSlug(createEmptyCase({ name: 'Acme Corp', case_number: '0042' }))).toBe(
      'acme-corp-0042',
    );
  });
});
