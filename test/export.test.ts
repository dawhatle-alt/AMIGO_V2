import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parseArchives } from '@/lib/parser';
import { createEmptyCase } from '@/lib/case/emptyCase';
import { parseCaseFile, serializeCaseFile } from '@/lib/case/serialize';
import { generatePlan, planStats } from '@/lib/plan/generate';
import { generateRunbook, runbookStats } from '@/lib/runbook/engine';
import { buildPlanExport, planHtmlFileName, renderPlanHtml } from '@/lib/export/plan';
import { buildRunbookExport, renderRunbookHtml, runbookHtmlFileName } from '@/lib/export/runbook';
import { buildWizardAnswers, serializeWizardAnswers, WIZARD_ANSWERS_FILE } from '@/lib/export/answers';
import { escapeHtml, jsonForScript } from '@/lib/export/html';
import type { CaseDocument } from '@/lib/types/case';

/**
 * M7 gate (PRD §10): exported plan / runbook open from disk in a clean
 * browser with full interactivity. The files are rendered here exactly as the
 * app downloads them and then loaded into jsdom with scripts enabled, so the
 * assertions exercise the same inline JS a double-click would run — with no
 * network, no app, no fonts.
 */

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');
const read = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)));
const PARSED = parseArchives([
  { fileName: 'hcu_SBCMEM31W.zip', bytes: read('hcu_SBCMEM31W.zip') },
  { fileName: 'hcu_SBCMSR01W.zip', bytes: read('hcu_SBCMSR01W.zip') },
]);
const TS = '2026-09-01T00:00:00Z';
const NOW = new Date('2026-09-01T15:30:00Z');

function planCase(): CaseDocument {
  const doc = createEmptyCase({ name: 'AZAMA79', case_number: '0042', target_version: '9.0.22' });
  doc.archives = structuredClone(PARSED.meta.archives);
  doc.facts = structuredClone(PARSED.facts);
  doc.gaps = structuredClone(PARSED.gaps);
  for (const key of ['db.type', 'em.av_monitoring', 'server.av_monitoring']) {
    doc.confirmations[key] = { status: 'confirmed', corrected_value: null, ts: TS };
  }
  doc.answers['downtime_window'] = { value: 'Saturday 22:00–06:00', ts: TS };
  doc.runbook.window_minutes = 480;
  doc.plan = generatePlan(doc, NOW);
  doc.runbook = generateRunbook(doc);
  return doc;
}

type Win = Window & typeof globalThis & { MouseEvent: typeof MouseEvent; Event: typeof Event };

/** Load an export the way a browser would: scripts run, storage available. */
function open(html: string): Win {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/export.html', pretendToBeVisual: true });
  const win = dom.window as unknown as Win;
  win.confirm = () => true;
  return win;
}

const click = (win: Win, el: Element | null | undefined) => {
  if (!el) throw new Error('element not found');
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
};

/** Tick every checklist box on a gate (each change re-renders, so re-query per box). */
function tickAll(win: Win, gateSelector: string) {
  const count = win.document.querySelector(gateSelector)?.querySelectorAll('input[data-check]').length ?? 0;
  for (let i = 0; i < count; i++) {
    const box = win.document.querySelector(gateSelector)?.querySelectorAll('input[data-check]')[i] as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new win.Event('change', { bubbles: true }));
  }
  return count;
}

const DEAD_PAGES = ['Control-M_EM_Upgrade.htm', 'Control-M_Server_Upgrade.htm'];

