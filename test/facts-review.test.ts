import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArchives } from '@/lib/parser';
import { createEmptyCase } from '@/lib/case/emptyCase';
import {
  domainFor,
  effectiveValue,
  groupFacts,
  pendingConfirmations,
} from '@/lib/facts/domains';
import { canGeneratePlan, dbFamily, evaluateRisks, planGenerationBlockers } from '@/lib/rules/risk';
import type { CaseDocument, TargetVersion } from '@/lib/types/case';

/**
 * M2 gate (PRD §10): the MS SQL inference requires confirmation, the
 * KA 000419757 banner appears for the fixture, and plan generation stays
 * blocked until the confirmations are done.
 */

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');

function fixtureCase(target: TargetVersion = '9.0.22'): CaseDocument {
  const doc = createEmptyCase({ name: 'M2 fixture', target_version: target });
  const parsed = parseArchives([
    {
      fileName: 'hcu_SBCMEM31W.zip',
      bytes: new Uint8Array(readFileSync(path.join(FIXTURES, 'hcu_SBCMEM31W.zip'))),
    },
    {
      fileName: 'hcu_SBCMSR01W.zip',
      bytes: new Uint8Array(readFileSync(path.join(FIXTURES, 'hcu_SBCMSR01W.zip'))),
    },
  ]);
  doc.archives = parsed.meta.archives;
  doc.facts = parsed.facts;
  doc.gaps = parsed.gaps;
  return doc;
}

function confirm(doc: CaseDocument, key: string): void {
  doc.confirmations[key] = { status: 'confirmed', corrected_value: null, ts: '2026-09-01T00:00:00Z' };
}

function correct(doc: CaseDocument, key: string, value: unknown): void {
  doc.confirmations[key] = { status: 'corrected', corrected_value: value, ts: '2026-09-01T00:00:00Z' };
}

describe('confirmation queue (FR-10)', () => {
  it('queues exactly the three INFERRED fixture facts, MS SQL among them', () => {
    const doc = fixtureCase();
    const keys = pendingConfirmations(doc).map((p) => p.key);
    expect(keys).toContain('db.type');
    // Order follows extractor emission order: the EM archive is parsed first,
    // then the Server archive (X05 db.type, then X27 server.av_monitoring).
    expect(keys).toEqual(['em.av_monitoring', 'db.type', 'server.av_monitoring']);
  });

  it('requires confirmation for the MS SQL by-elimination inference', () => {
    const doc = fixtureCase();
    expect(doc.facts['db.type']?.confidence).toBe('INFERRED');
    expect(String(doc.facts['db.type']?.value)).toContain('MS SQL');
    expect(pendingConfirmations(doc).some((p) => p.key === 'db.type')).toBe(true);

    confirm(doc, 'db.type');
    expect(pendingConfirmations(doc).some((p) => p.key === 'db.type')).toBe(false);
  });

  it('never queues EXACT or DERIVED facts', () => {
    const doc = fixtureCase();
    for (const row of pendingConfirmations(doc)) {
      expect(row.fact.confidence).toBe('INFERRED');
    }
  });

  it('keeps the extracted value intact when a fact is corrected (FR-10)', () => {
    const doc = fixtureCase();
    const extracted = doc.facts['db.type']?.value;
    correct(doc, 'db.type', 'Oracle 19c');

    expect(doc.facts['db.type']?.value).toBe(extracted); // facts are never overwritten
    expect(effectiveValue(doc, 'db.type')).toBe('Oracle 19c');
    expect(pendingConfirmations(doc)).toHaveLength(2);
  });
});

