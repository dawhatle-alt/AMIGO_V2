import type { CaseDocument, Risk, RunbookPhase, RunbookStepStatus, RunbookStepType } from '@/lib/types/case';
import { buildPlanEnv, envSummaryLine } from '@/lib/plan/env';
import { PHASES, rollbackTarget } from '@/lib/runbook/templates';
import { rollbackProcedure, stepContent } from '@/lib/runbook/engine';
import { caseSlug } from '@/lib/case/emptyCase';
import { EXPORT_VERSION, exportRef, stampFor, standaloneDocument, type ExportRef } from '@/lib/export/html';

/**
 * Standalone HTML Execution Runbook (PRD FR-24b / FR-25). Embeds the steps
 * with their statuses and timestamps at export time plus the rendered step
 * content, and re-implements the runbook rules in the inline script so it
 * runs offline exactly like the app: sequential locking, Gate 1 starts the
 * outage clock, the over-budget warning, the always-present rollback panel.
 * The advisor is not available in the exported file (it needs the app's
 * /api/chat route), so the card says where to find it instead.
 */

export interface RunbookExportStep {
  id: string;
  phase: RunbookPhase;
  type: RunbookStepType;
  title: string;
  est: number;
  st: RunbookStepStatus;
  started: string | null;
  completed: string | null;
  risk: Risk;
  cmd: string;
  expect: string;
  verify: string;
  fail: string;
  refs: ExportRef[];
  checks: string[];
  note: string;
}

export interface RunbookExportData {
  v: string;
  kind: 'runbook';
  key: string;
  case: { name: string; number: string; target: string };
  envLine: string;
  exported_at: string;
  window_minutes: number | null;
  outage_started_at: string | null;
  rollback: string[];
  rollbackTarget: string;
  dbRestore: string;
  phases: { id: RunbookPhase; name: string }[];
  steps: RunbookExportStep[];
}

export function buildRunbookExport(doc: CaseDocument, now: Date = new Date()): RunbookExportData {
  const env = buildPlanEnv(doc);
  const exportedAt = now.toISOString();
  return {
    v: EXPORT_VERSION,
    kind: 'runbook',
    key: `amigo-runbook:${caseSlug(doc)}:${exportedAt}`,
    case: { name: doc.case.name, number: doc.case.case_number, target: doc.case.target_version },
    envLine: envSummaryLine(env),
    exported_at: exportedAt,
    window_minutes: doc.runbook.window_minutes,
    outage_started_at: doc.runbook.outage_started_at,
    rollback: rollbackProcedure(doc),
    rollbackTarget: rollbackTarget(env),
    dbRestore: env.db.family === 'mssql' ? 'RESTORE DATABASE' : env.db.family === 'postgres' ? 'pg_restore' : env.db.family === 'oracle' ? 'Data Pump' : 'restore',
    phases: PHASES.map((p) => ({ id: p.id, name: p.name })),
    steps: doc.runbook.steps.map((s) => {
      const c = stepContent(s, doc, env);
      return {
        id: s.id,
        phase: s.phase,
        type: s.type,
        title: s.title,
        est: s.est_min,
        st: s.status,
        started: s.started_at,
        completed: s.completed_at,
        risk: c.risk,
        cmd: c.cmd,
        expect: c.expect,
        verify: c.verify,
        fail: c.fail,
        refs: c.refs.map(exportRef),
        checks: c.checks,
        note: c.note,
      };
    }),
  };
}

export function runbookHtmlFileName(doc: CaseDocument, now: Date = new Date()): string {
  return `${caseSlug(doc)}-runbook-${stampFor(now)}.html`;
}

export function renderRunbookHtml(doc: CaseDocument, now: Date = new Date()): string {
  const data = buildRunbookExport(doc, now);
  return standaloneDocument({
    title: `AMIGO Execution Runbook — ${data.case.name} — Control-M ${data.case.target}`,
    dataVar: 'D',
    data,
    script: RUNBOOK_JS,
    extraCss: RUNBOOK_CSS,
  });
}