describe('standalone plan export (FR-24a / FR-25)', () => {
  const doc = planCase();
  const html = renderPlanHtml(doc, NOW);

  it('is one self-contained file: inline CSS + JS, no external requests', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toMatch(/<style>/);
    expect(html).toMatch(/<script>/);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/@import|url\(https?:/i);
    expect(html).not.toMatch(/localhost:3000|\/api\/chat/);
    // Function scope: a bare `var status` would bind to window.status in Chromium.
    expect(html).toMatch(/<script>\s*\(function\(\)\{/);
    expect(html).not.toMatch(/^var status=/m);
  });

  it('embeds every plan item with its status at export time', () => {
    const data = buildPlanExport(doc, NOW);
    const ids = data.sections.flatMap((s) => s.items.map((i) => i.id));
    expect(ids.sort()).toEqual(doc.plan.items.map((i) => i.id).sort());
    expect(data.exported_at).toBe(NOW.toISOString());
    expect(data.generated_at).toBe(doc.plan.generated_at);
    const done = doc.plan.items.filter((i) => i.status === 'done').length;
    expect(done).toBeGreaterThan(0);
    expect(data.sections.flatMap((s) => s.items).filter((i) => i.st === 'done')).toHaveLength(done);

    // A status changed in the app before export is what the file carries.
    const changed = structuredClone(doc);
    const first = changed.plan.items.find((i) => i.status === 'todo');
    if (!first) throw new Error('fixture has no todo item');
    first.status = 'na';
    const item = buildPlanExport(changed, NOW)
      .sections.flatMap((s) => s.items)
      .find((i) => i.id === first.id);
    expect(item?.st).toBe('na');
  });

  it('carries the 🔒 notice, quick reference and no dead upgrade pages', () => {
    expect(html).toContain('BMC documentation note');
    expect(html).toContain('"quick":[');
    for (const dead of DEAD_PAGES) expect(html).not.toContain(dead);
    const data = buildPlanExport(doc, NOW);
    expect(data.quick.some((r) => r.lock)).toBe(true);
    expect(data.quick.some((r) => !r.lock)).toBe(true);
  });

  it('cannot be broken out of by item content', () => {
    const hostile = structuredClone(doc);
    const first = hostile.plan.items[0];
    if (!first) throw new Error('no items');
    first.detail = 'x</script><script>window.pwned=1</script><!-- y';
    first.text = '<img src=x onerror="window.pwned=2">';
    const out = renderPlanHtml(hostile, NOW);
    expect((out.match(/<\/script>/g) ?? []).length).toBe(1);
    const win = open(out);
    expect((win as unknown as { pwned?: number }).pwned).toBeUndefined();
    expect(win.document.querySelector('.itxt')?.textContent).toBe(first.text);
    expect(win.document.querySelector('img')).toBeNull();
  });

  it('renders from disk and stays interactive: cycling, filters, sections, persistence', () => {
    const win = open(html);
    const d = win.document;
    const stats = planStats(doc.plan);
    expect(d.querySelector('h1')?.textContent).toBe('AMIGO Upgrade Plan — AZAMA79');
    expect(d.querySelector('#pct')?.textContent).toBe(`${stats.pct}%`);
    expect(d.querySelectorAll('.item').length).toBeGreaterThan(5); // env + risks open by default

    // Cycle a todo item: ⬜ → ✅ → ➖ → ⬜, progress follows.
    const todo = doc.plan.items.find((i) => i.status === 'todo' && i.section === 'pre_em');
    if (!todo) throw new Error('no todo item');
    click(win, d.querySelector('.sec-hdr[data-id="pre_em"]')); // sections other than env/risks start collapsed
    const btn = () => d.querySelector(`.sbtn[data-id="${todo.id}"]`);
    expect(btn()?.textContent).toBe('⬜');
    click(win, btn());
    expect(btn()?.textContent).toBe('✅');
    expect(d.querySelector(`.item[data-item="${todo.id}"]`)?.classList.contains('done')).toBe(true);
    const pctAfterDone = Number.parseInt(d.querySelector('#pct')?.textContent ?? '', 10);
    expect(pctAfterDone).toBeGreaterThan(stats.pct);
    click(win, btn());
    expect(btn()?.textContent).toBe('➖');
    click(win, btn());
    expect(btn()?.textContent).toBe('⬜');
    expect(d.querySelector('#pct')?.textContent).toBe(`${stats.pct}%`);

    // Progress is remembered in localStorage under the export's own key.
    click(win, btn());
    const key = buildPlanExport(doc, NOW).key;
    const saved = JSON.parse(win.localStorage.getItem(key) ?? '{}') as { status?: Record<string, string> };
    expect(saved.status?.[todo.id]).toBe('done');
    expect(d.querySelector('.stamp')?.textContent).toContain('progress saved in this browser');

    // A second open of the same file picks the saved progress up.
    const again = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/export.html', beforeParse(w) {
      w.localStorage.setItem(key, JSON.stringify(saved));
    } });
    const w2 = again.window as unknown as Win;
    click(w2, w2.document.querySelector('.sec-hdr[data-id="pre_em"]'));
    expect(w2.document.querySelector(`.sbtn[data-id="${todo.id}"]`)?.textContent).toBe('✅');
    expect(w2.document.querySelector('.stamp')?.textContent).toContain('progress saved in this browser');

    // Filters and section toggles.
    click(win, d.querySelector('.fbtn[data-id="blockers"]'));
    const shown = Array.from(d.querySelectorAll('.item[data-item]')).map((el) => el.getAttribute('data-item'));
    const blockers = doc.plan.items.filter((i) => i.risk === 'blocker' && i.status === 'todo' && i.id !== todo.id).map((i) => i.id);
    expect(shown.sort()).toEqual(blockers.sort());
    click(win, d.querySelector('.fbtn[data-id="all"]'));
    click(win, d.querySelector('.sec-hdr[data-id="env"]'));
    expect(d.querySelector('.sec[data-sec="env"] .sec-body')).toBeNull();
    click(win, d.querySelector('.sec-hdr[data-id="env"]'));
    expect(d.querySelector('.sec[data-sec="env"] .sec-body')).not.toBeNull();

    // Details expand to the command block and references.
    const withCmd = doc.plan.items.find((i) => i.cmd !== '' && i.section === 'env') ?? doc.plan.items.find((i) => i.cmd !== '');
    if (!withCmd) throw new Error('no item with a command');
    const sec = withCmd.section;
    if (!d.querySelector(`.sec[data-sec="${sec}"] .sec-body`)) click(win, d.querySelector(`.sec-hdr[data-id="${sec}"]`));
    click(win, d.querySelector(`.dtgl[data-id="${withCmd.id}"]`));
    expect(d.querySelector(`.item[data-item="${withCmd.id}"] pre.cmd`)?.textContent).toBe(withCmd.cmd);

    // Reset returns to the exported statuses.
    click(win, d.querySelector('.fbtn[data-act="reset"]'));
    expect(btn()?.textContent).toBe('⬜');
    expect(win.localStorage.getItem(key)).toBeNull();
  });

  it('names the file after the case and export time', () => {
    expect(planHtmlFileName(doc, new Date(2026, 8, 1, 15, 30))).toBe('azama79-0042-upgrade-plan-20260901-1530.html');
  });
});

