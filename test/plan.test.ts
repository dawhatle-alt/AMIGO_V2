import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseArchives } from '@/lib/parser';
import { createEmptyCase } from '@/lib/case/emptyCase';
import { parseCaseFile, serializeCaseFile } from '@/lib/case/serialize';
import { useCaseStore } from '@/lib/store/caseStore';
import { generatePlan, mergePlan, planStats } from '@/lib/plan/generate';
import { buildPlanEnv, compareVersions } from '@/lib/plan/env';
import { SECTIONS, TEMPLATES } from '@/lib/plan/templates';
import type { CaseDocument, Plan } from '@/lib/types/case';

/**
 * M5 gate (PRD §10): the fixture produces a plan with zero PostgreSQL
 * content, robocopy / T-SQL syntax, and auto-Done items carrying provenance
 * notes. Plus the FR-22 tailoring rules on corrected variants of the same
 * case (UNIX + PostgreSQL, HA, co-hosted) and the URL rules.
 */

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');
const read = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)));

const PARSED = parseArchives([
  { fileName: 'hcu_SBCMEM31W.zip', bytes: read('hcu_SBCMEM31W.zip') },
  { fileName: 'hcu_SBCMSR01W.zip', bytes: read('hcu_SBCMSR01W.zip') },
]);

const TS = '2026-09-01T00:00:00Z';

/** Fixture case with the three INFERRED facts confirmed (plan generation prerequisite). */
function confirmedCase(): CaseDocument {
  const doc = createEmptyCase({ name: 'AZAMA79', target_version: '9.0.22' });
  // Clone: tests mutate facts (corrections, deletions) and must not leak into each other.
  doc.archives = structuredClone(PARSED.meta.archives);
  doc.facts = structuredClone(PARSED.facts);
  doc.gaps = structuredClone(PARSED.gaps);
  for (const key of ['db.type', 'em.av_monitoring', 'server.av_monitoring']) {
    doc.confirmations[key] = { status: 'confirmed', corrected_value: null, ts: TS };
  }
  return doc;
}

function correct(doc: CaseDocument, key: string, value: unknown): void {
  doc.confirmations[key] = { status: 'corrected', corrected_value: value, ts: TS };
}

function answer(doc: CaseDocument, id: string, value: string): void {
  doc.answers[id] = { value, ts: TS };
}

const allText = (plan: Plan): string =>
  plan.items.map((i) => `${i.text}\n${i.detail}\n${i.cmd}\n${i.refs.map((r) => r.label).join('\n')}`).join('\n');