describe('plan generation gate (M2 acceptance)', () => {
  it('is blocked while any inferred value is unresolved', () => {
    const doc = fixtureCase();
    expect(canGeneratePlan(doc)).toBe(false);
    const blocker = planGenerationBlockers(doc).find((b) => b.id === 'confirmations_pending');
    expect(blocker?.title).toContain('3 inferred values');
  });

  it('stays blocked when only some confirmations are done', () => {
    const doc = fixtureCase();
    confirm(doc, 'db.type');
    expect(canGeneratePlan(doc)).toBe(false);
    expect(planGenerationBlockers(doc)[0]?.title).toContain('2 inferred values');
  });

  it('unblocks once every inferred value is confirmed or corrected', () => {
    const doc = fixtureCase();
    confirm(doc, 'db.type');
    confirm(doc, 'em.av_monitoring');
    correct(doc, 'server.av_monitoring', 'Microsoft Defender only');

    expect(pendingConfirmations(doc)).toHaveLength(0);
    expect(planGenerationBlockers(doc)).toEqual([]);
    expect(canGeneratePlan(doc)).toBe(true);
  });

  it('re-blocks if a confirmation is undone', () => {
    const doc = fixtureCase();
    confirm(doc, 'db.type');
    confirm(doc, 'em.av_monitoring');
    confirm(doc, 'server.av_monitoring');
    expect(canGeneratePlan(doc)).toBe(true);

    delete doc.confirmations['db.type'];
    expect(canGeneratePlan(doc)).toBe(false);
  });
});

describe('risk flags (FR-11)', () => {
  it('raises the KA 000419757 banner for the fixture, naming the agent', () => {
    const doc = fixtureCase();
    const flag = evaluateRisks(doc).find((f) => f.id === 'ka_000419757');
    expect(flag).toBeDefined();
    expect(flag?.risk).toBe('warning');
    expect(flag?.detail).toContain('appsrv02');
    expect(flag?.refs[0]?.label).toContain('KA 000419757');
  });

  it('raises the unavailable-agents banner for dbsrv01', () => {
    const doc = fixtureCase();
    const flag = evaluateRisks(doc).find((f) => f.id === 'agents_unavailable');
    expect(flag?.title).toContain('1 agent');
    expect(flag?.detail).toContain('dbsrv01');
  });

  it('raises the Compatibility Mode gate until the gap is answered', () => {
    const doc = fixtureCase();
    expect(evaluateRisks(doc).some((f) => f.id === 'compat_mode_gate')).toBe(true);

    doc.answers['compat_mode'] = { value: 'On, compatibility version 9.0.21.100', ts: '' };
    expect(evaluateRisks(doc).some((f) => f.id === 'compat_mode_gate')).toBe(false);
  });

  it('does NOT raise a version-path violation for a 9.0.21 source', () => {
    const doc = fixtureCase();
    expect(evaluateRisks(doc).some((f) => f.id.startsWith('version_path'))).toBe(false);
  });

  it('raises a blocker when the source is below the direct-upgrade minimum', () => {
    const doc = fixtureCase();
    doc.facts['em.version'] = {
      value: '9.0.18.200',
      confidence: 'EXACT',
      source: 'x',
      extractor: 'X02',
    };
    const flag = evaluateRisks(doc).find((f) => f.id === 'version_path_em');
    expect(flag?.risk).toBe('blocker');
    expect(flag?.title).toContain('9.0.18.200');
    expect(canGeneratePlan(doc)).toBe(false);
  });

  it('emits no PostgreSQL content for the MS SQL fixture (FR-22 precondition)', () => {
    const doc = fixtureCase();
    const text = JSON.stringify(evaluateRisks(doc));
    expect(text).not.toMatch(/postgres/i);
    expect(text).not.toMatch(/pg_dump/i);
  });

  it('reads the DB family from the identifier, not the by-elimination parenthetical', () => {
    // X05 emits "MS SQL (by elimination - no PostgreSQL/Oracle sections in archive)".
    // The parenthetical names what was RULED OUT; matching it would put PostgreSQL
    // steps into an MS SQL plan.
    expect(dbFamily('MS SQL (by elimination — no PostgreSQL/Oracle sections in archive)')).toBe(
      'mssql',
    );
    expect(dbFamily('PostgreSQL 11.5')).toBe('postgres');
    expect(dbFamily('Oracle')).toBe('oracle');
    expect(dbFamily(undefined)).toBe('unknown');
  });

  it('raises the PostgreSQL upgrade warning when the DB is corrected to PostgreSQL', () => {
    const doc = fixtureCase();
    correct(doc, 'db.type', 'PostgreSQL 11.5');
    const flag = evaluateRisks(doc).find((f) => f.id === 'postgres_upgrade');
    expect(flag?.detail).toContain('15.3');
  });

  it('does not flag disk space when the install drive has enough free', () => {
    const doc = fixtureCase();
    // em.home is D:\BMC\ControlM_EM and D: has 54 GB free.
    expect(evaluateRisks(doc).some((f) => f.id === 'disk_space_em')).toBe(false);
  });

  it('flags disk space against the install drive, not an unrelated volume', () => {
    const doc = fixtureCase();
    doc.facts['em.disk_free'] = {
      value: [
        { drive: 'C:', free_gb: 400 },
        { drive: 'D:', free_gb: 4 },
      ],
      confidence: 'EXACT',
      source: 'x',
      extractor: 'X12',
    };
    const flag = evaluateRisks(doc).find((f) => f.id === 'disk_space_em');
    expect(flag?.title).toContain('4 GB free on D:');
  });

  it('flags AIX end-of-support when the host OS is AIX', () => {
    const doc = fixtureCase();
    expect(evaluateRisks(doc).some((f) => f.id.startsWith('aix_eos'))).toBe(false);
    doc.facts['server.os_name'] = {
      value: 'AIX 7.2',
      confidence: 'EXACT',
      source: 'x',
      extractor: 'X04',
    };
    expect(evaluateRisks(doc).some((f) => f.id === 'aix_eos_server')).toBe(true);
  });

  it('re-evaluates rules against corrected values, not the extracted ones', () => {
    const doc = fixtureCase();
    correct(doc, 'agents_unavailable', []);
    expect(evaluateRisks(doc).some((f) => f.id === 'agents_unavailable')).toBe(false);
  });

  it('never links the dead EM/Server upgrade pages (url-reference.md)', () => {
    const doc = fixtureCase();
    const urls = evaluateRisks(doc).flatMap((f) => f.refs.map((r) => r.url));
    for (const url of urls) {
      expect(url).not.toContain('Control-M_EM_Upgrade.htm');
      expect(url).not.toContain('Control-M_Server_Upgrade.htm');
    }
  });

  it('marks every login-required link with the padlock', () => {
    const doc = fixtureCase();
    const refs = evaluateRisks(doc).flatMap((f) => f.refs);
    for (const ref of refs) {
      const needsLogin =
        ref.url.includes('documents.bmc.com') || ref.url.includes('selfservice.bmc.com');
      expect(ref.label.includes('🔒'), `${ref.label} -> ${ref.url}`).toBe(needsLogin);
    }
  });
});

