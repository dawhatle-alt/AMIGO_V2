import type { Ref } from '@/lib/types/case';
import { isLoginRequired } from '@/lib/plan/refs';

/**
 * Shared pieces for the standalone HTML exports (PRD FR-24/FR-25).
 *
 * An export is one self-contained file: inline CSS, inline data, inline
 * script, no external requests. It must open by double-click from disk in a
 * clean browser, so nothing here may reference the app, a CDN or a font URL.
 * The look mirrors reference/prototypes/amigo-plan-AZAMA79.html.
 */

export const EXPORT_VERSION = '1';

/** HTML-escape text for element content and attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Serialize data for an inline <script> block. A literal `<` inside a string
 * could form `</script>` or `<!--` and end the block early, and U+2028/2029
 * are line terminators in older JS engines, so all of them are escaped (JSON
 * accepts the resulting escapes, so the embedded object parses unchanged).
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Compact ref shape embedded in the exports. */
export interface ExportRef {
  l: string;
  u: string;
  lock: boolean;
}

export function exportRef(ref: Ref): ExportRef {
  return { l: ref.label, u: ref.url, lock: isLoginRequired(ref) };
}

/** Filename-safe timestamp, e.g. 20260901-1530. */
export function stampFor(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}

/** Design tokens ported from the approved prototype and tailwind.config.ts. */
export const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;background:#f5f6f8;color:#1f2937;line-height:1.5;-webkit-font-smoothing:antialiased}
.mono,.cmd,.sec-cnt,.prog-pct,.tile-v,.stamp,.chip{font-family:'IBM Plex Mono',ui-monospace,Consolas,monospace}
.ctr{max-width:820px;margin:0 auto;padding:24px 16px}
.hdr{display:flex;align-items:flex-start;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.hdr-icon{width:44px;height:44px;background:#2563eb;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;flex-shrink:0}
.hdr h1{font-size:19px;font-weight:700;color:#111827}
.hdr p{font-size:13px;color:#6b7280}
.hdr .grow{flex:1;min-width:240px}
.stamp{font-size:11px;color:#9ca3af;margin-top:4px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin-bottom:16px}
.prog{background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin-bottom:16px}
.prog-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.prog-lbl{font-size:13px;font-weight:600;color:#374151}
.prog-pct{font-size:26px;font-weight:700;color:#2563eb}
.bar{width:100%;height:12px;background:#e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:10px}
.bar-fill{height:100%;background:#2563eb;border-radius:6px;transition:width .5s}
.bar-fill.ok{background:#059669}
.stats{display:flex;gap:16px;font-size:12px;flex-wrap:wrap;color:#4b5563}
.s-bl{color:#dc2626;font-weight:600}.s-wa{color:#d97706;font-weight:600}.s-mu{color:#9ca3af}
.filters{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
.fbtn,.btn{padding:6px 14px;border-radius:8px;font-size:12px;font-weight:500;border:none;cursor:pointer;background:#f3f4f6;color:#4b5563;transition:all .15s;font-family:inherit}
.fbtn:hover,.btn:hover{background:#e5e7eb}.fbtn.on{background:#2563eb;color:#fff}
.btn.pri{background:#2563eb;color:#fff}.btn.pri:hover{background:#1d4ed8}
.btn.ok{background:#059669;color:#fff;font-weight:700}.btn.ok:hover{background:#047857}
.btn.danger{background:#dc2626;color:#fff;font-weight:700}.btn.danger:hover{background:#b91c1c}
.btn.ghost{background:#fff;border:1px solid #d1d5db;color:#374151}.btn.ghost:hover{background:#f9fafb}
.btn:disabled,.fbtn:disabled{background:#e5e7eb;color:#9ca3af;cursor:not-allowed}
.right{margin-left:auto}
.sec{border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;background:#fff;margin-bottom:12px}
.sec-hdr{width:100%;display:flex;align-items:center;gap:12px;padding:16px;cursor:pointer;border:none;background:none;text-align:left;transition:background .15s;font-family:inherit;font-size:inherit;color:inherit}
.sec-hdr:hover{background:#f9fafb}
.sec-title{flex:1;font-size:14px;font-weight:600;color:#111827}
.sec-cnt{font-size:12px;color:#9ca3af}
.chev{color:#9ca3af;font-size:14px;width:16px;transition:transform .2s;display:inline-block}
.chev.open{transform:rotate(90deg)}
.sec-body{border-top:1px solid #f3f4f6}
.item{border-bottom:1px solid #f9fafb;padding:12px 16px;display:flex;gap:12px;align-items:flex-start}
.item:last-child{border-bottom:none}.item.done,.item.na{opacity:.55}
.sbtn{flex-shrink:0;width:24px;height:24px;border:none;cursor:pointer;background:none;padding:0;margin-top:1px;font-size:20px;line-height:1}
.ic{flex:1;min-width:0}
.itxt{font-size:13px;color:#1f2937}.item.done .itxt{text-decoration:line-through;color:#9ca3af}.item.na .itxt{color:#9ca3af}
.badge{font-size:11px;font-weight:500;padding:2px 8px;border-radius:10px;display:inline-block;margin-left:6px;vertical-align:middle;white-space:nowrap}
.b-bl{background:#fee2e2;color:#991b1b}.b-wa{background:#fef3c7;color:#92400e}
.chip{font-size:10px;padding:2px 8px;border-radius:10px;border:1px solid #bfdbfe;background:#eff6ff;color:#1e40af;margin-left:6px;vertical-align:middle;white-space:nowrap}
.dtgl{font-size:12px;color:#2563eb;cursor:pointer;border:none;background:none;padding:0;margin-top:6px;font-weight:500;display:flex;align-items:center;gap:4px;font-family:inherit}
.dtgl:hover{color:#1e40af}
.dp{margin-top:8px;padding:12px;border-radius:8px;border:1px solid;font-size:12px}
.dp-bl{background:#fef2f2;border-color:#fca5a5}.dp-wa{background:#fffbeb;border-color:#fcd34d}.dp-cl{background:#ecfdf5;border-color:#a7f3d0}.dp-nt{background:#f9fafb;border-color:#e5e7eb}
.dtxt{color:#374151;line-height:1.6;margin-bottom:8px;white-space:pre-wrap}
.ch,.rh{display:flex;align-items:center;gap:6px;margin-bottom:6px;font-weight:600;font-size:12px;color:#4b5563}
.cmdwrap{position:relative;margin-bottom:10px}
.cmd{background:#1a1a2e;color:#4ade80;padding:12px;padding-right:64px;border-radius:8px;font-size:11px;white-space:pre-wrap;overflow-x:auto;line-height:1.6}
.copy{position:absolute;top:8px;right:8px;font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid #374151;background:#111827;color:#d1d5db;cursor:pointer;font-family:inherit}
.copy:hover{background:#1f2937}
.rl{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#1d4ed8;text-decoration:none;padding:2px 0;margin-right:14px}
.rl:hover{color:#1e3a8a;text-decoration:underline}
.refs{display:flex;flex-direction:column;gap:2px}
.notice{padding:16px;border-radius:14px;font-size:12px;margin-top:20px}
.n-am{background:#fffbeb;border:1px solid #fde68a;color:#92400e}
.n-bl{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;margin-top:10px}
.n-rd{background:#fef2f2;border:1px solid #fca5a5;color:#991b1b}
.notice strong{display:block;margin-bottom:4px}
.notice a{color:inherit;font-weight:500}
.qlinks{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px}
.qlinks a{display:flex;align-items:center;gap:4px;font-size:12px;color:#1e40af;text-decoration:none}
.qlinks a:hover{text-decoration:underline}
.footer{text-align:center;font-size:11px;color:#9ca3af;margin-top:20px;padding:10px}
.hint{font-size:11px;color:#6b7280;margin-top:8px}
@media(max-width:600px){.qlinks{grid-template-columns:1fr}.stats{flex-direction:column;gap:4px}}
@media print{.fbtn,.btn,.copy{display:none}.sec,.card{break-inside:avoid}}
`;

export function footerHtml(caseName: string): string {
  return `<div class="footer">Generated by AMIGO Concierge · BMC Control-M · Case: ${escapeHtml(caseName)}</div>`;
}

/** Runtime helpers shared by both inline scripts (plain ES5-ish JS, no template literals). */
export const RUNTIME_JS = String.raw`
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function refLinks(refs){if(!refs||!refs.length)return '';return '<div class="refs">'+refs.map(function(r){return '<a class="rl" href="'+esc(r.u)+'" target="_blank" rel="noopener noreferrer"'+(r.lock?' title="Requires BMC Support Central login"':'')+'>↗ '+esc(r.l)+'</a>'}).join('')+'</div>'}
function cmdBlock(cmd){return '<div class="cmdwrap"><pre class="cmd">'+esc(cmd)+'</pre><button type="button" class="copy" data-copy="1">Copy</button></div>'}
function loadState(key,fallback){try{var raw=localStorage.getItem(key);if(raw){var v=JSON.parse(raw);if(v&&typeof v==='object')return v}}catch(e){}return fallback}
function saveState(key,state){try{localStorage.setItem(key,JSON.stringify(state))}catch(e){}}
function clearState(key){try{localStorage.removeItem(key)}catch(e){}}
function download(name,text,type){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:type||'text/plain'}));a.download=name;document.body.appendChild(a);a.click();a.remove()}
function copyText(btn){var pre=btn.parentNode.querySelector('pre');var t=pre?pre.textContent:'';var done=function(){btn.textContent='Copied';setTimeout(function(){btn.textContent='Copy'},1200)};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){fallbackCopy(t);done()})}else{fallbackCopy(t);done()}}
function fallbackCopy(t){var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove()}
function fmtTime(iso){if(!iso)return '';var d=new Date(iso);return isNaN(d.getTime())?iso:d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function lockNotice(){return '<div class="notice n-am"><strong>🔒 BMC documentation note</strong>Links marked 🔒 require a <a href="https://www.bmc.com/support" target="_blank" rel="noopener noreferrer">BMC Support Central login</a> — sign in first, then open the link. Patch and bulletin links (docs.bmc.com) are public.</div>'}
function quickRef(refs,tail){return '<div class="notice n-bl"><strong>Quick reference</strong><div class="qlinks">'+refs.map(function(r){return '<a href="'+esc(r.u)+'" target="_blank" rel="noopener noreferrer"'+(r.lock?' title="Requires BMC Support Central login"':'')+'>↗ '+esc(r.l)+'</a>'}).join('')+'</div>'+(tail?'<p style="margin-top:10px;color:#2563eb">'+tail+'</p>':'')+'</div>'}
function fmtStamp(iso){if(!iso)return '';var d=new Date(iso);return isNaN(d.getTime())?iso:d.toLocaleString()}
`;

/** Wrap body + data + script into a complete standalone document. */
export function standaloneDocument(opts: { title: string; dataVar: string; data: unknown; script: string; extraCss?: string }): string {
  return (
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    `<title>${escapeHtml(opts.title)}</title>\n<style>${BASE_CSS}${opts.extraCss ?? ''}</style>\n</head>\n<body>\n<div class="ctr" id="app"></div>\n` +
    // Everything runs inside a function scope: a top-level `var status`, `name`
    // or `open` would otherwise bind to the same-named window property in real
    // browsers (window.status coerces to a string, silently dropping state).
    `<script>\n(function(){\nvar ${opts.dataVar}=${jsonForScript(opts.data)};\n${RUNTIME_JS}\n${opts.script}\n})();\n</script>\n</body>\n</html>\n`
  );
}
