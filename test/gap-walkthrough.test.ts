import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseArchives } from '@/lib/parser';
import { parseCaseFile, serializeCaseFile } from '@/lib/case/serialize';
import { useCaseStore } from '@/lib/store/caseStore';
import {
  askAgentPrompt,
  DECISION_GAPS,
  formatMinutes,
  gapProgress,
  isAnswered,
  openGaps,
  windowMinutesFromAnswer,
} from '@/lib/gaps/walkthrough';
import { evaluateRisks } from '@/lib/rules/risk';
import type { CaseDocument } from '@/lib/types/case';

/**
 * M3 gate (PRD §10): all 15 fixture gaps completable; answers persist through
 * save/reopen. Runs through the real store so autosave stamping, the audit
 * trail and the FR-13 runbook-window side effect are all exercised.
 */

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');

function read(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(FIXTURES, name)));
}

const PARSED = parseArchives([
  { fileName: 'hcu_SBCMEM31W.zip', bytes: read('hcu_SBCMEM31W.zip') },
  { fileName: 'hcu_SBCMSR01W.zip', bytes: read('hcu_SBCMSR01W.zip') },
]);

/** A fresh case with the fixture parse applied, via the store. */
function freshCase(): CaseDocument {
  const store = useCaseStore.getState();
  store.closeCase();
  store.newCase({ name: 'M3 fixture', target_version: '9.0.22' });
  store.applyParseResult(PARSED);
  return doc();
}

function doc(): CaseDocument {
  const d = useCaseStore.getState().doc;
  if (!d) throw new Error('no case open');
  return d;
}

/** Realistic answers, one per fixture gap. */
const ANSWERS: Record<string, string> = {
  ctmsetown: 'EM: 0 NOTIMPL\nServer: 0 NOTIMPL\n(full output pasted)',
  compat_mode: 'On — compatibility version 9.0.20',
  is_upgrade_ready: 'is_upgrade_ready.bat -p em: PASS\nis_upgrade_ready.bat -p ctm: PASS',
  cm_inventory: 'None installed (cm\\ is empty)',
  em_clients: '3 clients: SBCMEM31W and two admin laptops',
  target_version: '9.0.22 + latest fix pack',
  upgrade_date: '14/Nov/2026',
  downtime_window: 'Sat 14/Nov 22:00 local, 4 hours 30 minutes',
  fallback_plan: 'Yes — VM snapshot + MSSQL full backup, restore tested 01/Sep/2026',
  change_freeze: 'Job definition freeze from 12/Nov 17:00',
  test_plan: 'Smoke: order a job, check Viewpoint, run ctmping, verify agents',
  same_machine: 'Yes, in-place on the same hosts',
  cloud: 'No — on-prem VMware',
  av_exclusions: 'Confirmed: CrowdStrike exclusions for EM home and Server home',
  firewall: 'Confirmed: 6005/7005/2370 verified between EM, Server and agents',
};

describe('windowMinutesFromAnswer (FR-13)', () => {
  it.each([
    ['4 hours', 240],
    ['4h', 240],
    ['4h30m', 270],
    ['4 hours 30 minutes', 270],
    ['3.5 hrs', 210],
    ['240 min', 240],
    ['1 day', 1440],
    ['22:00-06:00', 480],
    ['22:00 – 02:00', 240],
    ['02:00 to 06:00', 240],
    ['10pm-2am', 240],
    ['10:30pm to 1am', 150],
    ['Sat 14/Nov 22:00 local, 4 hours 30 minutes', 270],
    ['Saturday 22:00–04:00 (6 hours agreed)', 360],
  ])('%s → %i minutes', (text, minutes) => {
    expect(windowMinutesFromAnswer(text)).toBe(minutes);
  });

  it.each([['Saturday night'], ['TBD'], ['2 weekends'], ['0 hours'], [''], ['12 machines']])(
    'never guesses: %s → null',
    (text) => {
      expect(windowMinutesFromAnswer(text)).toBeNull();
    },
  );

  it('formats budgets for display', () => {
    expect(formatMinutes(270)).toBe('4 h 30 min');
    expect(formatMinutes(240)).toBe('4 h');
    expect(formatMinutes(45)).toBe('45 min');
  });
});