describe('standalone runbook export (FR-24b / FR-25)', () => {
  const doc = planCase();

  it('embeds steps with statuses, timestamps, rendered content and the rollback procedure', () => {
    const exec = structuredClone(doc);
    const gate0 = exec.runbook.steps.find((s) => s.id === 'gate0');
    const a1 = exec.runbook.steps.find((s) => s.id === 'a1');
    if (!gate0 || !a1) throw new Error('fixture runbook missing gate0/a1');
    gate0.status = 'done';
    gate0.started_at = gate0.completed_at = '2026-09-01T10:00:00Z';
    a1.status = 'active';
    a1.started_at = '2026-09-01T10:05:00Z';
    const data = buildRunbookExport(exec, NOW);
    expect(data.steps.map((s) => s.id)).toEqual(exec.runbook.steps.map((s) => s.id));
    expect(data.steps.find((s) => s.id === 'gate0')).toMatchObject({ st: 'done', completed: '2026-09-01T10:00:00Z' });
    expect(data.steps.find((s) => s.id === 'a1')).toMatchObject({ st: 'active', started: '2026-09-01T10:05:00Z' });
    expect(data.window_minutes).toBe(480);
    expect(data.steps.filter((s) => s.cmd !== '').length).toBeGreaterThan(5);
    expect(data.rollback.length).toBeGreaterThan(5);
    expect(data.rollback.join('\n')).toContain('RESTORE DATABASE');
    expect(data.rollback.join('\n')).not.toContain('pg_restore');
    const html = renderRunbookHtml(exec, NOW);
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/i);
    for (const dead of DEAD_PAGES) expect(html).not.toContain(dead);
    expect(html).toContain('BMC documentation note');
  });

  it('runs offline with sequential locking, gate checklists and timestamps', () => {
    const win = open(renderRunbookHtml(doc, NOW));
    const d = win.document;
    const total = runbookStats(doc.runbook).total;
    expect(d.querySelector('h1')?.textContent).toBe('Execution Runbook — AZAMA79');
    expect(d.querySelectorAll('.tile')[0]?.textContent).toContain(`0/${total}`);

    // Gate 0 is current; GO is locked until every check is ticked.
    const gate0 = () => d.querySelector('.gate[data-step="gate0"]');
    expect(gate0()?.classList.contains('cur')).toBe(true);
    const go = () => gate0()?.querySelector('button[data-act="pass"]') as HTMLButtonElement | null;
    expect(go()?.disabled).toBe(true);
    expect(tickAll(win, '.gate[data-step="gate0"]')).toBeGreaterThan(0);
    expect(go()?.disabled).toBe(false);
    click(win, go());
    expect(gate0()?.classList.contains('passed')).toBe(true);
    expect(gate0()?.querySelector('.gate-ok')?.textContent).toContain('GO');

    // Step 01 is now current and expanded; step 02 is locked.
    const a1 = () => d.querySelector('.step[data-step="a1"]');
    expect(a1()?.getAttribute('aria-current')).toBe('step');
    click(win, d.querySelector('.step[data-step="a2"] button[data-act="dt"]'));
    const a2Start = d.querySelector('.step[data-step="a2"] button[data-act="start"]') as HTMLButtonElement | null;
    expect(a2Start?.disabled).toBe(true);
    // Even with the disabled attribute stripped (stale DOM, devtools), the
    // action itself must refuse: locking lives in the rules, not the button.
    if (a2Start) a2Start.disabled = false;
    click(win, a2Start);
    expect(d.querySelector('.step[data-step="a2"]')?.classList.contains('pending')).toBe(true);
    click(win, a1()?.querySelector('button[data-act="start"]'));
    expect(a1()?.classList.contains('active')).toBe(true);
    expect(a1()?.querySelector('.st-ts')?.textContent).toContain('started');
    click(win, a1()?.querySelector('button[data-act="complete"]'));
    expect(a1()?.classList.contains('done')).toBe(true);
    expect(a1()?.querySelector('.st-ts')?.textContent).toMatch(/done .*took 1m vs est/);
    expect(d.querySelectorAll('.tile')[0]?.textContent).toContain(`1/${total}`);

    // Progress persists under the export's key.
    const key = buildRunbookExport(doc, NOW).key;
    const saved = JSON.parse(win.localStorage.getItem(key) ?? '{}') as { steps?: Record<string, { st: string }> };
    expect(saved.steps?.gate0?.st).toBe('done');
    expect(saved.steps?.a1?.st).toBe('done');
  });

  it('Gate 1 starts the outage clock in the exported file', () => {
    const exec = structuredClone(doc);
    for (const s of exec.runbook.steps) {
      if (s.phase !== 'A') break;
      s.status = 'done';
      s.started_at = s.completed_at = '2026-09-01T10:00:00Z';
    }
    const win = open(renderRunbookHtml(exec, NOW));
    const d = win.document;
    const gate1 = () => d.querySelector('.gate[data-step="gate1"]');
    expect(gate1()?.classList.contains('cur')).toBe(true);
    expect(d.querySelectorAll('.tile')[1]?.textContent).toContain('—');
    tickAll(win, '.gate[data-step="gate1"]');
    click(win, gate1()?.querySelector('button[data-act="pass"]'));
    expect(gate1()?.classList.contains('passed')).toBe(true);
    expect(d.querySelectorAll('.tile')[1]?.textContent).toContain('0:00');
    expect(d.querySelectorAll('.tile')[2]?.textContent).toContain('8:00');
    const key = buildRunbookExport(exec, NOW).key;
    const saved = JSON.parse(win.localStorage.getItem(key) ?? '{}') as { outage_started_at?: string };
    expect(typeof saved.outage_started_at).toBe('string');
    // The PONR gate must be confirmed before the first EM upgrade step.
    const ponr = d.querySelector('.gate.ponr');
    expect(ponr).not.toBeNull();
  });

  it('fires the over-budget warning offline when the window cannot fit the remaining work', () => {
    const exec = structuredClone(doc);
    exec.runbook.window_minutes = 240;
    exec.runbook.outage_started_at = new Date(Date.now() - 230 * 60000).toISOString();
    const win = open(renderRunbookHtml(exec, NOW));
    const alert = win.document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('exceeds the remaining window');
    expect(win.document.querySelectorAll('.tile')[2]?.classList.contains('bad') || win.document.querySelectorAll('.tile')[2]?.querySelector('.bad')).toBeTruthy();

    const calm = structuredClone(doc);
    calm.runbook.outage_started_at = new Date(Date.now() - 10 * 60000).toISOString();
    expect(open(renderRunbookHtml(calm, NOW)).document.querySelector('[role="alert"]')).toBeNull();
  });

  it('names the file after the case and export time', () => {
    expect(runbookHtmlFileName(doc, new Date(2026, 8, 1, 15, 30))).toBe('azama79-0042-runbook-20260901-1530.html');
  });
});

