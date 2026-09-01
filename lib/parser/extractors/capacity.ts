import type { Archive } from '@/lib/parser/archive';
import type { FactSet } from '@/lib/parser/facts';
import { dictReader, splitLines } from '@/lib/parser/text';

/** Capacity — X11, X12 (X10 is emitted by X02, which owns the source file). */

/** X11 — peak Active Jobs File count across the collected window. */
export function x11Ajf(ar: Archive, F: FactSet): void {
  const hit = ar.read('report/jobs_count.csv');
  if (!hit) return;
  const counts = dictReader(hit.text)
    .map((r) => r.COUNT)
    .filter((v): v is string => typeof v === 'string' && /^\d+$/.test(v))
    .map((v) => Number(v));
  if (counts.length > 0) {
    F.add('server.ajf_peak', Math.max(...counts), 'DERIVED', ar.src(hit.member), 'X11');
  }
}

/**
 * X12 — free disk per drive, plus a flag for network/veritas filesystems.
 * Values are a snapshot at collection time, not a live reading.
 */
export function x12Disk(ar: Archive, F: FactSet): void {
  const hit = ar.read('OS/Disk/partitions.txt');
  if (!hit) return;
  const s = ar.src(hit.member);
  const p = ar.product.toLowerCase();
  const drives: { drive: string; free_gb: number }[] = [];

  for (const line of splitLines(hit.text)) {
    const dm = /Drive\s+(\w:).*?Free\s+([\d.]+)\s*GB/.exec(line);
    if (dm?.[1] && dm[2]) {
      drives.push({ drive: dm[1], free_gb: Number(dm[2]) });
    }
    const fs = /\b(nfs|vxfs)\b/i.exec(line);
    if (fs?.[1]) {
      F.add(`${p}.fs_flag`, fs[1].toUpperCase(), 'EXACT', s, 'X12');
    }
  }
  if (drives.length > 0) {
    F.add(`${p}.disk_free`, drives, 'EXACT', s, 'X12');
  }
}
