import type { Archive } from '@/lib/parser/archive';
import type { FactSet } from '@/lib/parser/facts';

/** External environment — X27. */

/**
 * Process-name signatures for antivirus / monitoring / EDR products.
 * Ported from AV_SIGNATURES in reference/amigo_prefill.py. Extend here, not in
 * components — a new signature is a data change, not a code change.
 */
export const AV_SIGNATURES: Record<string, string> = {
  whatsupgold: 'WhatsUp Gold (monitoring)',
  msmpeng: 'Microsoft Defender (antivirus)',
  csfalcon: 'CrowdStrike Falcon (EDR)',
  mcafee: 'McAfee (antivirus)',
  solarwinds: 'SolarWinds (monitoring)',
  sentinelone: 'SentinelOne (EDR)',
  nessus: 'Nessus (scanner)',
  zabbix: 'Zabbix (monitoring)',
};

/**
 * X27 — AV / monitoring detection from the process list. INFERRED: a matching
 * process name is evidence the product is present, not proof of what it scans,
 * so the TSA confirms and the exclusions gap still gets asked.
 */
export function x27Av(ar: Archive, F: FactSet): void {
  const hit = ar.read('OS/Processes/Processes.txt');
  if (!hit) return;
  const lower = hit.text.toLowerCase();
  const found = [
    ...new Set(
      Object.entries(AV_SIGNATURES)
        .filter(([sig]) => lower.includes(sig))
        .map(([, label]) => label),
    ),
  ].sort();
  if (found.length > 0) {
    F.add(`${ar.product.toLowerCase()}.av_monitoring`, found, 'INFERRED', ar.src(hit.member), 'X27');
  }
}
