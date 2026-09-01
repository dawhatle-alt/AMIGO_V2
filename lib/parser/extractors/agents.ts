import type { Archive } from '@/lib/parser/archive';
import type { FactSet } from '@/lib/parser/facts';
import { dictReader, splitLines, splitWhitespace } from '@/lib/parser/text';

/** Add-ons & agents — X20, X22, X23. */

/** X20 — Automation API job types installed under EM/AAPI/<ABAnnn>/<vN>/. */
export function x20Aapi(ar: Archive, F: FactSet): void {
  const joined = ar.names.join('\n');
  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  for (const m of joined.matchAll(/AAPI\/(ABA\d+)\/(v\d+)\//g)) {
    const key = `${m[1]}\u0000${m[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push([m[1] as string, m[2] as string]);
    }
  }
  if (pairs.length === 0) return;

  pairs.sort((a, b) => (a[0] === b[0] ? cmp(a[1], b[1]) : cmp(a[0], b[0])));
  const types: Record<string, string[]> = {};
  for (const [name, ver] of pairs) {
    (types[name] ??= []).push(ver);
  }
  F.add('em.ai_jobtypes', types, 'EXACT', `${ar.fileName}:EM/AAPI/`, 'X20');
}

/** X22 — agent fleet inventory from the Server's discovery table. */
export function x22Agents(ar: Archive, F: FactSet): void {
  const hit = ar.read('AG_TBL_CTM/AGENT_DISCOVERY.csv');
  if (!hit) return;
  F.add('agents', dictReader(hit.text), 'EXACT', ar.src(hit.member), 'X22');
}

/** X23 — agents the Server currently reports as unavailable. */
export function x23Agstat(ar: Archive, F: FactSet): void {
  const hit = ar.read('FNC_INFO/ctm_agstat.txt');
  if (!hit) return;
  const unavailable = splitLines(hit.text)
    .slice(1)
    .filter((l) => l.toLowerCase().includes('unavailable'))
    .map((l) => splitWhitespace(l)[0])
    .filter((n): n is string => n !== undefined);
  F.add('agents_unavailable', unavailable, 'EXACT', ar.src(hit.member), 'X23');
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
