import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { PARSER_IMPLEMENTED, parseArchives } from '@/lib/parser';
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

function readArchive(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(FIXTURES, name)));
}

/** Builds a synthetic archive in memory for the negative-path tests. */
function buildArchive(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[name] = strToU8(content);
  }
  return zipSync(entries);
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

describe.skipIf(!PARSER_IMPLEMENTED)('M1 gate - parser port vs golden reference', () => {
  const ref = loadReference();
  const actual = parseArchives([
    { fileName: 'hcu_SBCMEM31W.zip', bytes: readArchive('hcu_SBCMEM31W.zip') },
    { fileName: 'hcu_SBCMSR01W.zip', bytes: readArchive('hcu_SBCMSR01W.zip') },
  ]);

  it('parses both fixture archives without a single warning', () => {
    expect(actual.warnings).toEqual([]);
  });

  it('produces meta.archives identical to the reference', () => {
    expect(actual.meta.archives).toEqual(ref.meta.archives);
    expect(actual.meta.parser_version).toBe(ref.meta.parser_version);
  });

  it('produces facts identical to the reference, field-for-field', () => {
    expect(actual.facts).toEqual(ref.facts);
  });

  it('emits facts in the same order as the reference', () => {
    expect(Object.keys(actual.facts)).toEqual(Object.keys(ref.facts));
  });

  it('produces gaps identical to the reference', () => {
    expect(stripUndefined(actual.gaps)).toEqual(ref.gaps);
  });

  it('produces the same summary counts', () => {
    expect(actual.summary).toEqual(ref.summary);
  });

  it('diffs clean as a whole document, ignoring meta.generated_at', () => {
    const strip = (d: EnvironmentFacts) => ({
      ...d,
      meta: { ...d.meta, generated_at: '<ignored>' },
    });
    const { warnings, diagnostics, ...doc } = actual;
    void warnings;
    void diagnostics;
    expect(strip(stripUndefined(doc))).toEqual(strip(ref));
  });
});

describe('collector-log precheck (FR-5)', () => {
  it('reports a clean collection for both fixtures', () => {
    const result = parseArchives([
      { fileName: 'hcu_SBCMEM31W.zip', bytes: readArchive('hcu_SBCMEM31W.zip') },
      { fileName: 'hcu_SBCMSR01W.zip', bytes: readArchive('hcu_SBCMSR01W.zip') },
    ]);
    expect(result.diagnostics.map((d) => d.collectorOk)).toEqual([true, true]);
    expect(result.diagnostics[0]?.sections).toEqual([
      { section: 'EM', ok: true },
      { section: 'check_config_results', ok: true },
      { section: 'OS', ok: true },
    ]);
  });

  it('marks sections of a FAILED collection UNCOLLECTED rather than missing', () => {
    const bytes = buildArchive({
      'EM/check_config_results/check_config_report_20260101000000.json':
        JSON.stringify({ version: '9.0.21.300', location: 'D:\\BMC' }),
      'OS/Network/Hostname.txt': 'TESTHOST\n',
      'hcu_logs/collector.log': [
        'INFO  ctm_data_collector started (product=EM)',
        'INFO  section check_config_results ... OK',
        'ERROR section OS ... FAILED',
        'ERROR Collection aborted',
      ].join('\n'),
    });
    const result = parseArchives([{ fileName: 'broken.zip', bytes }]);

    expect(result.diagnostics[0]?.collectorOk).toBe(false);
    expect(result.meta.archives[0]?.collector_log_ok).toBe(false);
    const warning = result.warnings.find((w) => w.extractor === 'collector-log');
    expect(warning?.message).toContain('UNCOLLECTED');
    expect(warning?.message).toContain('OS');
  });

  it('flags an archive with no collector log instead of assuming it is fine', () => {
    const bytes = buildArchive({ 'CNF_INFO/data/config.dat': 'GD_FORWARD Y\n' });
    const result = parseArchives([{ fileName: 'nolog.zip', bytes }]);
    expect(result.diagnostics[0]?.collectorOk).toBeNull();
    expect(
      result.warnings.some((w) => w.message.includes('collection integrity could not be verified')),
    ).toBe(true);
  });
});

describe('extractors never invent (CLAUDE.md)', () => {
  it('emits no facts at all for an unrecognised archive, and warns', () => {
    const bytes = buildArchive({ 'random/notes.txt': 'nothing to see' });
    const result = parseArchives([{ fileName: 'mystery.zip', bytes }]);
    expect(result.facts).toEqual({});
    expect(result.warnings.some((w) => w.extractor === 'product-detect')).toBe(true);
  });

  it('degrades to no fact - never a crash - on a malformed source file', () => {
    const bytes = buildArchive({
      'EM/check_config_results/check_config_report_20260101000000.json': '{ this is not json',
      'OS/Network/Hostname.txt': 'TESTHOST\n',
      'OS/Hardware/HardwareConfig.txt': 'garbage with no OS lines\n',
      'hcu_logs/collector.log': 'INFO Collection completed successfully\n',
    });
    const result = parseArchives([{ fileName: 'malformed.zip', bytes }]);

    // The broken extractor is isolated; the rest of the archive still parses.
    expect(result.warnings.some((w) => w.extractor === 'x02_check_config')).toBe(true);
    expect(result.facts['em.version']).toBeUndefined();
    expect(result.facts['em.os_name']).toBeUndefined();
    expect(result.facts['em.host']?.value).toBe('TESTHOST');
  });

  it('suffix-matches members when the archive carries a root folder prefix', () => {
    const bytes = buildArchive({
      'SBCMSR01W_2026/CNF_INFO/data/api_gateway_url.dat': 'https://HOSTX:8393/automation-api\n',
      'SBCMSR01W_2026/OS/Network/Hostname.txt': 'HOSTX\n',
      'SBCMSR01W_2026/hcu_logs/collector.log': 'INFO Collection completed successfully\n',
    });
    const result = parseArchives([{ fileName: 'prefixed.zip', bytes }]);
    expect(result.facts['server.apigtw_port']?.value).toBe('8393');
    expect(result.facts['server.host']?.value).toBe('HOSTX');
    expect(result.facts['server.apigtw_port']?.source).toBe(
      'prefixed.zip:SBCMSR01W_2026/CNF_INFO/data/api_gateway_url.dat',
    );
  });
});

/** Drops `undefined`-valued keys so optional TS fields compare against JSON. */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
