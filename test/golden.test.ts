import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARSER_IMPLEMENTED } from '@/lib/parser';
import type { EnvironmentFacts } from '@/lib/types/case';

/**
 * M1 GOLDEN TEST (CLAUDE.md, PRD §10 M1 / §11).
 *
 * The TypeScript parser port must parse fixtures/hcu_SBCMEM31W.zip +
 * fixtures/hcu_SBCMSR01W.zip and diff clean against fixtures/facts.reference.json
 * (ignoring meta.generated_at).
 *
 * The parser does not exist at M0, so the diff is skipped until M1 — but the
 * suite still asserts the golden reference itself is present and well-formed,
 * so `npm test` is meaningful from M0 onward and fails loudly if the contract
 * file is lost or mangled.
 */

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');

function loadReference(): EnvironmentFacts {
  return JSON.parse(
    readFileSync(path.join(FIXTURES, 'facts.reference.json'), 'utf8'),
  ) as EnvironmentFacts;
}

describe('golden reference (schema contract)', () => {
  const ref = loadReference();

  it('has the four top-level blocks the schema contract requires', () => {
    expect(Object.keys(ref).sort()).toEqual(['facts', 'gaps', 'meta', 'summary']);
  });

  it('declares both fixture archives with a clean collector log', () => {
    expect(ref.meta.archives.map((a) => a.file).sort()).toEqual([
      'hcu_SBCMEM31W.zip',
      'hcu_SBCMSR01W.zip',
    ]);
    expect(ref.meta.archives.every((a) => a.collector_log_ok)).toBe(true);
  });

  it('every fact carries value, confidence, source and extractor (FR-7)', () => {
    for (const [key, fact] of Object.entries(ref.facts)) {
      expect(fact, key).toHaveProperty('value');
      expect(['EXACT', 'DERIVED', 'INFERRED'], key).toContain(fact.confidence);
      expect(typeof fact.source, key).toBe('string');
      expect(fact.extractor, key).toMatch(/^X\d{2}$/);
    }
  });

  it('every gap carries id, question, why and a known state (FR-12)', () => {
    for (const gap of ref.gaps) {
      expect(typeof gap.id).toBe('string');
      expect(gap.question.length).toBeGreaterThan(0);
      expect(gap.why.length).toBeGreaterThan(0);
      expect(['run-command', 'console', 'interview']).toContain(gap.state);
    }
  });

  it('summary counts agree with the facts and gaps blocks', () => {
    const facts = Object.values(ref.facts);
    expect(ref.summary.facts_total).toBe(facts.length);
    expect(ref.summary.exact).toBe(facts.filter((f) => f.confidence === 'EXACT').length);
    expect(ref.summary.derived).toBe(facts.filter((f) => f.confidence === 'DERIVED').length);
    expect(ref.summary.inferred_confirm).toBe(
      facts.filter((f) => f.confidence === 'INFERRED').length,
    );
    expect(ref.summary.gaps_total).toBe(ref.gaps.length);
  });
});

describe.skipIf(!PARSER_IMPLEMENTED)('M1 gate — parser port vs golden reference', () => {
  it('parses both fixture archives to output matching facts.reference.json', () => {
    throw new Error('M1: implement the TS extractor port, then wire this diff.');
  });
});