describe('facts table grouping (FR-9)', () => {
  it('assigns every fixture fact to one of the six PRD domains', () => {
    const doc = fixtureCase();
    const groups = groupFacts(doc);
    const total = groups.reduce((n, g) => n + g.rows.length, 0);
    expect(total).toBe(Object.keys(doc.facts).length);
    for (const g of groups) {
      expect(['EM', 'Server', 'Topology', 'DB', 'Agents', 'Environment']).toContain(g.domain);
    }
  });

  it('routes host-level facts to Environment and hosts to Topology', () => {
    expect(domainFor('em.os_name')).toBe('Environment');
    expect(domainFor('server.disk_free')).toBe('Environment');
    expect(domainFor('em.av_monitoring')).toBe('Environment');
    expect(domainFor('em.host')).toBe('Topology');
    expect(domainFor('topology.em_server_same_host')).toBe('Topology');
    expect(domainFor('db.type')).toBe('DB');
    expect(domainFor('agents')).toBe('Agents');
    expect(domainFor('flags.ka_000419757')).toBe('Agents');
    expect(domainFor('em.version')).toBe('EM');
    expect(domainFor('server.newday_time')).toBe('Server');
  });

  it('surfaces confirmation state on the rows', () => {
    const doc = fixtureCase();
    correct(doc, 'db.type', 'Oracle 19c');
    const row = groupFacts(doc)
      .flatMap((g) => g.rows)
      .find((r) => r.key === 'db.type');
    expect(row?.corrected).toBe(true);
    expect(row?.correctedValue).toBe('Oracle 19c');
    expect(row?.fact.value).not.toBe('Oracle 19c');
  });
});
