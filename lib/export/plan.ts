import type { CaseDocument, PlanItemStatus, Risk } from '@/lib/types/case';
import { SECTIONS } from '@/lib/plan/templates';
import { sectionTitle } from '@/lib/plan/generate';
import { buildPlanEnv, envSummaryLine } from '@/lib/plan/env';
import { REF } from '@/lib/plan/refs';
import { caseSlug } from '@/lib/case/emptyCase';
import { EXPORT_VERSION, exportRef, stampFor, standaloneDocument, type ExportRef } from '@/lib/export/html';

/**
 * Standalone HTML Upgrade Plan (PRD FR-24a / FR-25). Mirrors the approved
 * prototype (reference/prototypes/amigo-plan-AZAMA79.html): the plan data is
 * embedded as JSON with the statuses current at export time, and the inline
 * script keeps it interactive offline — status cycling, filters, collapsible
 * sections, copy buttons, a text download — with progress remembered in the
 * browser's localStorage under a key unique to this export.
 */

export interface PlanExportItem {
  id: string;
  text: string;
  st: PlanItemStatus;
  rk: Risk;
  dt: string;
  cmd: string;
  refs: ExportRef[];
  auto: string | null;
}

export interface PlanExportSection {
  id: string;
  title: string;
  items: PlanExportItem[];
}

export interface PlanExportData {
  v: string;
  kind: 'plan';
  /** localStorage key for progress made in the exported file. */
  key: string;
  case: { name: string; number: string; target: string };
  subtitle: string;
  generated_at: string;
  exported_at: string;
  sections: PlanExportSection[];
  quick: ExportRef[];
}

export function buildPlanExport(doc: CaseDocument, now: Date = new Date()): PlanExportData {
  const env = buildPlanEnv(doc);
  const exportedAt = now.toISOString();
  return {
    v: EXPORT_VERSION,
    kind: 'plan',
    key: `amigo-plan:${caseSlug(doc)}:${exportedAt}`,
    case: { name: doc.case.name, number: doc.case.case_number, target: doc.case.target_version },
    subtitle: envSummaryLine(env),
    generated_at: doc.plan.generated_at,
    exported_at: exportedAt,
    sections: SECTIONS.map((section) => ({
      id: section.id,
      title: sectionTitle(section.id, doc),
      items: doc.plan.items
        .filter((i) => i.section === section.id)
        .map((i) => ({
          id: i.id,
          text: i.text,
          st: i.status,
          rk: i.risk,
          dt: i.detail,
          cmd: i.cmd,
          refs: i.refs.map(exportRef),
          auto: i.autofilled_from,
        })),
    })).filter((s) => s.items.length > 0),
    quick: [REF.upgradeGuide, REF.pacTool, doc.case.target_version === '9.0.22' ? REF.patches9022 : REF.patches9021, REF.javaInstall].map(exportRef),
  };
}

export function planHtmlFileName(doc: CaseDocument, now: Date = new Date()): string {
  return `${caseSlug(doc)}-upgrade-plan-${stampFor(now)}.html`;
}

export function renderPlanHtml(doc: CaseDocument, now: Date = new Date()): string {
  const data = buildPlanExport(doc, now);
  return standaloneDocument({
    title: `AMIGO Upgrade Plan — ${data.case.name} — Control-M ${data.case.target}`,
    dataVar: 'D',
    data,
    script: PLAN_JS,
  });
}

