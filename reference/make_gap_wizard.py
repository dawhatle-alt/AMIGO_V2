#!/usr/bin/env python3
"""
make_gap_wizard.py — Stage 2 of the AMIGO Pre-Fill pipeline.

Reads environment_facts.json (from amigo_prefill.py) and generates a
self-contained HTML wizard the customer opens in any browser:
  1. Shows everything auto-filled from their HCU archive (with provenance)
  2. Asks them to confirm INFERRED items
  3. Walks them through each gap with the exact command / console path / KA
  4. Exports their answers as JSON to send back for plan generation

Usage: python make_gap_wizard.py facts.json gap-wizard.html
"""
import json, sys, html

def esc(s):
    return html.escape(str(s), quote=True)

def main():
    facts_path, out_path = sys.argv[1], sys.argv[2]
    data = json.load(open(facts_path))
    facts, gaps, meta = data["facts"], data["gaps"], data["meta"]

    em_v = facts.get("em.version", {}).get("value", "?")
    sv_v = facts.get("server.version", {}).get("value", "?")
    em_h = facts.get("em.host", {}).get("value", "?")
    sv_h = facts.get("server.host", {}).get("value", "?")
    db_t = facts.get("db.type", {}).get("value", "?")
    size = facts.get("em.size_class", {}).get("value", "?")
    s = data["summary"]

    payload = json.dumps({"facts": facts, "gaps": gaps}, ensure_ascii=False).replace("</", "<\\/")

    html_doc = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AMIGO Pre-Upgrade Wizard — {esc(em_h)} / {esc(sv_h)}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:'IBM Plex Sans',system-ui,sans-serif;background:#f5f6f8;color:#1f2937;line-height:1.5;padding-bottom:60px}}