const RUNBOOK_CSS = `
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}
.tile{background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px}
.tile-l{font-size:11px;color:#6b7280}.tile-v{font-size:20px;font-weight:700;color:#1f2937;margin-top:2px}
.tile-v.pri{color:#2563eb}.tile-v.bad{color:#dc2626}
.rb{margin-top:12px;border:1px solid #fca5a5;background:#fef2f2;border-radius:12px;padding:12px}
.rb-t{font-size:13px;font-weight:700;color:#991b1b;display:flex;align-items:center;gap:8px}
.rb-t .btn{margin-left:auto}
.rb-s{font-size:12px;color:#7f1d1d;margin-top:4px}
.rb-l{font-family:'IBM Plex Mono',ui-monospace,Consolas,monospace;font-size:11px;color:#7f1d1d;white-space:pre-wrap;line-height:1.6;margin-top:6px}
.alert{margin-top:12px;display:flex;gap:8px;align-items:center;border:1px solid #fca5a5;background:#fef2f2;color:#991b1b;border-radius:12px;padding:12px;font-size:12px;font-weight:500}
.warn{margin-top:12px;border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:10px;padding:8px 12px;font-size:12px}
.ph{display:flex;align-items:center;gap:8px;margin:18px 0 8px}
.ph-id{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9ca3af}
.ph-n{font-size:13px;font-weight:600;color:#1f2937}.ph-e{margin-left:auto;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:11px;color:#9ca3af}
.gate{border:2px solid #e5e7eb;background:#f9fafb;border-radius:12px;padding:14px;margin-bottom:8px;opacity:.6}
.gate.cur{border-color:#fbbf24;background:#fffbeb;opacity:1}.gate.cur.ponr{border-color:#ef4444;background:#fef2f2}
.gate.passed{border-color:#6ee7b7;background:#ecfdf5;opacity:1}.gate.passed.ponr{border-color:#fecaca;background:#fef2f2;opacity:.7}
.gate-t{font-size:13px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px}.gate.ponr .gate-t{color:#991b1b}
.gate-ok{margin-left:auto;font-size:11px;font-weight:500;color:#047857}.gate.ponr .gate-ok{color:#b91c1c}
.gate-n{font-size:12px;color:#4b5563;margin-top:4px}.gate.ponr .gate-n{color:#7f1d1d}
.chk{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#1f2937;margin-top:6px;cursor:pointer}
.chk input{margin-top:3px;accent-color:#2563eb}
.acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.step{border:1px solid #e5e7eb;background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;gap:12px;opacity:.8}
.step.cur,.step.active{border-color:#2563eb;box-shadow:0 1px 2px rgba(0,0,0,.05);opacity:1}
.step.done,.step.na{opacity:.6}
.st-ic{font-size:18px;line-height:1;padding-top:2px;width:22px;text-align:center}
.st-h{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.st-n{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:11px;font-weight:700;color:#9ca3af}
.st-t{font-size:13px;font-weight:500;color:#111827}.step.done .st-t{text-decoration:line-through;color:#9ca3af}
.st-e{margin-left:auto;font-size:11px;color:#9ca3af}
.st-ts{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:11px;color:#6b7280;margin-top:2px}
.over{color:#d97706}
.kv{font-size:12px;color:#374151;margin-top:6px}.kv b{color:#6b7280;font-weight:600}
.failb{margin-top:6px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:8px;padding:8px;font-size:12px}
.sev{margin-top:20px;border:1px solid #bfdbfe;background:#eff6ff;color:#1e40af;border-radius:14px;padding:16px;font-size:12px}
.sev strong{display:block;margin-bottom:4px}
@media(max-width:600px){.tiles{grid-template-columns:1fr 1fr}}
`;