// Plain JS with string concatenation only — no template literals, so it can
// live inside this String.raw literal verbatim.
const PLAN_JS = String.raw`
var KEY=D.key;
var UI={filter:'all',open:{env:true,risks:true},ei:{}};
var STATUS={};
D.sections.forEach(function(s){s.items.forEach(function(i){STATUS[i.id]=i.st})});
var saved=loadState(KEY,null);
var savedAt=null;
if(saved&&saved.status){Object.keys(saved.status).forEach(function(k){if(Object.prototype.hasOwnProperty.call(STATUS,k))STATUS[k]=saved.status[k]});savedAt=saved.saved_at||null}
function persist(){savedAt=new Date().toISOString();saveState(KEY,{status:STATUS,saved_at:savedAt})}
function cycle(id){if(!Object.prototype.hasOwnProperty.call(STATUS,id))return;STATUS[id]=STATUS[id]==='todo'?'done':STATUS[id]==='done'?'na':'todo';persist();render()}
function reset(){D.sections.forEach(function(s){s.items.forEach(function(i){STATUS[i.id]=i.st})});clearState(KEY);savedAt=null;render()}
function allItems(){var a=[];D.sections.forEach(function(s){a=a.concat(s.items)});return a}
function stats(){var a=allItems();var ap=0,dn=0,bl=0,wa=0,au=0;a.forEach(function(i){var st=STATUS[i.id];if(st!=='na')ap++;if(st==='done')dn++;if(i.rk==='blocker'&&st==='todo')bl++;if(i.rk==='warning'&&st==='todo')wa++;if(i.auto)au++});return{t:a.length,ap:ap,dn:dn,bl:bl,wa:wa,au:au,pct:ap?Math.round(dn/ap*100):0}}
function matches(i,f){var st=STATUS[i.id];if(f==='todo')return st==='todo';if(f==='blockers')return i.rk==='blocker'&&st==='todo';if(f==='actions')return i.rk!=='clear'&&st==='todo';return true}
function icon(st){return st==='done'?'✅':st==='na'?'➖':'⬜'}
function exportText(){var s=stats();var t='AMIGO UPGRADE PLAN — '+D.case.name+'\n'+D.subtitle+'\nExported: '+fmtStamp(D.exported_at)+' · Progress as of: '+new Date().toLocaleString()+'\nProgress: '+s.pct+'% ('+s.dn+'/'+s.ap+')\nBlockers: '+s.bl+' | Actions: '+s.wa+'\n\n🔒 Links marked 🔒 require BMC Support Central login: https://www.bmc.com/support\n\n';
D.sections.forEach(function(sec){t+=new Array(61).join('=')+'\n'+sec.title+'\n'+new Array(61).join('=')+'\n';sec.items.forEach(function(i){var st=STATUS[i.id];var r=i.rk==='blocker'?' 🔴 BLOCKER':i.rk==='warning'?' 🟡 ACTION':'';t+='\n'+icon(st)+(st==='todo'?r:'')+' '+i.text+'\n';if(i.dt)t+='   '+i.dt.split('\n').join('\n   ')+'\n';if(i.cmd)t+='   Command:\n'+i.cmd.split('\n').map(function(l){return '      '+l}).join('\n')+'\n';if(i.refs.length){t+='   References:\n';i.refs.forEach(function(r){t+='      • '+r.l+': '+r.u+'\n'})}});t+='\n'});
download('amigo-upgrade-plan-'+D.case.name.replace(/[^A-Za-z0-9]+/g,'-')+'.txt',t,'text/plain')}
function render(){var s=stats();var f=UI.filter;var h='';
h+='<div class="hdr"><div class="hdr-icon">🛡</div><div class="grow"><h1>AMIGO Upgrade Plan — '+esc(D.case.name)+'</h1><p>'+esc(D.subtitle)+(D.case.number?' · case #'+esc(D.case.number):'')+'</p><div class="stamp">Exported '+esc(fmtStamp(D.exported_at))+(D.generated_at?' · plan generated '+esc(fmtStamp(D.generated_at)):'')+(savedAt?' · progress saved in this browser '+esc(fmtStamp(savedAt)):'')+'</div></div></div>';
h+='<div class="prog"><div class="prog-top"><span class="prog-lbl">Overall progress</span><span class="prog-pct" id="pct">'+s.pct+'%</span></div><div class="bar"><div class="bar-fill'+(s.pct===100?' ok':'')+'" style="width:'+s.pct+'%"></div></div><div class="stats"><span id="counts">'+s.dn+'/'+s.ap+' items</span>'+(s.bl?'<span class="s-bl">🔴 '+s.bl+' blockers</span>':'')+(s.wa?'<span class="s-wa">🟡 '+s.wa+' actions needed</span>':'')+'<span class="s-mu">'+s.au+' auto-filled from the archive and gap answers</span></div></div>';
h+='<div class="filters">';[['all','All'],['todo','To do'],['blockers','Blockers ('+s.bl+')'],['actions','Actions ('+s.wa+')']].forEach(function(p){h+='<button type="button" class="fbtn'+(f===p[0]?' on':'')+'" data-act="filter" data-id="'+p[0]+'">'+p[1]+'</button>'});
h+='<button type="button" class="fbtn right" data-act="text">⬇ Download as text</button><button type="button" class="fbtn" data-act="reset" title="Discard the statuses changed in this browser">↺ Reset</button></div>';
D.sections.forEach(function(sec){var items=sec.items.filter(function(i){return matches(i,f)});if(f!=='all'&&!items.length)return;var dn=0,tot=0;sec.items.forEach(function(i){var st=STATUS[i.id];if(st==='done')dn++;if(st!=='na')tot++});var op=Object.prototype.hasOwnProperty.call(UI.open,sec.id)?UI.open[sec.id]:f!=='all';
h+='<div class="sec" data-sec="'+esc(sec.id)+'"><button type="button" class="sec-hdr" data-act="sec" data-id="'+esc(sec.id)+'"><span class="chev'+(op?' open':'')+'">▶</span><span class="sec-title">'+esc(sec.title)+'</span><span class="sec-cnt">'+dn+'/'+tot+'</span></button>';
if(op){h+='<div class="sec-body">';if(!items.length)h+='<div class="item"><div class="ic hint">Nothing matches this filter.</div></div>';items.forEach(function(i){var st=STATUS[i.id];var dp=i.rk==='blocker'?'dp-bl':i.rk==='warning'?'dp-wa':'dp-cl';var hd=i.dt||i.cmd||i.refs.length;var ie=UI.ei[i.id];
h+='<div class="item '+esc(st)+'" data-item="'+esc(i.id)+'"><button type="button" class="sbtn" data-act="cycle" data-id="'+esc(i.id)+'" aria-label="Status: '+esc(st)+'. Click to change." title="'+esc(st)+' — click to cycle">'+icon(st)+'</button><div class="ic"><div><span class="itxt">'+esc(i.text)+'</span>';
if(i.rk!=='clear'&&st==='todo')h+='<span class="badge '+(i.rk==='blocker'?'b-bl':'b-wa')+'">'+(i.rk==='blocker'?'Blocker':'Action needed')+'</span>';
if(i.auto)h+='<span class="chip" title="Auto-filled from '+esc(i.auto)+'">auto · '+esc(i.auto)+'</span>';
h+='</div>';
if(hd)h+='<button type="button" class="dtgl" data-act="dt" data-id="'+esc(i.id)+'">'+(ie?'▾ Hide details':'▸ Details, commands &amp; references')+'</button>';
if(ie&&hd){h+='<div class="dp '+dp+'">';if(i.dt)h+='<div class="dtxt">'+esc(i.dt)+'</div>';if(i.cmd)h+='<div class="ch">⌨ Command syntax</div>'+cmdBlock(i.cmd);if(i.refs.length)h+='<div class="rh">📖 References</div>'+refLinks(i.refs);h+='</div>'}
h+='</div></div>'});h+='</div>'}h+='</div>'});
h+=lockNotice();
h+=quickRef(D.quick,'Click a STATUS box to cycle: ⬜ To do → ✅ Done → ➖ N/A. Progress is kept in this browser; use Reset to return to the exported statuses.');
h+='<div class="footer">Generated by AMIGO Concierge · BMC Control-M · Case: '+esc(D.case.name)+'</div>';
document.getElementById('app').innerHTML=h}
document.getElementById('app').addEventListener('click',function(ev){var c=ev.target.closest('[data-copy]');if(c){copyText(c);return}var t=ev.target.closest('[data-act]');if(!t)return;var act=t.getAttribute('data-act'),id=t.getAttribute('data-id');
if(act==='cycle')cycle(id);else if(act==='sec'){var cur=Object.prototype.hasOwnProperty.call(UI.open,id)?UI.open[id]:UI.filter!=='all';UI.open[id]=!cur;render()}else if(act==='dt'){UI.ei[id]=!UI.ei[id];render()}else if(act==='filter'){UI.filter=id;render()}else if(act==='text')exportText();else if(act==='reset'){if(confirm('Reset every item to the STATUS it had when this plan was exported?'))reset()}});
render();
`;