describe('gap walkthrough (M3 gate)', () => {
  beforeEach(() => {
    freshCase();
  });

  it('carries the 15 fixture gaps, in catalogue order, all open', () => {
    const d = doc();
    expect(d.gaps).toHaveLength(15);
    expect(d.gaps[0]?.id).toBe('ctmsetown');
    expect(d.gaps[14]?.id).toBe('firewall');
    expect(gapProgress(d)).toEqual({ total: 15, answered: 0, open: 15, pct: 0, complete: false });
    expect(Object.keys(ANSWERS).sort()).toEqual(d.gaps.map((g) => g.id).sort());
  });

  it('every gap has exactly the answering aid its kind promises (FR-12)', () => {
    for (const g of doc().gaps) {
      if (g.state === 'run-command') expect(g.command, g.id).toBeTruthy();
      if (g.state === 'console') expect(g.console, g.id).toBeTruthy();
      if (g.state === 'interview') {
        expect(g.command, g.id).toBeUndefined();
        expect(g.console, g.id).toBeUndefined();
      }
      for (const r of g.refs ?? []) {
        // Dead EM/Server upgrade pages must never be linked (url-reference.md).
        expect(r.url).not.toMatch(/Control-M_(EM|Server)_Upgrade\.htm/);
        if (/documents\.bmc\.com|selfservice\.bmc\.com/.test(r.url)) {
          expect(r.label, r.url).toContain('🔒');
        }
      }
    }
  });

  it('all 15 gaps are completable through the store', () => {
    const store = useCaseStore.getState();
    for (const g of doc().gaps) {
      store.saveAnswer(g.id, ANSWERS[g.id] as string);
    }
    const d = doc();
    expect(gapProgress(d)).toEqual({ total: 15, answered: 15, open: 0, pct: 100, complete: true });
    expect(openGaps(d)).toEqual([]);
    for (const g of d.gaps) {
      expect(isAnswered(d, g.id)).toBe(true);
      expect(d.answers[g.id]?.value).toBe(ANSWERS[g.id]);
      expect(d.answers[g.id]?.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    // Every save is in the audit trail with the value it recorded.
    const logged = d.activity_log.filter((e) => e.action === 'gap.answered');
    expect(logged).toHaveLength(15);
    expect(logged.find((e) => e.detail.startsWith('compat_mode:'))?.detail).toContain(
      'On — compatibility version 9.0.20',
    );
  });

  it('progress counts partial completion', () => {
    const store = useCaseStore.getState();
    store.saveAnswer('ctmsetown', ANSWERS['ctmsetown'] as string);
    store.saveAnswer('cloud', ANSWERS['cloud'] as string);
    store.saveAnswer('firewall', ANSWERS['firewall'] as string);
    expect(gapProgress(doc())).toEqual({ total: 15, answered: 3, open: 12, pct: 20, complete: false });
    expect(openGaps(doc()).map((g) => g.id)).not.toContain('cloud');
  });

  it('the downtime window answer sets the runbook clock budget (FR-13)', () => {
    const store = useCaseStore.getState();
    expect(doc().runbook.window_minutes).toBeNull();

    store.saveAnswer('downtime_window', ANSWERS['downtime_window'] as string);
    expect(doc().runbook.window_minutes).toBe(270);
    expect(doc().activity_log.at(-1)?.detail).toContain('runbook window budget 4 h 30 min');

    // An answer without a readable duration leaves the budget unset — never guessed.
    store.saveAnswer('downtime_window', 'Saturday night, TBC');
    expect(doc().runbook.window_minutes).toBeNull();
    expect(isAnswered(doc(), 'downtime_window')).toBe(true);
    expect(doc().activity_log.at(-1)?.detail).toContain('no duration recognised');

    store.saveAnswer('downtime_window', '22:00-02:00');
    expect(doc().runbook.window_minutes).toBe(240);

    store.clearAnswer('downtime_window');
    expect(doc().runbook.window_minutes).toBeNull();
    expect(doc().answers['downtime_window']).toBeUndefined();
  });

  it('other answers never touch the runbook budget', () => {
    const store = useCaseStore.getState();
    store.saveAnswer('upgrade_date', '4 hours');
    expect(doc().runbook.window_minutes).toBeNull();
  });

  it('blank answers clear, and unknown gap ids are ignored', () => {
    const store = useCaseStore.getState();
    store.saveAnswer('cloud', 'No');
    expect(isAnswered(doc(), 'cloud')).toBe(true);
    store.saveAnswer('cloud', '   ');
    expect(doc().answers['cloud']).toBeUndefined();
    expect(doc().activity_log.at(-1)?.action).toBe('gap.answer_cleared');

    const before = doc();
    store.saveAnswer('not_a_gap', 'whatever');
    expect(doc()).toBe(before);
    store.clearAnswer('cloud'); // already cleared — no-op, no log entry
    expect(doc()).toBe(before);
  });

  it('answering the compat-mode gap clears its risk banner (FR-11/FR-13)', () => {
    expect(evaluateRisks(doc()).map((r) => r.id)).toContain('compat_mode_gate');
    useCaseStore.getState().saveAnswer('compat_mode', ANSWERS['compat_mode'] as string);
    expect(evaluateRisks(doc()).map((r) => r.id)).not.toContain('compat_mode_gate');
  });

  it('answers persist through save and reopen (M3 gate)', () => {
    const store = useCaseStore.getState();
    for (const g of doc().gaps) store.saveAnswer(g.id, ANSWERS[g.id] as string);
    const saved = doc();

    // Save = serialize to case.json; reopen = parse + load into the store.
    const text = serializeCaseFile(saved);
    store.closeCase();
    expect(useCaseStore.getState().doc).toBeNull();
    store.openCaseFromText(text, 'm3-fixture-case.json');

    const reopened = doc();
    expect(reopened.answers).toEqual(saved.answers);
    expect(reopened.runbook.window_minutes).toBe(270);
    expect(gapProgress(reopened).complete).toBe(true);
    // And the file itself is what a plain reader would parse.
    expect(parseCaseFile(text).answers).toEqual(saved.answers);
  });

  it('a re-parse invalidates answers and the budget derived from them', () => {
    const store = useCaseStore.getState();
    store.saveAnswer('downtime_window', '4 hours');
    store.applyParseResult(PARSED);
    expect(doc().answers).toEqual({});
    expect(doc().runbook.window_minutes).toBeNull();
  });

  it('decision gaps are all real gap ids', () => {
    const ids = new Set(doc().gaps.map((g) => g.id));
    for (const id of Object.keys(DECISION_GAPS)) expect(ids.has(id), id).toBe(true);
  });

  it('"Ask advisor" prefill carries the question, command and why (FR-14)', () => {
    const gap = doc().gaps.find((g) => g.id === 'ctmsetown');
    if (!gap) throw new Error('fixture gap missing');
    const prompt = askAgentPrompt(gap);
    expect(prompt).toContain(gap.question);
    expect(prompt).toContain('ctmsetown -action list');
    expect(prompt).toContain(gap.why);

    useCaseStore.getState().askAgent({ kind: 'gap', id: gap.id, label: 'Gap 01', prompt });
    expect(useCaseStore.getState().agentOpen).toBe(true);
    expect(useCaseStore.getState().agentFocus?.prompt).toBe(prompt);
  });
});