.ctr{{max-width:820px;margin:0 auto;padding:24px 16px}}
.hdr{{display:flex;gap:12px;align-items:center;margin-bottom:6px}}
.hdr-icon{{width:44px;height:44px;background:#2563eb;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px}}
h1{{font-size:20px;font-weight:700}} .sub{{font-size:13px;color:#6b7280;margin-bottom:18px}}
.chips{{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}}
.chip{{font-size:12px;padding:5px 12px;border-radius:999px;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe}}
.stats{{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:22px}}
.stat{{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px}}
.stat p{{font-size:12px;color:#6b7280}} .stat b{{font-size:22px;font-family:'IBM Plex Mono',monospace}}
h2{{font-size:16px;font-weight:700;margin:26px 0 4px;color:#111827}}
.h2sub{{font-size:12px;color:#6b7280;margin-bottom:12px}}
.sec{{background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin-bottom:10px}}
.sec-h{{padding:12px 16px;cursor:pointer;font-size:14px;font-weight:600;display:flex;justify-content:space-between;align-items:center}}
.sec-h:hover{{background:#f9fafb}}
table{{width:100%;border-collapse:collapse;font-size:12px}}
th{{text-align:left;padding:8px 12px;background:#f3f4f6;color:#4b5563;font-weight:600}}
td{{padding:8px 12px;border-top:1px solid #f3f4f6;vertical-align:top}}
.badge{{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap}}
.b-exact{{background:#e2efda;color:#3a6d1f}} .b-derived{{background:#dbeafe;color:#1e40af}} .b-inferred{{background:#fff2cc;color:#92400e}}
.src{{font-family:'IBM Plex Mono',monospace;font-size:10px;color:#9ca3af;word-break:break-all}}
.card{{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px;margin-bottom:12px}}
.card.done{{opacity:.55;border-color:#a7d7a7}}
.card h3{{font-size:14px;margin-bottom:4px}} .why{{font-size:12px;color:#6b7280;margin-bottom:10px}}
.cmd{{background:#1a1a2e;color:#4ade80;padding:12px;border-radius:8px;font-family:'IBM Plex Mono',monospace;font-size:11px;white-space:pre-wrap;margin-bottom:8px;position:relative}}
.copy{{position:absolute;top:8px;right:8px;font-size:10px;background:#374151;color:#d1d5db;border:none;border-radius:6px;padding:3px 8px;cursor:pointer}}
.console{{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;font-size:12px;padding:10px 12px;border-radius:8px;margin-bottom:8px}}
.refs a{{display:inline-block;font-size:12px;color:#1d4ed8;margin-right:14px;margin-bottom:6px}}
textarea,input[type=text]{{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit;margin-top:6px}}
textarea:focus,input:focus{{outline:none;border-color:#2563eb}}
.btn{{border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;margin-top:8px}}
.btn-b{{background:#2563eb;color:#fff}} .btn-b:hover{{background:#1e40af}}
.btn-g{{background:#e2efda;color:#3a6d1f}} .btn-o{{background:#f3f4f6;color:#4b5563;margin-left:8px}}
.bar{{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e5e7eb;padding:10px 16px;display:flex;align-items:center;gap:14px;z-index:50}}
.pbar{{flex:1;height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden}}
.pfill{{height:100%;background:#2563eb;transition:width .4s}}
.ptext{{font-size:12px;font-family:'IBM Plex Mono',monospace;color:#4b5563;white-space:nowrap}}
.export{{background:#16a34a;color:#fff;border:none;border-radius:8px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer}}
.notice{{font-size:11px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;margin-top:16px}}
.flag{{background:#fef2f2;border:1px solid #fca5a5;border-radius:12px;padding:12px 14px;font-size:12px;color:#991b1b;margin-bottom:12px}}
</style></head><body><div class="ctr">
<div class="hdr"><div class="hdr-icon">🧭</div><div>
<h1>AMIGO Pre-Upgrade Wizard</h1>
<div class="sub">Generated from your HCU archive · {esc(meta["generated_at"])} · parser v{esc(meta["parser_version"])}</div></div></div>
<div class="chips">
<span class="chip">EM {esc(em_v)} @ {esc(em_h)}</span>
<span class="chip">Server {esc(sv_v)} @ {esc(sv_h)}</span>
<span class="chip">DB: {esc(db_t).split("(")[0].strip()}</span>
<span class="chip">Size: {esc(size)}</span></div>
<div class="stats">
<div class="stat"><p>Auto-filled from HCU</p><b style="color:#16a34a">{s["exact"] + s["derived"]}</b></div>
<div class="stat"><p>Need your confirmation</p><b style="color:#d97706">{s["inferred_confirm"]}</b></div>
<div class="stat"><p>To collect / decide</p><b style="color:#2563eb">{s["gaps_total"]}</b></div>
<div class="stat"><p>Your progress</p><b id="prog-n">0%</b></div></div>
<div id="flags"></div>
<h2>1 · Auto-filled from your environment</h2>
<div class="h2sub">These answers came straight from the archive — every value shows its source file. Nothing to do here.</div>
<div class="sec"><div class="sec-h" onclick="tgl('facts-body')"><span>View {s["exact"] + s["derived"]} extracted facts</span><span id="facts-chev">▸</span></div>
<div id="facts-body" style="display:none"><table><thead><tr><th>Fact</th><th>Value</th><th></th><th>Source</th></tr></thead><tbody id="facts-rows"></tbody></table></div></div>
<h2>2 · Please confirm</h2>
<div class="h2sub">These were inferred, not read directly — confirm or correct each one.</div>
<div id="confirms"></div>
<h2>3 · Collect &amp; decide — your walkthrough</h2>
<div class="h2sub">Work down the list. Each item shows exactly how to get the answer.</div>
<div id="gaps"></div>
<div class="notice">🔒 Links marked 🔒 require a BMC Support Central login (sign in at bmc.com/support first). When you finish, click <b>Export answers</b> and send the file back with your AMIGO case — it becomes your tailored upgrade plan.</div>
</div>
<div class="bar"><div class="pbar"><div class="pfill" id="pfill" style="width:0%"></div></div>
<span class="ptext" id="ptext">0 / 0</span>
<button class="export" onclick="exportAnswers()">⬇ Export answers</button></div>
<script>
const DATA = {payload};
const state = {{ confirms: {{}}, answers: {{}} }};
try {{ Object.assign(state, JSON.parse(localStorage.getItem('amigo_wizard') || '{{}}')); }} catch(e) {{}}
function save() {{ try {{ localStorage.setItem('amigo_wizard', JSON.stringify(state)); }} catch(e) {{}} render(); }}
function tgl(id) {{ const el = document.getElementById(id); const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  document.getElementById('facts-chev').textContent = open ? '▸' : '▾'; }}
function esc(s) {{ const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }}
function fmtVal(v) {{ if (Array.isArray(v)) return v.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join('<br>');
  if (typeof v === 'object') return esc(JSON.stringify(v)); return esc(v); }}

function render() {{
  // facts table
  let rows = '';
  const inferred = [];
  for (const [k, f] of Object.entries(DATA.facts)) {{
    if (f.confidence === 'INFERRED') {{ inferred.push([k, f]); continue; }}
    const b = f.confidence === 'EXACT' ? 'b-exact' : 'b-derived';
    rows += `<tr><td><b>${{esc(k)}}</b></td><td>${{fmtVal(f.value)}}</td>
      <td><span class="badge ${{b}}">${{f.confidence}}</span></td><td class="src">${{esc(f.source)}}</td></tr>`;
  }}
  document.getElementById('facts-rows').innerHTML = rows;

  // KA flags
  const flagEl = document.getElementById('flags');
  const ka = DATA.facts['flags.ka_000419757'];
  flagEl.innerHTML = ka && ka.value.triggered ?
    `<div class="flag">⚠ <b>KA 000419757 applies:</b> agent(s) ${{esc(ka.value.agents.join(', '))}} run RHEL 8.5+ in SSL mode — review the KA before upgrading the Server.</div>` : '';

  // confirms
  let ch = '';
  for (const [k, f] of inferred) {{
    const c = state.confirms[k];
    ch += `<div class="card ${{c ? 'done' : ''}}"><h3>${{esc(k)}}</h3>
      <div class="why">Detected: <b>${{fmtVal(f.value)}}</b> <span class="src">(${{esc(f.source)}})</span></div>
      ${{c ? `<div style="font-size:12px;color:#16a34a">✔ ${{esc(c)}}</div>` :
      `<button class="btn btn-g" onclick="state.confirms['${{k}}']='Confirmed';save()">✔ Confirm</button>
       <button class="btn btn-o" onclick="const v=prompt('Enter the correct value:');if(v){{state.confirms['${{k}}']='Corrected: '+v;save()}}">✎ Correct</button>`}}
    </div>`;
  }}
  document.getElementById('confirms').innerHTML = ch || '<div class="h2sub">Nothing to confirm.</div>';

  // gaps
  let gh = '';
  DATA.gaps.forEach((g, i) => {{
    const a = state.answers[g.id];
    gh += `<div class="card ${{a ? 'done' : ''}}">
      <h3>${{String(i + 1).padStart(2, '0')}} · ${{esc(g.question)}}</h3>
      <div class="why">${{esc(g.why || '')}}</div>
      ${{g.command ? `<div class="cmd"><button class="copy" onclick="navigator.clipboard.writeText(this.parentNode.textContent.replace('Copy',''))">Copy</button>${{esc(g.command)}}</div>` : ''}}
      ${{g.console ? `<div class="console">🖥 ${{esc(g.console)}}</div>` : ''}}
      ${{(g.refs || []).length ? `<div class="refs">${{g.refs.map(r => `<a href="${{esc(r.url)}}" target="_blank" rel="noopener">📖 ${{esc(r.label)}}</a>`).join('')}}</div>` : ''}}
      <textarea id="ta-${{g.id}}" rows="2" placeholder="Your answer / paste output here...">${{a ? esc(a) : ''}}</textarea>
      <button class="btn btn-b" onclick="const v=document.getElementById('ta-${{g.id}}').value.trim();if(v){{state.answers['${{g.id}}']=v;save()}}">Save answer</button>
    </div>`;
  }});
  document.getElementById('gaps').innerHTML = gh;

  // progress
  const total = DATA.gaps.length + inferred.length;
  const done = Object.keys(state.answers).length + Object.keys(state.confirms).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  document.getElementById('pfill').style.width = pct + '%';
  document.getElementById('ptext').textContent = `${{done}} / ${{total}}`;
  document.getElementById('prog-n').textContent = pct + '%';
}}

function exportAnswers() {{
  const out = {{ exported_at: new Date().toISOString(),
    environment: {{ em_host: '{esc(em_h)}', server_host: '{esc(sv_h)}', em_version: '{esc(em_v)}', server_version: '{esc(sv_v)}' }},
    confirmations: state.confirms, answers: state.answers }};
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], {{ type: 'application/json' }}));
  a.download = 'amigo-wizard-answers.json'; a.click();
}}
render();
</script></body></html>"""

    with open(out_path, "w") as f:
        f.write(html_doc)
    print(f"Wizard written: {out_path}")

if __name__ == "__main__":
    main()