describe('M5 gate — fixture plan (Windows + MS SQL, separate hosts)', () => {
  const doc = confirmedCase();
  const plan = generatePlan(doc, new Date(TS));
  const text = allText(plan);

  it('generates every FR-20 section in order', () => {
    const present = [...new Set(plan.items.map((i) => i.section))];
    expect(present).toEqual(SECTIONS.map((s) => s.id));
    expect(plan.generated_at).toBe(new Date(TS).toISOString());
    expect(plan.items.length).toBeGreaterThan(50);
  });

  it('contains zero PostgreSQL content', () => {
    // Plan content: text, detail (minus the provenance note, which quotes the
    // extracted value verbatim — "MS SQL (by elimination — no PostgreSQL/Oracle
    // sections in archive)"), commands and reference labels.
    const NOTE = '\n\nAuto-filled:';
    const content = plan.items
      .map((i) => [i.text, i.detail.split(NOTE)[0], i.cmd, ...i.refs.map((r) => r.label)].join('\n'))
      .join('\n');
    expect(content).not.toMatch(/postgres|pg_dump|pg_restore|psql/i);
    const notes = plan.items.map((i) => i.detail.split(NOTE)[1] ?? '').join('\n');
    expect(notes).toMatch(/no PostgreSQL\/Oracle sections in archive/); // the only mention: provenance
    expect(plan.items.find((i) => i.id === 'seq_em_pg')).toBeUndefined();
    expect(plan.items.find((i) => i.id === 'pt_pg_153')).toBeUndefined();
    expect(plan.items.find((i) => i.id === 'pe_pg_version')).toBeUndefined();
  });

  it('uses Windows and T-SQL syntax: robocopy, REM, setx, .bat, BACKUP DATABASE', () => {
    const cmds = plan.items.map((i) => i.cmd).filter(Boolean);
    expect(cmds.some((c) => /robocopy/.test(c))).toBe(true);
    expect(cmds.some((c) => /BACKUP DATABASE \[/.test(c))).toBe(true);
    expect(cmds.some((c) => /RESTORE DATABASE \[/.test(c))).toBe(true);
    expect(cmds.some((c) => /setx BMC_JAVA_HOME/.test(c))).toBe(true);
    expect(cmds.some((c) => /is_upgrade_ready\.bat/.test(c))).toBe(true);
    expect(cmds.some((c) => /checkReqRun\.bat/.test(c))).toBe(true);
    expect(cmds.some((c) => /^set BMC_INST_CTM_APIGTW_PORT=8393/m.test(c))).toBe(true);
    // No UNIX idioms anywhere in the commands.
    for (const c of cmds) {
      expect(c).not.toMatch(/^#/m);
      expect(c).not.toMatch(/\bexport\b|\btar -c|\.sh\b|stop_all|shut_ctm/);
    }
    for (const c of cmds) expect(c.split('\n').filter((l) => /^(REM|#)/.test(l)).every((l) => l.startsWith('REM'))).toBe(true);
  });

  it('marks archive-answered items Done with a provenance note', () => {
    const auto = plan.items.filter((i) => i.autofilled_from !== null && i.status === 'done');
    expect(auto.length).toBeGreaterThanOrEqual(8);
    for (const item of auto) {
      expect(item.detail).toMatch(/Auto-filled: /);
      expect(item.detail).toMatch(/\(from .+\)|answered:/);
    }
    const byId = Object.fromEntries(plan.items.map((i) => [i.id, i]));
    expect(byId['pe_disk']?.status).toBe('done');
    expect(byId['pe_disk']?.autofilled_from).toBe('em.disk_free');
    expect(byId['pe_disk']?.detail).toContain('hcu_SBCMEM31W.zip');
    expect(byId['ps_apigtw']?.status).toBe('done');
    expect(byId['ps_apigtw']?.autofilled_from).toBe('server.apigtw_port');
    expect(byId['pe_java']?.status).toBe('done');
    expect(byId['pe_java']?.detail).toContain('21.0.7');
    // Fixture EM 9.0.21.300 is LOWER than Server 9.0.21.302 — a genuine finding, not auto-done.
    expect(byId['ps_em_version']?.status).toBe('todo');
    expect(byId['ps_em_version']?.risk).toBe('warning');
    expect(byId['ps_em_version']?.detail).toMatch(/LOWER than Server 9\.0\.21\.302/);
    expect(byId['env_em']?.detail).toContain('SBCMEM31W');
    expect(byId['env_em']?.text).toContain('9.0.22');
  });

  it('pins rule risk flags and open decisions to Blockers & Risks', () => {
    const risks = plan.items.filter((i) => i.section === 'risks');
    const ids = risks.map((i) => i.id);
    expect(ids).toContain('risk_downtime');
    expect(ids).toContain('risk_fallback');
    expect(ids).toContain('risk_compat_mode_gate');
    expect(ids).toContain('risk_agents_unavailable');
    expect(ids).toContain('risk_ka_000419757');
    expect(risks.find((i) => i.id === 'risk_downtime')?.risk).toBe('blocker');
    expect(risks.find((i) => i.id === 'risk_ka_000419757')?.autofilled_from).toBe('flags.ka_000419757');
    expect(ids).not.toContain('risk_confirmations_pending');
  });

  it('suppresses N/A items instead of showing them', () => {
    const ids = plan.items.map((i) => i.id);
    expect(ids).not.toContain('ps_nfs'); // UNIX only
    expect(ids).not.toContain('pe_aix');
    expect(ids).not.toContain('pe_ha');
    expect(ids).not.toContain('seq_em_ha_stop');
    expect(ids).not.toContain('seq_stop_all'); // separate hosts → per-component stops
    expect(ids).toContain('seq_stop_em');
    expect(ids).toContain('seq_server_stop');
    expect(ids).not.toContain('ps_gd_forward'); // GD_FORWARD not set
    expect(ids).not.toContain('ps_ctmldnrs'); // not in use
    expect(ids).toContain('ps_ka419757');
    expect(ids).toContain('v_ai'); // AI job types present
    expect(ids).toContain('v_ldap');
    expect(plan.items.every((i) => i.status !== 'na')).toBe(true);
  });

  it('follows the URL rules: no dead pages, padlock on login-required links', () => {
    for (const item of plan.items) {
      for (const r of item.refs) {
        expect(r.url).not.toMatch(/Control-M_(EM|Server)_Upgrade\.htm/);
        if (/documents\.bmc\.com|selfservice\.bmc\.com/.test(r.url)) expect(r.label, r.url).toContain('🔒');
        else expect(r.label, r.url).not.toContain('🔒');
      }
    }
    expect(text).toContain('9.0.22.026');
    expect(text).toContain('9.0.22.025');
  });

  it('is deterministic', () => {
    expect(generatePlan(doc, new Date(TS))).toEqual(plan);
  });
});

describe('FR-22 tailoring on corrected variants', () => {
  it('UNIX + PostgreSQL: pg_dump, tar, export, .sh, PG upgrade section — no robocopy or T-SQL', () => {
    const doc = confirmedCase();
    correct(doc, 'em.os_name', 'Red Hat Enterprise Linux 8.8');
    correct(doc, 'server.os_name', 'Red Hat Enterprise Linux 8.8');
    correct(doc, 'db.type', 'PostgreSQL');
    doc.facts['db.version'] = { value: '11.5', confidence: 'EXACT', source: 'test', extractor: 'X05', raw: '' };
    const plan = generatePlan(doc);
    const cmds = plan.items.map((i) => i.cmd).filter(Boolean);
    expect(cmds.some((c) => /pg_dump -U/.test(c))).toBe(true);
    expect(cmds.some((c) => /tar -czf/.test(c))).toBe(true);
    expect(cmds.some((c) => /^export BMC_JAVA_HOME/m.test(c))).toBe(true);
    expect(cmds.some((c) => /is_upgrade_ready\.sh/.test(c))).toBe(true);
    expect(cmds.some((c) => /shut_ctm/.test(c))).toBe(true);
    for (const c of cmds) {
      expect(c).not.toMatch(/robocopy|BACKUP DATABASE|setx|\.bat\b|^REM/m);
    }
    const ids = plan.items.map((i) => i.id);
    expect(ids).toContain('seq_em_pg');
    expect(ids).toContain('seq_server_pg');
    expect(ids).toContain('pt_pg_153');
    expect(ids).toContain('pe_pg_version');
    expect(ids).toContain('ps_nfs');
    expect(plan.items.find((i) => i.id === 'pe_pg_version')?.status).toBe('done');
  });

  it('PostgreSQL below 11 becomes a blocker', () => {
    const doc = confirmedCase();
    correct(doc, 'db.type', 'PostgreSQL');
    doc.facts['db.version'] = { value: '10.4', confidence: 'EXACT', source: 'test', extractor: 'X05', raw: '' };
    const item = generatePlan(doc).items.find((i) => i.id === 'pe_pg_version');
    expect(item?.risk).toBe('blocker');
    expect(item?.status).toBe('todo');
  });

  it('Oracle: Data Pump backup, no T-SQL or pg_dump', () => {
    const doc = confirmedCase();
    correct(doc, 'db.type', 'Oracle');
    const cmds = generatePlan(doc).items.map((i) => i.cmd).filter(Boolean);
    expect(cmds.some((c) => /expdp/.test(c))).toBe(true);
    for (const c of cmds) expect(c).not.toMatch(/BACKUP DATABASE|pg_dump/);
  });

  it('co-hosted: single outage sequence, shared-host wording', () => {
    const doc = confirmedCase();
    correct(doc, 'topology.em_server_same_host', 'Yes — EM and Server on SBCMEM31W');
    const plan = generatePlan(doc);
    const ids = plan.items.map((i) => i.id);
    expect(ids).toContain('seq_stop_all');
    expect(ids).not.toContain('seq_stop_em');
    expect(ids).not.toContain('seq_server_stop');
    expect(ids).not.toContain('ps_java'); // one Java var covers the host
    expect(plan.items.find((i) => i.id === 'pe_firewall')?.detail).toMatch(/share the host/);
    expect(plan.items.find((i) => i.id === 'pe_backup')?.detail).toMatch(/share the host/);
  });

  it('HA: KA 000386814 steps appear for EM and Server', () => {
    const doc = confirmedCase();
    correct(doc, 'em.ha_or_distributed', 'Yes — CONFIG_HA.INI present');
    correct(doc, 'server.ha', 'Yes');
    const ids = generatePlan(doc).items.map((i) => i.id);
    for (const id of ['pe_ha', 'seq_em_ha_stop', 'seq_em_ha_upgrade', 'ps_ha', 'seq_server_ha_stop', 'seq_server_ha_upgrade']) {
      expect(ids, id).toContain(id);
    }
  });

  it('AIX and GD_FORWARD and ctmldnrs items appear only when the facts say so', () => {
    const doc = confirmedCase();
    correct(doc, 'server.os_name', 'AIX 7.2');
    correct(doc, 'server.gd_forward', 'N');
    correct(doc, 'server.ctmldnrs_in_use', 'Yes (ctmldnrs.dat present)');
    const ids = generatePlan(doc).items.map((i) => i.id);
    expect(ids).toContain('ps_aix');
    expect(ids).toContain('ps_gd_forward');
    expect(ids).toContain('ps_ctmldnrs');
  });

  it('unknown OS: commands say so instead of guessing Windows or UNIX', () => {
    const doc = confirmedCase();
    delete doc.facts['em.os_name'];
    delete doc.facts['server.os_name'];
    const plan = generatePlan(doc);
    const cmds = plan.items.map((i) => i.cmd).filter(Boolean);
    const flagged = cmds.filter((c) => /OS NOT DETECTED/.test(c));
    expect(flagged.length).toBeGreaterThanOrEqual(6);
    for (const c of cmds) expect(c).not.toMatch(/robocopy|setx|\.bat\b|^REM/m);
    expect(plan.items.find((i) => i.id === 'ps_backup')?.cmd).toMatch(/^# OS NOT DETECTED/);
  });

  it('target 9.0.21: no 9.0.22 patches, no compat-mode gate, no roles migration', () => {
    const doc = confirmedCase();
    doc.case.target_version = '9.0.21';
    const plan = generatePlan(doc);
    const ids = plan.items.map((i) => i.id);
    expect(ids).not.toContain('env_compat');
    expect(ids).not.toContain('pt_roles');
    expect(allText(plan)).not.toContain('9.0.22.026');
    expect(allText(plan)).toContain('9.0.21');
  });
});

describe('gap answers fill and resolve plan items', () => {
  it('decision answers clear their blockers and mark items done with provenance', () => {
    const doc = confirmedCase();
    answer(doc, 'downtime_window', 'Sat 22:00–02:00');
    answer(doc, 'upgrade_date', '14/Nov/2026');
    answer(doc, 'fallback_plan', 'Yes — VM snapshot + MSSQL backup, restore tested');
    answer(doc, 'change_freeze', 'From 12/Nov 17:00');
    answer(doc, 'test_plan', 'Order a job, check Viewpoint');
    answer(doc, 'compat_mode', 'On — 9.0.20');
    answer(doc, 'ctmsetown', 'EM: 0 NOTIMPL\nServer: 0 NOTIMPL');
    answer(doc, 'same_machine', 'Yes, in place');
    answer(doc, 'cm_inventory', 'None');
    const plan = generatePlan(doc);
    const byId = Object.fromEntries(plan.items.map((i) => [i.id, i]));
    const ids = Object.keys(byId);
    for (const gone of ['risk_downtime', 'risk_fallback', 'risk_change_freeze', 'risk_test_plan', 'risk_compat_mode_gate', 'risk_cms', 'pt_cms']) {
      expect(ids, gone).not.toContain(gone);
    }
    expect(byId['env_dates']?.risk).toBe('clear');
    expect(byId['env_dates']?.text).toContain('14/Nov/2026');
    expect(byId['fb_plan']?.status).toBe('done');
    expect(byId['fb_plan']?.detail).toContain('answered:');
    expect(byId['fb_test']?.status).toBe('done');
    expect(byId['pe_ctmsetown']?.status).toBe('done');
    expect(byId['pe_ctmsetown']?.risk).toBe('clear');
    expect(byId['ps_change_freeze']?.status).toBe('done');
    expect(byId['pe_same_machine']?.autofilled_from).toBe('same_machine');
    expect(byId['v_test_plan']).toBeDefined();
  });

  it('a NOTIMPL listing turns the ctmsetown item into a blocker, not done', () => {
    const doc = confirmedCase();
    answer(doc, 'ctmsetown', '&ctmagent@FIELD  &bh3jbolpv05@FIELD  &P@FIELD  &NOTIMPL@LINE');
    const item = generatePlan(doc).items.find((i) => i.id === 'pe_ctmsetown');
    expect(item?.risk).toBe('blocker');
    expect(item?.status).toBe('todo');
  });

  it('migration and cloud answers add their items', () => {
    const doc = confirmedCase();
    answer(doc, 'same_machine', 'No — moving to new VM');
    answer(doc, 'cloud', 'Yes, AWS');
    answer(doc, 'cm_inventory', 'SAP CM and Databases CM installed');
    const ids = generatePlan(doc).items.map((i) => i.id);
    expect(ids).toContain('risk_migration');
    expect(ids).toContain('risk_cloud');
    expect(ids).toContain('risk_cms');
    expect(ids).toContain('pt_cms');
    expect(ids).not.toContain('pe_same_machine');
  });
});

describe('plan lifecycle through the store', () => {
  beforeEach(() => {
    const store = useCaseStore.getState();
    store.closeCase();
    store.newCase({ name: 'AZAMA79', target_version: '9.0.22' });
    store.applyParseResult(PARSED);
  });

  it('refuses to generate while confirmations are pending, then generates', () => {
    const store = useCaseStore.getState();
    expect(store.generatePlan()).toBe(false);
    expect(useCaseStore.getState().doc?.plan.items).toEqual([]);
    for (const key of ['db.type', 'em.av_monitoring', 'server.av_monitoring']) store.confirmFact(key);
    expect(store.generatePlan()).toBe(true);
    const doc = useCaseStore.getState().doc!;
    expect(doc.plan.items.length).toBeGreaterThan(50);
    expect(doc.activity_log.at(-1)?.action).toBe('plan.generated');
    expect(doc.activity_log.at(-1)?.detail).toMatch(/auto-filled/);
  });

  it('cycles status todo → done → na → todo and logs each change', () => {
    const store = useCaseStore.getState();
    for (const key of ['db.type', 'em.av_monitoring', 'server.av_monitoring']) store.confirmFact(key);
    store.generatePlan();
    const id = 'pe_media';
    const status = () => useCaseStore.getState().doc!.plan.items.find((i) => i.id === id)!.status;
    expect(status()).toBe('todo');
    store.cyclePlanItemStatus(id);
    expect(status()).toBe('done');
    store.cyclePlanItemStatus(id);
    expect(status()).toBe('na');
    store.cyclePlanItemStatus(id);
    expect(status()).toBe('todo');
    expect(useCaseStore.getState().doc!.activity_log.filter((e) => e.action === 'plan.item_status')).toHaveLength(3);
    expect(planStats(useCaseStore.getState().doc!.plan).total).toBeGreaterThan(50);
  });

  it('regeneration keeps manual progress, lets new evidence win, and survives save/reopen', () => {
    const store = useCaseStore.getState();
    for (const key of ['db.type', 'em.av_monitoring', 'server.av_monitoring']) store.confirmFact(key);
    store.generatePlan();
    store.setPlanItemStatus('pe_media', 'done');
    store.setPlanItemStatus('v_other_addons', 'na');
    // New evidence: the downtime window gets answered.
    store.saveAnswer('downtime_window', '4 hours');
    store.saveAnswer('upgrade_date', '14/Nov/2026');
    store.generatePlan();
    const doc = useCaseStore.getState().doc!;
    const byId = Object.fromEntries(doc.plan.items.map((i) => [i.id, i]));
    expect(byId['pe_media']?.status).toBe('done');
    expect(byId['v_other_addons']?.status).toBe('na');
    expect(byId['risk_downtime']).toBeUndefined();
    expect(byId['env_dates']?.status).toBe('done');
    expect(doc.activity_log.at(-1)?.action).toBe('plan.regenerated');

    const reopened = parseCaseFile(serializeCaseFile(doc));
    expect(reopened.plan).toEqual(doc.plan);
  });

  it('mergePlan is pure and only preserves non-todo manual marks', () => {
    const doc = confirmedCase();
    const a = generatePlan(doc);
    const previous: Plan = {
      ...a,
      items: a.items.map((i) => (i.id === 'pe_media' ? { ...i, status: 'done' } : i)),
    };
    const merged = mergePlan(previous, a);
    expect(merged.items.find((i) => i.id === 'pe_media')?.status).toBe('done');
    expect(a.items.find((i) => i.id === 'pe_media')?.status).toBe('todo');
  });
});

describe('plan env helpers', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('9.0.21.300', '9.0.21.200')).toBe(1);
    expect(compareVersions('9.0.21', '9.0.21.000')).toBe(0);
    expect(compareVersions('11.5', '11')).toBe(1);
    expect(compareVersions('10.4', '11')).toBe(-1);
    expect(compareVersions('n/a', '11')).toBeNull();
  });

  it('reads the fixture environment the tailoring keys on', () => {
    const env = buildPlanEnv(confirmedCase());
    expect(env.em.osFamily).toBe('windows');
    expect(env.server.osFamily).toBe('windows');
    expect(env.db.family).toBe('mssql');
    expect(env.sameHost).toBe(false);
    expect(env.em.diskOk).toBe(true);
    expect(env.server.apigtwPort).toBe('8393');
    expect(env.agents.count).toBeGreaterThan(0);
    expect(env.agents.unavailable).toEqual(['dbsrv01']);
    expect(env.em.aiJobTypes).toBe(2);
  });

  it('every template id is unique and every section id is known', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sections = new Set(SECTIONS.map((s) => s.id));
    for (const t of TEMPLATES) expect(sections.has(t.section), t.id).toBe(true);
  });
});
