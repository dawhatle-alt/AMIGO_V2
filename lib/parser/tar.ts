/**
 * Minimal POSIX tar reader.
 *
 * `fflate` handles zip and gzip but has no tar support, so HCU collections
 * from UNIX hosts (`.tar.gz` / `.tgz` / `.tar`) need this. It returns members
 * in the archive's own order — X18 depends on member order, so nothing here
 * sorts.
 *
 * Handles ustar/GNU/PAX: the `prefix` field, GNU long names (`L`), PAX extended
 * headers (`x`/`g`) and GNU base-256 sizes. Non-file entries (directories,
 * links, device nodes) are skipped, matching how the zip path drops directory
 * entries.
 */

const BLOCK = 512;

export interface TarEntry {
  name: string;
  bytes: Uint8Array;
}

export class TarError extends Error {}

/** True when `bytes` carries the ustar magic at the standard header offset. */
export function looksLikeTar(bytes: Uint8Array): boolean {
  if (bytes.length < 265) return false;
  const magic = ascii(bytes, 257, 6);
  return magic.startsWith('ustar');
}

export function untar(bytes: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  // Set by a preceding GNU 'L' entry or PAX 'path=' record.
  let pendingName: string | null = null;

  while (offset + BLOCK <= bytes.length) {
    const header = bytes.subarray(offset, offset + BLOCK);
    if (isZeroBlock(header)) break; // end-of-archive marker

    const size = parseSize(header);
    const typeflag = String.fromCharCode(header[156] ?? 0).trim();
    const dataStart = offset + BLOCK;
    const dataEnd = dataStart + size;
    if (dataEnd > bytes.length) {
      throw new TarError('truncated tar archive');
    }
    const data = bytes.subarray(dataStart, dataEnd);

    if (typeflag === 'L') {
      // GNU long name: this entry's body is the next entry's full path.
      pendingName = decodeUtf8(data).replace(/\0+$/, '');
    } else if (typeflag === 'x' || typeflag === 'g') {
      const path = paxPath(decodeUtf8(data));
      if (path !== null) pendingName = path;
    } else if (typeflag === '' || typeflag === '0' || typeflag === '7') {
      // Regular file ('' is the historical NUL typeflag; '7' is contiguous).
      const name = pendingName ?? headerName(header);
      pendingName = null;
      if (name !== '' && !name.endsWith('/')) {
        entries.push({ name: normalize(name), bytes: data });
      }
    } else {
      // Directory, symlink, device, etc. — carries no addressable content.
      if (typeflag !== 'K') pendingName = null;
    }

    offset = dataEnd + padding(size);
  }

  return entries;
}

function headerName(header: Uint8Array): string {
  const name = ascii(header, 0, 100).replace(/\0.*$/, '');
  const prefix = ascii(header, 345, 155).replace(/\0.*$/, '');
  return prefix ? `${prefix}/${name}` : name;
}

/**
 * `tar czf` commonly writes paths as `./OS/Network/Hostname.txt`. Member lookup
 * is suffix-based so the prefix is harmless, but normalising keeps the `source`
 * provenance strings readable.
 */
function normalize(name: string): string {
  return name.replace(/^\.\//, '');
}

function parseSize(header: Uint8Array): number {
  const first = header[124] ?? 0;
  if ((first & 0x80) !== 0) {
    // GNU base-256 encoding for sizes that do not fit in 11 octal digits.
    let value = first & 0x7f;
    for (let i = 125; i < 136; i += 1) {
      value = value * 256 + (header[i] ?? 0);
    }
    return value;
  }
  const octal = ascii(header, 124, 12).replace(/[\0 ]/g, '');
  if (octal === '') return 0;
  const parsed = parseInt(octal, 8);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** PAX records are `"<len> <key>=<value>\n"`; only `path` concerns us. */
function paxPath(text: string): string | null {
  for (const line of text.split('\n')) {
    const m = /^\d+ path=(.*)$/.exec(line);
    if (m) return m[1] ?? null;
  }
  return null;
}

function padding(size: number): number {
  const rem = size % BLOCK;
  return rem === 0 ? 0 : BLOCK - rem;
}

function isZeroBlock(block: Uint8Array): boolean {
  for (let i = 0; i < block.length; i += 1) {
    if (block[i] !== 0) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  for (let i = start; i < start + length && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i] ?? 0);
  }
  return out;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}
