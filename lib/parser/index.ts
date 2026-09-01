import type { ArchiveRecord, EnvironmentFacts, Fact } from '@/lib/types/case';
import { Archive, type ArchiveFormat, type SectionStatus } from '@/lib/parser/archive';
import { FactSet } from '@/lib/parser/facts';
import { derive } from '@/lib/parser/derive';
import { buildGaps } from '@/lib/parser/gaps';
import {
  x01InstalledVersions,
  x02CheckConfig,
  x03Hostname,
  x04Os,
  x05Db,
  x06Sysprm,
  x07EmHa,
} from '@/lib/parser/extractors/identity';
import { x11Ajf, x12Disk } from '@/lib/parser/extractors/capacity';
import {
  x13Java,
  x14Apigtw,
  x15GdForward,
  x16Ctmldnrs,
  x17Ldap,
  x18SslPolicies,
} from '@/lib/parser/extractors/config';
import { x20Aapi, x22Agents, x23Agstat } from '@/lib/parser/extractors/agents';
import { x27Av } from '@/lib/parser/extractors/environment';

/**
 * TypeScript port of the HCU extractor set (spec X01–X27), running fully
 * client-side (PRD FR-6).
 *
 * reference/amigo_prefill.py is the reference implementation and
 * fixtures/facts.reference.json is the compatibility contract — the golden test
 * diffs this module's output against it field-for-field.
 */

export const PARSER_VERSION = '0.1.0';
export const PARSER_IMPLEMENTED = true;

type Extractor = (ar: Archive, F: FactSet) => void;

/** Registration order determines the emitted fact order; it matches the reference. */
const SERVER_EXTRACTORS: [string, Extractor][] = [
  ['x01_installed_versions', x01InstalledVersions],
  ['x03_hostname', x03Hostname],
  ['x04_os', x04Os],
  ['x05_db', x05Db],
  ['x06_sysprm', x06Sysprm],
  ['x11_ajf', x11Ajf],
  ['x12_disk', x12Disk],
  ['x14_apigtw', x14Apigtw],
  ['x15_gd_forward', x15GdForward],
  ['x16_ctmldnrs', x16Ctmldnrs],
  ['x18_ssl_policies', x18SslPolicies],
  ['x22_agents', x22Agents],
  ['x23_agstat', x23Agstat],
  ['x27_av', x27Av],
];

const EM_EXTRACTORS: [string, Extractor][] = [
  ['x02_check_config', x02CheckConfig],
  ['x03_hostname', x03Hostname],
  ['x04_os', x04Os],
  ['x07_em_ha', x07EmHa],
  ['x12_disk', x12Disk],
  ['x13_java', x13Java],
  ['x17_ldap', x17Ldap],
  ['x20_aapi', x20Aapi],
  ['x27_av', x27Av],
];

/** A non-fatal problem, surfaced in the intake diagnostics panel (FR-8). */
export interface ParseWarning {
  file: string;
  extractor: string;
  message: string;
}

/** Per-archive detail the facts schema does not carry, for the UI only. */
export interface ArchiveDiagnostics {
  file: string;
  format: ArchiveFormat;
  product: string;
  host: string | null;
  collectorOk: boolean | null;
  sections: SectionStatus[];
  memberCount: number;
  extractorsRun: number;
}

export interface ParseResult extends EnvironmentFacts {
  warnings: ParseWarning[];
  diagnostics: ArchiveDiagnostics[];
}

export interface ArchiveInput {
  fileName: string;
  bytes: Uint8Array;
}

/**
 * Parse one or more HCU archives into the canonical facts model.
 *
 * Extractors never invent (CLAUDE.md): an unreadable or unrecognised source
 * yields no fact at all, and each extractor is isolated so one failure cannot
 * crash intake — it becomes a warning instead.
 */
export function parseArchives(inputs: ArchiveInput[]): ParseResult {
  const F = new FactSet();
  const warnings: ParseWarning[] = [];
  const diagnostics: ArchiveDiagnostics[] = [];
  const metaArchives: ArchiveRecord[] = [];

  for (const input of inputs) {
    let ar: Archive;
    try {
      ar = new Archive(input.fileName, input.bytes);
    } catch (e) {
      warnings.push({
        file: input.fileName,
        extractor: 'archive',
        message: `could not open archive: ${message(e)}`,
      });
      continue;
    }

    const extractors =
      ar.product === 'Server' ? SERVER_EXTRACTORS : ar.product === 'EM' ? EM_EXTRACTORS : [];

    if (extractors.length === 0) {
      warnings.push({
        file: input.fileName,
        extractor: 'product-detect',
        message:
          'product could not be detected from the directory signature — no extractors were run',
      });
    }

    for (const [name, fn] of extractors) {
      try {
        fn(ar, F);
      } catch (e) {
        warnings.push({ file: input.fileName, extractor: name, message: message(e) });
      }
    }

    if (ar.collectorOk === false) {
      const failed = ar.sections.filter((s) => !s.ok).map((s) => s.section);
      warnings.push({
        file: input.fileName,
        extractor: 'collector-log',
        message:
          failed.length > 0
            ? `collection did not complete — section${failed.length === 1 ? '' : 's'} ${failed.join(', ')} ${failed.length === 1 ? 'is' : 'are'} UNCOLLECTED, not missing; re-run the collector`
            : 'collection did not complete — treat absent values as UNCOLLECTED and re-run the collector',
      });
    } else if (ar.collectorOk === null) {
      warnings.push({
        file: input.fileName,
        extractor: 'collector-log',
        message:
          'no hcu_logs/collector.log in this archive — collection integrity could not be verified',
      });
    }

    metaArchives.push({
      file: ar.fileName,
      product: ar.product === 'Unknown' ? 'Agent' : ar.product,
      host: ar.host ?? '',
      collector_log_ok: ar.collectorOk ?? false,
    });

    diagnostics.push({
      file: ar.fileName,
      format: ar.format,
      product: ar.product,
      host: ar.host,
      collectorOk: ar.collectorOk,
      sections: ar.sections,
      memberCount: ar.names.length,
      extractorsRun: extractors.length,
    });
  }

  derive(F);
  const gaps = buildGaps();
  const facts = F.data;

  return {
    meta: {
      parser_version: PARSER_VERSION,
      generated_at: new Date().toISOString(),
      archives: metaArchives,
    },
    facts,
    gaps,
    summary: summarize(facts, gaps.length),
    warnings,
    diagnostics,
  };
}

function summarize(facts: Record<string, Fact>, gapsTotal: number) {
  const values = Object.values(facts);
  return {
    facts_total: values.length,
    exact: values.filter((f) => f.confidence === 'EXACT').length,
    derived: values.filter((f) => f.confidence === 'DERIVED').length,
    inferred_confirm: values.filter((f) => f.confidence === 'INFERRED').length,
    gaps_total: gapsTotal,
  };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
