import { readFileSync } from 'node:fs';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { parseArchives } from '@/lib/parser';
import { createEmptyCase } from '@/lib/case/emptyCase';
import { reparseImpact } from '@/lib/case/reparse';
import { generatePlan } from '@/lib/plan/generate';
import { generateRunbook } from '@/lib/runbook/engine';
import { loadActiveCase, saveActiveCase } from '@/lib/store/persist';
import { useCaseStore } from '@/lib/store/caseStore';
import { APP_VERSION } from '@/lib/version';
import type { CaseDocument } from '@/lib/types/case';

/**
 * M8 hardening: intake never crashes on the wrong file, a re-parse warns
 * about what it resets, and a refused autosave is reported rather than
 * swallowed.
 */

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');
const read = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)));

describe('intake with the wrong file (FR-4 / FR-8)', () => {
  it('a zip that is not an HCU collection yields zero facts and a diagnostic, not a crash', () => {
    const bytes = zipSync({ 'notes/readme.txt': strToU8('hello'), 'photo.bin': new Uint8Array([1, 2, 3]) });
    const result = parseArchives([{ fileName: 'holiday.zip', bytes }]);
    expect(result.summary.facts_total).toBe(0);
    expect(result.warnings.some((w) => w.extractor === 'product-detect')).toBe(true);
    expect(result.diagnostics[0]?.extractorsRun).toBe(0);
  });

  it('bytes that are not an archive at all become a warning', () => {
    const result = parseArchives([{ fileName: 'report.pdf', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]) }]);
    expect(result.summary.facts_total).toBe(0);
    expect(result.warnings[0]?.extractor).toBe('archive');
    expect(result.warnings[0]?.message).toMatch(/could not open archive/);
  });

  it('a real fixture still parses alongside a bad file', () => {
    const result = parseArchives([
      { fileName: 'bad.zip', bytes: new Uint8Array([0, 1, 2]) },
      { fileName: 'hcu_SBCMSR01W.zip', bytes: read('hcu_SBCMSR01W.zip') },
    ]);
    expect(result.summary.facts_total).toBeGreaterThan(10);
    expect(result.meta.archives.map((a) => a.file)).toEqual(['hcu_SBCMSR01W.zip']);
  });
});

describe('re-parse impact (FR-1 / FR-2)', () => {
  it('is silent on a fresh case', () => {
    const doc = createEmptyCase({ name: 'x', target_version: '9.0.22' });
    expect(reparseImpact(doc)).toEqual({ items: [], message: '' });
  });

  it('names everything a second parse would reset', () => {
    const parsed = parseArchives([
      { fileName: 'hcu_SBCMEM31W.zip', bytes: read('hcu_SBCMEM31W.zip') },
      { fileName: 'hcu_SBCMSR01W.zip', bytes: read('hcu_SBCMSR01W.zip') },
    ]);
    const doc: CaseDocument = createEmptyCase({ name: 'AZAMA79', target_version: '9.0.22' });
    doc.facts = parsed.facts;
    doc.gaps = parsed.gaps;
    for (const key of ['db.type', 'em.av_monitoring', 'server.av_monitoring']) {
      doc.confirmations[key] = { status: 'confirmed', corrected_value: null, ts: 'ts' };
    }
    doc.answers['downtime_window'] = { value: '4 hours', ts: 'ts' };
    doc.plan = generatePlan(doc);
    doc.runbook = generateRunbook(doc);
    const gate0 = doc.runbook.steps[0];
    if (gate0) gate0.status = 'done';
    doc.runbook.outage_started_at = 'ts';
    const impact = reparseImpact(doc);
    expect(impact.items).toEqual([
      '3 confirmations',
      '1 gap answer',
      `the generated plan (${doc.plan.items.length} items)`,
      'runbook progress (1 step started or done)',
      'the outage clock',
    ]);
    expect(impact.message).toMatch(/^Parsing again replaces the facts and gaps and resets 3 confirmations, .* and the outage clock\./);
    expect(impact.message).toMatch(/Continue\?$/);
  });
});

describe('autosave failure is reported (FR-1)', () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
    useCaseStore.setState({ doc: null, hydrated: false, lastSavedAt: null, autosaveOk: true });
  });

  function fakeWindow(store: Record<string, string>, failing = false) {
    g.window = {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          if (failing) throw new Error('QuotaExceededError');
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
    };
  }

  it('saveActiveCase returns false when the browser refuses the write', () => {
    fakeWindow({}, true);
    expect(saveActiveCase(createEmptyCase({ name: 'x', target_version: '9.0.22' }))).toBe(false);
  });

  it('saveActiveCase round-trips when storage works', () => {
    const store: Record<string, string> = {};
    fakeWindow(store);
    const doc = createEmptyCase({ name: 'roundtrip', target_version: '9.0.21' });
    expect(saveActiveCase(doc)).toBe(true);
    expect(loadActiveCase()).toEqual(doc);
  });

  it('the store flags autosaveOk=false and keeps the case in memory', () => {
    fakeWindow({}, true);
    useCaseStore.getState().newCase({ name: 'quota', target_version: '9.0.22' });
    expect(useCaseStore.getState().autosaveOk).toBe(false);
    expect(useCaseStore.getState().doc?.case.name).toBe('quota');
    useCaseStore.getState().log('test.action', 'still recorded');
    expect(useCaseStore.getState().autosaveOk).toBe(false);
    expect(useCaseStore.getState().doc?.activity_log.at(-1)?.action).toBe('test.action');
  });

  it('recovers once storage accepts writes again', () => {
    const store: Record<string, string> = {};
    fakeWindow(store, true);
    useCaseStore.getState().newCase({ name: 'recover', target_version: '9.0.22' });
    expect(useCaseStore.getState().autosaveOk).toBe(false);
    fakeWindow(store, false);
    useCaseStore.getState().log('test.action', 'now saved');
    expect(useCaseStore.getState().autosaveOk).toBe(true);
    expect(store['amigo.active-case']).toContain('"recover"');
  });
});

describe('build metadata', () => {
  it('exposes the package version to the footer', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
