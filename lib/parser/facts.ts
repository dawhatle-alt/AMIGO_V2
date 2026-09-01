import type { Confidence, Fact } from '@/lib/types/case';

/**
 * Ordered fact collector. Port of the `Facts` class in
 * reference/amigo_prefill.py — insertion order is preserved so the emitted
 * `facts` object matches the reference output's key order.
 */
export class FactSet {
  readonly data: Record<string, Fact> = {};

  add(
    key: string,
    value: unknown,
    confidence: Confidence,
    source: string,
    extractor: string,
    raw?: string,
  ): void {
    const fact: Fact = { value, confidence, source, extractor };
    if (raw !== undefined && raw !== null) {
      // Reference: raw.strip()[:300]
      fact.raw = raw.trim().slice(0, 300);
    }
    this.data[key] = fact;
  }

  get(key: string): unknown {
    return this.data[key]?.value;
  }
}
