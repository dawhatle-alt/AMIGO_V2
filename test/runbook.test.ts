import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseArchives } from '@/lib/parser';
import { createEmptyCase } from '@/lib/case/emptyCase';
import { parseCaseFile, serializeCaseFile } from '@/lib/case/serialize';
import { useCaseStore } from '@/lib/store/caseStore';
import { buildPlanEnv } from '@/lib/plan/env';
import {
  actualMinutes,
  askAboutStepPrompt,
  canActOn,
  clockState,
  currentStepId,
  fmtClock,
  generateRunbook,
  mergeRunbook,
  rollbackProcedure,
  runbookStats,
  stepContent,
  stepFocusDetail,
} from '@/lib/runbook/engine';
import { PHASES, STEP_TEMPLATES } from '@/lib/runbook/templates';
import type { CaseDocument, Runbook } from '@/lib/types/case';

/**
 * M6 gate (PRD §10): Gate 1 starts the clock; the window comes from the gap
 * answer; the over-budget warning fires when simulated. Plus FR-21's
 * sequential locking, PONR placement, timestamps and the rollback panel.
 */

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');
const read = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)));

const PARSED = parseArchives([
  { fileName: 'hcu_SBCMEM31W.zip', bytes: read('hcu_SBCMEM31W.zip') },
  { fileName: 'hcu_SBCMSR01W.zip', bytes: read('hcu_SBCMSR01W.zip') },
]);
const TS = '2026-09-01T00:00:00Z';