describe('JSON exports (FR-24c / FR-24d)', () => {
  const doc = planCase();

  it('case.json round-trips losslessly', () => {
    const back = parseCaseFile(serializeCaseFile(doc));
    expect(back).toEqual(doc);
  });

  it('wizard answers carry confirmations + answers only', () => {
    const out = buildWizardAnswers(doc, NOW);
    expect(Object.keys(out).sort()).toEqual(['answers', 'case', 'confirmations', 'environment', 'exported_at', 'format', 'schema_version', 'source'].sort());
    expect(out.confirmations).toEqual(doc.confirmations);
    expect(out.answers).toEqual(doc.answers);
    expect(out.environment.em_host).toBe('SBCMEM31W');
    expect(out.environment.server_host).toBe('SBCMSR01W');
    expect(out.case).toEqual({ name: 'AZAMA79', case_number: '0042', target_version: '9.0.22' });
    const text = serializeWizardAnswers(doc, NOW);
    expect(text).not.toContain('"facts"');
    expect(text).not.toContain('"plan"');
    expect(text).not.toContain('"activity_log"');
    expect(WIZARD_ANSWERS_FILE).toBe('amigo-wizard-answers.json');
  });
});

describe('export helpers', () => {
  it('escapes HTML and script-closing sequences', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    const s = jsonForScript({ t: '</script><!-- ' });
    expect(s).not.toContain('</script>');
    expect(s).not.toContain('<!--');
    expect(s).not.toContain(' ');
    expect(JSON.parse(s)).toEqual({ t: '</script><!-- ' });
  });
});
