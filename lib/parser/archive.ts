import { unzipSync, gunzipSync, strFromU8 } from 'fflate';
import type { Product } from '@/lib/types/case';
import { splitLines } from '@/lib/parser/text';
import { looksLikeTar, untar } from '@/lib/parser/tar';

/**
 * One HCU (`ctm_data_collector`) archive.
 *
 * Port of the `Archive` class in reference/amigo_prefill.py. Member lookup is
 * SUFFIX-based because the root folder prefix varies between collections
 * (PRD FR-4); member order follows the archive's own entry order, which some
 * extractors depend on (X18).
 */

export type DetectedProduct = Product | 'Unknown';

/** Container formats HCU collections arrive in (PRD FR-4, spec §3). */
export type ArchiveFormat = 'zip' | 'tar' | 'tar.gz';

export class ArchiveFormatError extends Error {}

/** The collector-log precheck outcome for one section (PRD FR-5). */
export interface SectionStatus {
  section: string;
  ok: boolean;
}

export class Archive {
  readonly fileName: string;
  readonly names: string[];
  readonly product: DetectedProduct;
  /** Set by X03 when the hostname file is read. */
  host: string | null = null;

  /** true = log says the collection completed; false = it did not; null = no log. */
  readonly collectorOk: boolean | null;
  /** Per-section outcomes parsed from the collector log, for the diagnostics panel. */
  readonly sections: SectionStatus[];
  /** Container format this archive was read from. */
  readonly format: ArchiveFormat;

  private readonly files: Record<string, Uint8Array>;

  constructor(fileName: string, bytes: Uint8Array) {
    this.fileName = fileName;
    const opened = openContainer(bytes);
    this.format = opened.format;
    this.files = opened.files;
    // Directory entries carry no content and are not addressable members.
    this.names = Object.keys(this.files).filter((n) => !n.endsWith('/'));
    this.product = this.detectProduct();

    const log = this.read('hcu_logs/collector.log');
    this.collectorOk = log ? /completed successfully/i.test(log.text) : null;
    this.sections = log ? parseSections(log.text) : [];
  }

  private detectProduct(): DetectedProduct {
    const joined = this.names.join('\n');
    if (joined.includes('check_config_results') || /(^|\/)EM\//m.test(joined)) return 'EM';
    if (joined.includes('CNF_INFO/')) return 'Server';
    if (joined.includes('AG_CNF/')) return 'Agent';
    return 'Unknown';
  }

  /** First member whose path ends with `suffix`, in archive entry order. */
  find(suffix: string): string | null {
    return this.names.find((n) => n.endsWith(suffix)) ?? null;
  }

  /** All members matching `pattern`, in archive entry order. */
  findAll(pattern: RegExp): string[] {
    return this.names.filter((n) => pattern.test(n));
  }

  readMember(member: string): string {
    const bytes = this.files[member];
    if (!bytes) throw new Error(`member not found: ${member}`);
    return strFromU8(bytes);
  }

  /** Read the first member matching `suffix`, or null when absent. */
  read(suffix: string): { text: string; member: string } | null {
    const member = this.find(suffix);
    if (member === null) return null;
    return { text: this.readMember(member), member };
  }

  /** `<archive.zip>:<member path>` — the provenance format used on every fact. */
  src(member: string): string {
    return `${this.fileName}:${member}`;
  }

  /** Provenance for a fact derived from a file's ABSENCE. */
  absence(note: string): string {
    return `${this.fileName}:${note}`;
  }
}

/**
 * Opens a container by MAGIC BYTES, not by file extension — collections get
 * renamed in transit, and a mislabelled archive should still parse.
 * Member order is preserved in both paths (X18 depends on it).
 */
function openContainer(bytes: Uint8Array): {
  format: ArchiveFormat;
  files: Record<string, Uint8Array>;
} {
  if (isZip(bytes)) {
    return { format: 'zip', files: unzipSync(bytes) };
  }

  if (isGzip(bytes)) {
    const inflated = gunzipSync(bytes);
    if (!looksLikeTar(inflated)) {
      throw new ArchiveFormatError(
        'gzip archive does not contain a tar — expected a .tar.gz HCU collection',
      );
    }
    return { format: 'tar.gz', files: tarFiles(inflated) };
  }

  if (looksLikeTar(bytes)) {
    return { format: 'tar', files: tarFiles(bytes) };
  }

  throw new ArchiveFormatError(
    'unrecognised archive format — expected .zip, .tar or .tar.gz',
  );
}

function tarFiles(bytes: Uint8Array): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of untar(bytes)) {
    files[entry.name] = entry.bytes;
  }
  return files;
}

/** Local file header, empty archive, or spanned archive signature. */
function isZip(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const [a, b, c, d] = [bytes[0], bytes[1], bytes[2], bytes[3]];
  return a === 0x50 && b === 0x4b && (c === 3 || c === 5 || c === 7) && (d === 4 || d === 6 || d === 8);
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** Lines look like: `... INFO  section <name> ... OK` (or FAILED). */
function parseSections(log: string): SectionStatus[] {
  const out: SectionStatus[] = [];
  for (const line of splitLines(log)) {
    const m = /section\s+(\S+)\s*\.\.\.\s*(\w+)/i.exec(line);
    if (m && m[1] && m[2]) {
      out.push({ section: m[1], ok: /^ok$/i.test(m[2]) });
    }
  }
  return out;
}