function confirmedCase(): CaseDocument {
  const doc = createEmptyCase({ name: 'AZAMA79', target_version: '9.0.22' });
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

const CONFIRM_KEYS = ['db.type', 'em.av_monitoring', 'server.av_monitoring'];

describe('runbook generation (FR-21 / FR-22)', () => {
  const doc = confirmedCase();
  const rb = generateRunbook(doc);
  const ids = rb.steps.map((s) => s.id);

  it('covers phases A–G with Gate 0, Gate 1, PONR and Gate 2 in order', () => {
    expect([...new Set(rb.steps.map((s) => s.phase))]).toEqual(PHASES.map((p) => p.id));
    const order = ['gate0', 'gate1', 'ponr', 'gate2'].map((id) => ids.indexOf(id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(rb.steps.find((s) => s.id === 'gate1')?.phase).toBe('B');
    expect(rb.steps.find((s) => s.id === 'gate2')?.phase).toBe('F');
  });

  it('places the PONR immediately before the EM upgrade', () => {
    expect(ids[ids.indexOf('ponr') + 1]).toBe('c1');
    expect(rb.steps.find((s) => s.id === 'ponr')?.type).toBe('ponr');
  });

  it('stores only schema fields, all pending, with estimates on work steps', () => {
    for (const s of rb.steps) {
      expect(Object.keys(s).sort()).toEqual(['completed_at', 'est_min', 'id', 'phase', 'started_at', 'status', 'title', 'type'].sort());
      expect(s.status).toBe('pending');
      if (s.type === 'step') expect(s.est_min).toBeGreaterThan(0);
      else expect(s.est_min).toBe(0);
    }
    expect(rb.outage_started_at).toBeNull();
    expect(rb.window_minutes).toBeNull();
  });

  it('tailors to the fixture: Windows + MS SQL, separate hosts, no PostgreSQL or HA steps', () => {
    expect(ids).not.toContain('c1pg');
    expect(ids).not.toContain('d2pg');
    expect(ids).not.toContain('b2');
    expect(ids).not.toContain('c1ha');
    expect(ids).not.toContain('d2ha');
    expect(ids).toContain('e2'); // agents present
    const env = buildPlanEnv(doc);
    const cmds = rb.steps.map((s) => stepContent(s, doc, env).cmd).filter(Boolean);
    expect(cmds.some((c) => /BACKUP DATABASE \[/.test(c))).toBe(true);
    expect(cmds.some((c) => /echo %BMC_INST_CTM_APIGTW_PORT%/.test(c))).toBe(true);
    expect(cmds.some((c) => /setup\.exe/.test(c))).toBe(true);
    for (const c of cmds) expect(c).not.toMatch(/pg_dump|^#|\bexport\b|setup\.sh/m);
    expect(rb.steps.find((s) => s.id === 'b3')?.title).toBe('Stop Control-M/EM, then Control-M/Server');
    expect(rb.steps.find((s) => s.id === 'c1')?.title).toContain('SBCMEM31W');
    expect(rb.steps.find((s) => s.id === 'd2')?.title).toContain('SBCMSR01W');
  });

  it('every step renders content from its template; gates carry checks, PONR a note', () => {
    const env = buildPlanEnv(doc);
    for (const s of rb.steps) {
      const c = stepContent(s, doc, env);
      if (s.type === 'gate') expect(c.checks.length, s.id).toBeGreaterThan(0);
      if (s.type === 'ponr') expect(c.note).toMatch(/restore the MS SQL databases \+ reinstall EM 9\.0\.21\.300 \/ Server 9\.0\.21\.302/);
      if (s.type === 'step') expect(c.expect || c.verify || c.cmd, s.id).toBeTruthy();
      for (const r of c.refs) {
        expect(r.url).not.toMatch(/Control-M_(EM|Server)_Upgrade\.htm/);
        if (/documents\.bmc\.com|selfservice\.bmc\.com/.test(r.url)) expect(r.label).toContain('🔒');
      }
    }
    expect(stepContent(rb.steps.find((s) => s.id === 'gate0')!, doc, env).checks.join('\n')).toMatch(/Downtime window defined/);
    expect(stepContent(rb.steps.find((s) => s.id === 'gate0')!, doc, env).checks.join('\n')).toMatch(/MS SQL restore tested/);
  });

  it('UNIX + PostgreSQL + HA variant adds PG and HA steps with UNIX syntax', () => {
    const d = confirmedCase();
    correct(d, 'em.os_name', 'Red Hat Enterprise Linux 8.8');
    correct(d, 'server.os_name', 'Red Hat Enterprise Linux 8.8');
    correct(d, 'db.type', 'PostgreSQL');
    correct(d, 'em.ha_or_distributed', 'Yes — CONFIG_HA.INI present');
    correct(d, 'server.ha', 'Yes');
    const r = generateRunbook(d);
    const i = r.steps.map((s) => s.id);
    for (const id of ['c1pg', 'd2pg', 'b2', 'b4', 'c1ha', 'c4ha', 'd2ha']) expect(i, id).toContain(id);
    const env = buildPlanEnv(d);
    const cmds = r.steps.map((s) => stepContent(s, d, env).cmd).filter(Boolean);
    expect(cmds.some((c) => /pg_dump/.test(c))).toBe(true);
    expect(cmds.some((c) => /setup\.sh/.test(c))).toBe(true);
    expect(cmds.some((c) => /^echo \$BMC_INST_CTM_APIGTW_PORT/m.test(c))).toBe(true);
    for (const c of cmds) expect(c).not.toMatch(/robocopy|setup\.exe|%BMC_/);
    expect(rollbackProcedure(d).join('\n')).toMatch(/pg_restore -U <db_user> -d <em_database>/);
    expect(rollbackProcedure(d).join('\n')).toMatch(/tar -xzf/);
  });

  it('every template id is unique and belongs to a known phase', () => {
    const all = STEP_TEMPLATES.map((t) => t.id);
    expect(new Set(all).size).toBe(all.length);
    const phases = new Set(PHASES.map((p) => p.id));
    for (const t of STEP_TEMPLATES) expect(phases.has(t.phase), t.id).toBe(true);
  });
});

describe('rollback panel (FR-21: DB-correct restore syntax)', () => {
  it('MS SQL: RESTORE DATABASE for both databases, robocopy back, SEV-1 rule', () => {
    const lines = rollbackProcedure(confirmedCase());
    expect(lines).toHaveLength(8);
    const text = lines.join('\n');
    expect(text).toMatch(/RESTORE DATABASE \[<em_database>\] FROM DISK/);
    expect(text).toMatch(/RESTORE DATABASE \[<server_database>\] FROM DISK/);
    expect(text).toMatch(/robocopy "D:\\Backups\\em_home_pre_upgrade" "D:\\BMC\\ControlM_EM"/);
    expect(text).toMatch(/NEW SEV-1 case/);
    expect(text).toMatch(/do NOT raise the AMIGO case severity/);
    expect(text).not.toMatch(/pg_restore|impdp/);
  });

  it('Oracle: Data Pump import', () => {
    const d = confirmedCase();
    correct(d, 'db.type', 'Oracle');
    expect(rollbackProcedure(d).join('\n')).toMatch(/impdp .*TABLE_EXISTS_ACTION=REPLACE/);
  });
});

describe('clock and over-budget rule', () => {
  function runbookWith(overrides: Partial<Runbook>): Runbook {
    return { ...generateRunbook(confirmedCase()), ...overrides };
  }

  it('is idle before Gate 1', () => {
    const c = clockState(runbookWith({}), new Date(TS));
    expect(c).toMatchObject({ running: false, elapsedMin: 0, remainingMin: null, overBudget: false, exceeded: false });
  });

  it('counts elapsed and remaining from the window budget', () => {
    const rb = runbookWith({ outage_started_at: '2026-11-14T22:00:00Z', window_minutes: 240 });
    const c = clockState(rb, new Date('2026-11-14T23:05:00Z'));
    expect(c.elapsedMin).toBe(65);
    expect(c.remainingMin).toBe(175);
    expect(c.windowMin).toBe(240);
  });

  it('fires over-budget when simulated: remaining window < estimated remaining work', () => {
    const base = runbookWith({ outage_started_at: '2026-11-14T22:00:00Z', window_minutes: 240 });
    const est = runbookStats(base).estRemainingMin;
    expect(est).toBeGreaterThan(60);
    // 30 minutes of window left, hours of work left.
    const c = clockState(base, new Date('2026-11-15T01:30:00Z'));
    expect(c.remainingMin).toBe(30);
    expect(c.overBudget).toBe(true);
    expect(c.exceeded).toBe(false);
    // Window used up entirely.
    const d = clockState(base, new Date('2026-11-15T02:10:00Z'));
    expect(d.remainingMin).toBe(-10);
    expect(d.exceeded).toBe(true);
    expect(d.overBudget).toBe(true);
  });

  it('does not fire without a window budget, or once everything is done', () => {
    const noBudget = runbookWith({ outage_started_at: '2026-11-14T22:00:00Z', window_minutes: null });
    expect(clockState(noBudget, new Date('2026-11-15T09:00:00Z')).overBudget).toBe(false);
    const finished = runbookWith({ outage_started_at: '2026-11-14T22:00:00Z', window_minutes: 240 });
    finished.steps = finished.steps.map((s) => ({ ...s, status: 'done' }));
    expect(clockState(finished, new Date('2026-11-15T09:00:00Z')).overBudget).toBe(false);
    expect(runbookStats(finished).complete).toBe(true);
  });

  it('formats clocks', () => {
    expect(fmtClock(65)).toBe('1:05');
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(-10)).toBe('0:00');
  });
});

describe('execution through the store (M6 gate)', () => {
  beforeEach(() => {
    const store = useCaseStore.getState();
    store.closeCase();
    store.newCase({ name: 'AZAMA79', target_version: '9.0.22' });
    store.applyParseResult(PARSED);
    for (const key of CONFIRM_KEYS) store.confirmFact(key);
  });

  const doc = () => useCaseStore.getState().doc!;
  const step = (id: string) => doc().runbook.steps.find((s) => s.id === id)!;

  it('the runbook is generated with the plan and keeps progress on regeneration', () => {
    const store = useCaseStore.getState();
    expect(doc().runbook.steps).toEqual([]);
    expect(store.generatePlan()).toBe(true);
    expect(doc().runbook.steps.length).toBeGreaterThan(25);
    store.passGate('gate0');
    store.generatePlan();
    expect(step('gate0').status).toBe('done');
    expect(doc().activity_log.at(-1)?.action).toBe('plan.regenerated');
  });

  it('locks steps sequentially: only the current step can be acted on', () => {
    const store = useCaseStore.getState();
    store.generatePlan();
    expect(currentStepId(doc().runbook)).toBe('gate0');
    store.startStep('a1'); // gate0 not passed yet
    expect(step('a1').status).toBe('pending');
    expect(canActOn(doc().runbook, 'a1')).toBe(false);
    store.passGate('gate1'); // out of order
    expect(step('gate1').status).toBe('pending');

    store.passGate('gate0');
    expect(step('gate0').status).toBe('done');
    expect(currentStepId(doc().runbook)).toBe('a1');
    store.startStep('a2'); // not current
    expect(step('a2').status).toBe('pending');
    store.startStep('a1');
    expect(step('a1').status).toBe('active');
    expect(step('a1').started_at).toMatch(/^\d{4}-/);
    store.completeStep('a1');
    expect(step('a1').status).toBe('done');
    expect(step('a1').completed_at).toMatch(/^\d{4}-/);
    expect(currentStepId(doc().runbook)).toBe('a2');
    store.skipStep('a2');
    expect(step('a2').status).toBe('na');
    expect(currentStepId(doc().runbook)).toBe('a3');
    expect(doc().activity_log.map((e) => e.action)).toEqual(
      expect.arrayContaining(['runbook.gate_passed', 'runbook.step_started', 'runbook.step_completed', 'runbook.step_skipped']),
    );
  });

  it('Gate 1 starts the outage clock; the window comes from the gap answer (M6 gate)', () => {
    const store = useCaseStore.getState();
    store.saveAnswer('downtime_window', 'Saturday 22:00–06:00');
    store.generatePlan();
    expect(doc().runbook.window_minutes).toBe(480);
    expect(doc().runbook.outage_started_at).toBeNull();

    store.passGate('gate0');
    for (const id of doc().runbook.steps.filter((s) => s.phase === 'A' && s.type === 'step').map((s) => s.id)) {
      store.startStep(id);
      store.completeStep(id);
    }
    expect(currentStepId(doc().runbook)).toBe('gate1');
    expect(clockState(doc().runbook).running).toBe(false);

    store.passGate('gate1');
    expect(doc().runbook.outage_started_at).toMatch(/^\d{4}-/);
    expect(doc().activity_log.at(-1)?.detail).toContain('outage clock started');
    const c = clockState(doc().runbook);
    expect(c.running).toBe(true);
    expect(c.windowMin).toBe(480);
    expect(c.remainingMin).toBe(480);
    expect(c.overBudget).toBe(false);
    // A 4 h window would already be over budget at Gate 1 — the remaining
    // phases estimate more than 240 minutes for this environment.
    expect(runbookStats(doc().runbook).estRemainingMin).toBeGreaterThan(240);
    expect(clockState({ ...doc().runbook, window_minutes: 240 }).overBudget).toBe(true);

    // Simulate the window running down: 30 min left, hours of work left.
    const started = new Date(doc().runbook.outage_started_at!).getTime();
    const later = new Date(started + 450 * 60000);
    const sim = clockState(doc().runbook, later);
    expect(sim.remainingMin).toBe(30);
    expect(sim.overBudget).toBe(true);

    // PONR must be confirmed before the EM upgrade can start.
    for (const id of doc().runbook.steps.filter((s) => s.phase === 'B' && s.type === 'step').map((s) => s.id)) {
      store.startStep(id);
      store.completeStep(id);
    }
    expect(currentStepId(doc().runbook)).toBe('ponr');
    store.startStep('c1');
    expect(step('c1').status).toBe('pending');
    store.passGate('ponr');
    expect(step('ponr').status).toBe('done');
    expect(doc().activity_log.at(-1)?.action).toBe('runbook.ponr_confirmed');
    expect(currentStepId(doc().runbook)).toBe('c1');

    // Everything survives save / reopen.
    const reopened = parseCaseFile(serializeCaseFile(doc()));
    expect(reopened.runbook).toEqual(doc().runbook);
  });

  it('records actual vs estimate per step', () => {
    const rb = generateRunbook(confirmedCase());
    const s = { ...rb.steps.find((x) => x.id === 'a1')!, started_at: '2026-11-14T20:00:00Z', completed_at: '2026-11-14T20:42:00Z' };
    expect(actualMinutes(s)).toBe(42);
    expect(s.est_min).toBe(30);
    expect(actualMinutes(rb.steps[1]!)).toBeNull();
  });

  it('mergeRunbook keeps timestamps and statuses, drops vanished steps', () => {
    const fresh = generateRunbook(confirmedCase());
    const previous: Runbook = {
      ...fresh,
      outage_started_at: '2026-11-14T22:00:00Z',
      steps: [
        { ...fresh.steps[0]!, status: 'done', started_at: 't', completed_at: 't' },
        { id: 'vanished', phase: 'A', type: 'step', title: 'x', est_min: 1, status: 'done', started_at: null, completed_at: null },
      ],
    };
    const merged = mergeRunbook(previous, fresh);
    expect(merged.steps[0]?.status).toBe('done');
    expect(merged.steps.find((s) => s.id === 'vanished')).toBeUndefined();
    expect(merged.outage_started_at).toBe('2026-11-14T22:00:00Z');
  });
});

describe('advisor entry points (FR-18)', () => {
  it('Ask and Report error pre-fill with the step context', () => {
    const doc = confirmedCase();
    const rb = generateRunbook(doc);
    const c1 = rb.steps.find((s) => s.id === 'c1')!;
    const content = stepContent(c1, doc);
    const ask = askAboutStepPrompt(rb, c1, content, 'ask');
    expect(ask).toMatch(/^I'm on step \d\d \(Upgrade Control-M\/EM on SBCMEM31W\)/);
    expect(ask).toContain('setup.exe');
    expect(ask).toContain('Failure guidance: STOP.');
    const err = askAboutStepPrompt(rb, c1, content, 'error');
    expect(err).toMatch(/^I hit an error on step \d\d/);
    expect(err).toMatch(/exact error text/);
    const detail = stepFocusDetail(c1, content);
    expect(detail).toContain('est 60 min');
    expect(detail).toContain('If it fails: STOP.');
  });
});