const RUNBOOK_JS = String.raw`
var KEY=D.key;
var ST={};D.steps.forEach(function(s){ST[s.id]={st:s.st,started:s.started,completed:s.completed}});
var outage=D.outage_started_at;
var UI={open:{},checks:{},rollback:false};
var savedAt=null;
var saved=loadState(KEY,null);
if(saved&&saved.steps){Object.keys(saved.steps).forEach(function(k){if(ST[k])ST[k]=saved.steps[k]});if(saved.outage_started_at!==undefined)outage=saved.outage_started_at;savedAt=saved.saved_at||null}
function persist(){savedAt=new Date().toISOString();saveState(KEY,{steps:ST,outage_started_at:outage,saved_at:savedAt})}
function reset(){D.steps.forEach(function(s){ST[s.id]={st:s.st,started:s.started,completed:s.completed}});outage=D.outage_started_at;UI.checks={};clearState(KEY);savedAt=null;render()}
function fin(id){var s=ST[id].st;return s==='done'||s==='na'}
function currentId(){for(var i=0;i<D.steps.length;i++){if(!fin(D.steps[i].id))return D.steps[i].id}return null}
function canAct(id){return currentId()===id}
function byId(id){for(var i=0;i<D.steps.length;i++){if(D.steps[i].id===id)return D.steps[i]}return null}
function stats(){var total=0,done=0,rem=0,tot=0;D.steps.forEach(function(s){if(s.type!=='step')return;total++;tot+=s.est;if(fin(s.id))done++;else rem+=s.est});var complete=D.steps.length>0&&D.steps.every(function(s){return fin(s.id)});return{total:total,done:done,pct:total?Math.round(done/total*100):0,rem:rem,tot:tot,complete:complete}}
function clock(){var st=stats();var started=outage?new Date(outage).getTime():NaN;var running=!isNaN(started);var el=running?Math.max(0,Math.floor((Date.now()-started)/60000)):0;var win=D.window_minutes;var remn=running&&win!==null?win-el:null;return{running:running,elapsed:el,window:win,remaining:remn,over:remn!==null&&!st.complete&&remn<st.rem,exceeded:remn!==null&&remn<=0}}
function fmtClock(m){m=Math.max(0,Math.round(m));return Math.floor(m/60)+':'+('0'+(m%60)).slice(-2)}
function took(s){var x=ST[s.id];if(!x.started||!x.completed)return null;var ms=new Date(x.completed).getTime()-new Date(x.started).getTime();return isNaN(ms)?null:Math.max(1,Math.round(ms/60000))}
function stepNo(id){var n=0;for(var i=0;i<D.steps.length;i++){if(D.steps[i].type==='step'){n++;if(D.steps[i].id===id)return n}}return 0}
function pad2(n){return ('0'+n).slice(-2)}
function phaseEst(p){var e=0;D.steps.forEach(function(s){if(s.phase===p&&s.type==='step')e+=s.est});return e}
function start(id){var s=byId(id);if(!s||s.type!=='step'||ST[id].st!=='pending'||!canAct(id))return;ST[id].st='active';ST[id].started=new Date().toISOString();persist();render()}
function complete(id){var s=byId(id);if(!s||s.type!=='step'||ST[id].st!=='active')return;ST[id].st='done';ST[id].completed=new Date().toISOString();persist();render()}
function skip(id){var s=byId(id);if(!s||s.type!=='step'||fin(id)||!canAct(id))return;ST[id].st='na';ST[id].completed=new Date().toISOString();persist();render()}
function pass(id){var s=byId(id);if(!s||s.type==='step'||ST[id].st==='done'||!canAct(id))return;var now=new Date().toISOString();ST[id].st='done';ST[id].started=now;ST[id].completed=now;if(id==='gate1'&&!outage)outage=now;persist();render()}
function exportText(){var s=stats(),c=clock();var t='AMIGO EXECUTION RUNBOOK — '+D.case.name+'\n'+D.envLine+'\nExported: '+fmtStamp(D.exported_at)+' · Progress as of: '+new Date().toLocaleString()+'\nProgress: '+s.done+'/'+s.total+' steps · Outage started: '+(outage?fmtStamp(outage):'not started')+' · Window: '+(D.window_minutes!==null?fmtClock(D.window_minutes):'not set')+'\n\n';
D.phases.forEach(function(p){var steps=D.steps.filter(function(x){return x.phase===p.id});if(!steps.length)return;t+=new Array(61).join('=')+'\nPHASE '+p.id+' — '+p.name+' (~'+phaseEst(p.id)+' min)\n'+new Array(61).join('=')+'\n';steps.forEach(function(x){var st=ST[x.id];var m=st.st==='done'?'✅':st.st==='na'?'➖':st.st==='active'?'▶️':'⬜';var lbl=x.type==='step'?pad2(stepNo(x.id))+' ':x.type==='gate'?'GATE ':'PONR ';t+='\n'+m+' '+lbl+x.title+(x.type==='step'?' (est '+x.est+'m)':'')+'\n';if(st.started)t+='   started '+fmtStamp(st.started)+'\n';if(st.completed)t+='   '+(st.st==='na'?'skipped':'done')+' '+fmtStamp(st.completed)+(took(x)!==null?' · took '+took(x)+'m':'')+'\n';if(x.cmd)t+='   Run:\n'+x.cmd.split('\n').map(function(l){return '      '+l}).join('\n')+'\n';if(x.expect)t+='   Expect: '+x.expect+'\n';if(x.verify)t+='   Verify: '+x.verify+'\n';if(x.fail)t+='   If it fails: '+x.fail+'\n'});t+='\n'});
t+=new Array(61).join('=')+'\nROLLBACK — back to '+D.rollbackTarget+'\n'+new Array(61).join('=')+'\n'+D.rollback.join('\n')+'\n';
download('amigo-runbook-'+D.case.name.replace(/[^A-Za-z0-9]+/g,'-')+'.txt',t,'text/plain')}
function tile(l,v,cls){return '<div class="tile"><div class="tile-l">'+esc(l)+'</div><div class="tile-v'+(cls?' '+cls:'')+'">'+esc(v)+'</div></div>'}
function gateCard(s,cur){var st=ST[s.id];var passed=st.st==='done';var ponr=s.type==='ponr';var checks=UI.checks[s.id]||[];var all=s.checks.every(function(_,i){return !!checks[i]});var h='<div class="gate'+(ponr?' ponr':'')+(passed?' passed':cur?' cur':'')+'" data-step="'+esc(s.id)+'"'+(cur?' aria-current="step"':'')+'>';
h+='<div class="gate-t">'+(ponr?'⛔':passed?'🏁':'🚩')+' '+esc(s.title)+(passed?'<span class="gate-ok">'+(ponr?'Confirmed':'GO')+' · '+esc(fmtTime(st.completed))+'</span>':'')+'</div>';
if(s.note)h+='<div class="gate-n">'+esc(s.note)+'</div>';
if(!passed&&!ponr&&s.checks.length){s.checks.forEach(function(c,i){h+='<label class="chk"><input type="checkbox" data-check="'+esc(s.id)+'" data-i="'+i+'"'+(checks[i]?' checked':'')+(cur?'':' disabled')+'> '+esc(c)+'</label>'})}
if(!passed){h+='<div class="acts"><button type="button" class="btn '+(ponr?'danger':'ok')+'" data-act="pass" data-id="'+esc(s.id)+'"'+(cur&&(ponr||all)?'':' disabled')+'>'+(ponr?'Backups verified — proceed past the point of no return':'Confirm GO')+'</button></div>'}
return h+'</div>'}
function stepCard(s,cur){var st=ST[s.id];var done=st.st==='done',na=st.st==='na',active=st.st==='active';var tk=took(s);var over=tk!==null&&s.est>0&&tk>s.est;var ex=Object.prototype.hasOwnProperty.call(UI.open,s.id)?UI.open[s.id]:(cur||active);
var h='<div class="step '+esc(st.st)+(cur?' cur':'')+'" data-step="'+esc(s.id)+'"'+(cur?' aria-current="step"':'')+'><div class="st-ic">'+(done?'✅':na?'➖':active?'▶️':'⬜')+'</div><div class="ic">';
h+='<div class="st-h"><span class="st-n">'+pad2(stepNo(s.id))+'</span><span class="st-t">'+esc(s.title)+'</span>'+(s.risk!=='clear'&&!done&&!na?'<span class="badge '+(s.risk==='blocker'?'b-bl':'b-wa')+'">'+(s.risk==='blocker'?'Critical':'Caution')+'</span>':'')+'<span class="st-e">⏱ '+s.est+'m</span></div>';
if(st.started||st.completed){h+='<div class="st-ts">'+(st.started?'started '+esc(fmtTime(st.started)):'')+(st.completed?' · '+(na?'skipped':'done')+' '+esc(fmtTime(st.completed)):'')+(tk!==null?'<span'+(over?' class="over"':'')+'> · took '+tk+'m vs est '+s.est+'m</span>':'')+'</div>'}
h+='<button type="button" class="dtgl" data-act="dt" data-id="'+esc(s.id)+'">'+(ex?'▾ Hide details':'▸ Show details')+'</button>';
if(ex){h+='<div class="dp dp-nt">';if(s.cmd)h+='<div class="ch">⌨ Run</div>'+cmdBlock(s.cmd);if(s.expect)h+='<div class="kv"><b>Expect:</b> '+esc(s.expect)+'</div>';if(s.verify)h+='<div class="kv"><b>Verify:</b> '+esc(s.verify)+'</div>';if(s.fail)h+='<div class="failb"><b>If it fails:</b> '+esc(s.fail)+'</div>';if(s.refs.length)h+='<div style="margin-top:8px">'+refLinks(s.refs)+'</div>';
h+='<div class="acts">';if(st.st==='pending')h+='<button type="button" class="btn pri" data-act="start" data-id="'+esc(s.id)+'"'+(cur?'':' disabled')+'>Start step</button>';if(active)h+='<button type="button" class="btn ok" data-act="complete" data-id="'+esc(s.id)+'">Mark complete</button>';if(!done&&!na)h+='<button type="button" class="btn" data-act="skip" data-id="'+esc(s.id)+'"'+(cur?'':' disabled')+'>N/A</button>';h+='</div></div>'}
return h+'</div></div>'}
function render(){var s=stats(),c=clock(),cur=currentId();var h='';
h+='<div class="hdr"><div class="hdr-icon">🚩</div><div class="grow"><h1>Execution Runbook — '+esc(D.case.name)+'</h1><p>'+esc(D.envLine)+(D.case.number?' · case #'+esc(D.case.number):'')+'</p><div class="stamp">Exported '+esc(fmtStamp(D.exported_at))+(savedAt?' · progress saved in this browser '+esc(fmtStamp(savedAt)):'')+'</div></div></div>';
h+='<div class="card">';
h+='<div class="rb"><div class="rb-t">🛡 Rollback / fallback — back to '+esc(D.rollbackTarget)+'<button type="button" class="btn ghost" data-act="rollback">'+(UI.rollback?'Hide rollback':'Rollback')+'</button></div>';
if(UI.rollback){D.rollback.forEach(function(l){h+='<div class="rb-l">'+esc(l)+'</div>'})}else{h+='<div class="rb-s">'+esc((D.rollback[0]||'')+' '+(D.rollback[1]||''))+' Open the panel for the '+esc(D.dbRestore)+' syntax and the full procedure.</div>'}
h+='</div>';
h+='<div class="tiles">'+tile('Progress',s.done+'/'+s.total,'pri')+tile('Outage elapsed',c.running?fmtClock(c.elapsed):'—')+tile(c.window!==null?'Window left (of '+fmtClock(c.window)+')':'Window left',c.remaining!==null?fmtClock(c.remaining):'—',(c.over||c.exceeded)?'bad':'')+tile('Est. work left',fmtClock(s.rem))+'</div>';
if(c.window===null)h+='<div class="warn">⏱ No outage window budget was recorded when this runbook was exported — the clock counts up only. Answer the downtime window gap in AMIGO Concierge and export again to get a countdown.</div>';
if(c.over)h+='<div class="alert" role="alert">⚠️ '+(c.exceeded?'The outage window has been used up — '+fmtClock(s.rem)+' of estimated work remains. Decide on rollback now.':'Estimated remaining work ('+fmtClock(s.rem)+') exceeds the remaining window ('+fmtClock(c.remaining)+'). Consider the rollback decision now, not later.')+'</div>';
h+='<div class="bar" style="margin-top:14px;margin-bottom:0"><div class="bar-fill'+(s.complete?' ok':'')+'" style="width:'+s.pct+'%"></div></div>';
h+='<div class="filters" style="margin:12px 0 0"><button type="button" class="fbtn" data-act="text">⬇ Download progress as text</button><button type="button" class="fbtn" data-act="reset" title="Discard the progress made in this browser">↺ Reset</button></div>';
h+='</div>';
D.phases.forEach(function(p){var steps=D.steps.filter(function(x){return x.phase===p.id});if(!steps.length)return;h+='<div class="ph"><span class="ph-id">Phase '+esc(p.id)+'</span><span class="ph-n">'+esc(p.name)+'</span><span class="ph-e">~'+phaseEst(p.id)+' min</span></div>';steps.forEach(function(x){h+=x.type==='step'?stepCard(x,cur===x.id):gateCard(x,cur===x.id)})});
h+='<div class="sev"><strong>During the upgrade window</strong>If a problem occurs in production, open a NEW Severity 1 case — do not raise the AMIGO case severity. The AI advisor is available in AMIGO Concierge (not in this exported file); it does not replace BMC Support for production emergencies.</div>';
h+=lockNotice();
h+='<div class="footer">Generated by AMIGO Concierge · BMC Control-M · Case: '+esc(D.case.name)+'</div>';
document.getElementById('app').innerHTML=h}
var app=document.getElementById('app');
app.addEventListener('click',function(ev){var c=ev.target.closest('[data-copy]');if(c){copyText(c);return}var t=ev.target.closest('[data-act]');if(!t||t.disabled)return;var act=t.getAttribute('data-act'),id=t.getAttribute('data-id');
if(act==='start')start(id);else if(act==='complete')complete(id);else if(act==='skip')skip(id);else if(act==='pass')pass(id);else if(act==='dt'){var s=byId(id);var cur=Object.prototype.hasOwnProperty.call(UI.open,id)?UI.open[id]:(currentId()===id||ST[id].st==='active');UI.open[id]=!cur;render()}else if(act==='rollback'){UI.rollback=!UI.rollback;render()}else if(act==='text')exportText();else if(act==='reset'){if(confirm('Reset every step to the state it had when this runbook was exported?'))reset()}});
app.addEventListener('change',function(ev){var t=ev.target;if(!t||!t.getAttribute||!t.getAttribute('data-check'))return;var id=t.getAttribute('data-check'),i=parseInt(t.getAttribute('data-i'),10);var s=byId(id);if(!s)return;var arr=UI.checks[id]||s.checks.map(function(){return false});arr=arr.slice();arr[i]=!arr[i];UI.checks[id]=arr;render()});
setInterval(render,15000);
render();
`;
