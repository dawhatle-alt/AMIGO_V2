import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gunzipSync, gzipSync, strToU8 } from 'fflate';
import { parseArchives } from '@/lib/parser';
import { looksLikeTar, untar } from '@/lib/parser/tar';
import type { EnvironmentFacts } from '@/lib/types/case';

/**
 * Container-format parity (PRD FR-4 / spec §3).
 *
 * Windows HCU collections arrive as .zip, UNIX ones as .tar.gz/.tgz/.tar.
 * Whichever container carries them, the facts must come out identical apart
 * from the archive filename recorded in each `source` string. The same
 * guarantee is enforced on the Python reference by
 * `fixtures/build_tar_fixtures.py` plus the reference parser's own run.
 */

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');

function read(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(FIXTURES, name)));
}

function loadReference(): EnvironmentFacts {
  return JSON.parse(
    readFileSync(path.join(FIXTURES, 'facts.reference.json'), 'utf8'),
  ) as EnvironmentFacts;
}

/** Replaces the container extension in provenance strings so formats compare. */
function normalise<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value).replace(/hcu_(SBCMEM31W|SBCMSR01W)\.(zip|tar\.gz|tar)/g, 'hcu_$1.ARCHIVE'),
  ) as T;
}

describe('tar.gz fixtures parse identically to their zip twins', () => {
  const fromZip = parseArchives([
    { fileName: 'hcu_SBCMEM31W.zip', bytes: read('hcu_SBCMEM31W.zip') },
    { fileName: 'hcu_SBCMSR01W.zip', bytes: read('hcu_SBCMSR01W.zip') },
  ]);
  const fromTarGz = parseArchives([
    { fileName: 'hcu_SBCMEM31W.tar.gz', bytes: read('hcu_SBCMEM31W.tar.gz') },
    { fileName: 'hcu_SBCMSR01W.tar.gz', bytes: read('hcu_SBCMSR01W.tar.gz') },
  ]);

  it('parses the tar.gz pair without warnings', () => {
    expect(fromTarGz.warnings).toEqual([]);
  });

  it('reports the container format it detected', () => {
    expect(fromZip.diagnostics.map((d) => d.format)).toEqual(['zip', 'zip']);
    expect(fromTarGz.diagnostics.map((d) => d.format)).toEqual(['tar.gz', 'tar.gz']);
  });

  it('produces byte-identical facts, ignoring the container extension', () => {
    expect(normalise(fromTarGz.facts)).toEqual(normalise(fromZip.facts));
  });

  it('emits facts in the same order from either container', () => {
    expect(Object.keys(fromTarGz.facts)).toEqual(Object.keys(fromZip.facts));
  });

  it('still matches the golden reference through the tar path', () => {
    expect(normalise(fromTarGz.facts)).toEqual(normalise(loadReference().facts));
    expect(fromTarGz.summary).toEqual(loadReference().summary);
  });

  it('preserves member order through tar (X18 depends on it)', () => {
    expect(fromTarGz.facts['server.ssl_policies']?.value).toEqual(['site.plc', 'ac.plc']);
  });

  it('strips the leading "./" that `tar czf .` writes, keeping provenance readable', () => {
    expect(fromTarGz.facts['server.apigtw_port']?.source).toBe(
      'hcu_SBCMSR01W.tar.gz:CNF_INFO/data/api_gateway_url.dat',
    );
  });

  it('detects product and host from a tar the same way as from a zip', () => {
    expect(fromTarGz.meta.archives.map((a) => `${a.product}:${a.host}`)).toEqual([
      'EM:SBCMEM31W',
      'Server:SBCMSR01W',
    ]);
  });
});

describe('uncompressed .tar', () => {
  it('parses an uncompressed tar identically', () => {
    const tarBytes = gunzipSync(read('hcu_SBCMSR01W.tar.gz'));
    const result = parseArchives([{ fileName: 'hcu_SBCMSR01W.tar', bytes: tarBytes }]);
    expect(result.diagnostics[0]?.format).toBe('tar');
    expect(result.warnings).toEqual([]);
    expect(result.facts['server.version']?.value).toBe('9.0.21.302');
  });
});

describe('format detection is by magic bytes, not file extension', () => {
  it('parses a tar.gz that has been renamed to .zip', () => {
    const result = parseArchives([
      { fileName: 'mislabelled.zip', bytes: read('hcu_SBCMSR01W.tar.gz') },
    ]);
    expect(result.diagnostics[0]?.format).toBe('tar.gz');
    expect(result.facts['server.host']?.value).toBe('SBCMSR01W');
  });

  it('parses a zip that has been renamed to .tar.gz', () => {
    const result = parseArchives([
      { fileName: 'mislabelled.tar.gz', bytes: read('hcu_SBCMEM31W.zip') },
    ]);
    expect(result.diagnostics[0]?.format).toBe('zip');
    expect(result.facts['em.version']?.value).toBe('9.0.21.300');
  });

  it('warns instead of crashing on a container it cannot recognise', () => {
    const result = parseArchives([
      { fileName: 'notes.txt', bytes: strToU8('just some text, not an archive') },
    ]);
    expect(result.facts).toEqual({});
    const warning = result.warnings.find((w) => w.extractor === 'archive');
    expect(warning?.message).toContain('unrecognised archive format');
  });

  it('warns when a gzip turns out not to contain a tar', () => {
    const result = parseArchives([
      { fileName: 'log.gz', bytes: gzipSync(strToU8('plain gzipped text')) },
    ]);
    expect(result.facts).toEqual({});
    expect(result.warnings[0]?.message).toContain('does not contain a tar');
  });
});

describe('tar reader edge cases', () => {
  it('recognises a tar by its ustar magic', () => {
    expect(looksLikeTar(gunzipSync(read('hcu_SBCMEM31W.tar.gz')))).toBe(true);
    expect(looksLikeTar(read('hcu_SBCMEM31W.zip'))).toBe(false);
  });

  it('reads GNU long names (paths beyond the 100-byte header field)', () => {
    const longName = `SBCMSR01W_collection_2026/${'nested_directory/'.repeat(8)}CNF_INFO/data/config.dat`;
    expect(longName.length).toBeGreaterThan(100);
    const tar = buildTar([
      { name: '././@LongLink', body: longName + '\0', typeflag: 'L' },
      { name: 'ignored-short-name', body: 'GD_FORWARD Y\n' },
    ]);
    const entries = untar(tar);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe(longName);
  });

  it('reads PAX path records', () => {
    const longName = `pax_collection/${'deep/'.repeat(25)}OS/Network/Hostname.txt`;
    const record = `path=${longName}\n`;
    const line = `${String(record.length + String(record.length).length + 1)} ${record}`;
    const tar = buildTar([
      { name: 'PaxHeaders/0', body: line, typeflag: 'x' },
      { name: 'short', body: 'PAXHOST\n' },
    ]);
    const entries = untar(tar);
    expect(entries[0]?.name).toBe(longName);
  });

  it('skips directory and symlink entries, keeping only readable files', () => {
    const tar = buildTar([
      { name: 'OS/', body: '', typeflag: '5' },
      { name: 'OS/link', body: '', typeflag: '2' },
      { name: 'OS/Network/Hostname.txt', body: 'REALHOST\n' },
    ]);
    const entries = untar(tar);
    expect(entries.map((e) => e.name)).toEqual(['OS/Network/Hostname.txt']);
  });

  it('stops cleanly at the end-of-archive marker', () => {
    const tar = buildTar([{ name: 'a.txt', body: 'hello' }]);
    // buildTar already appends the two zero blocks; trailing junk must be ignored.
    const padded = new Uint8Array(tar.length + 1024);
    padded.set(tar);
    expect(untar(padded).map((e) => e.name)).toEqual(['a.txt']);
  });
});

/** Minimal tar writer, used only to exercise the reader's edge cases. */
function buildTar(files: { name: string; body: string; typeflag?: string }[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const f of files) {
    const body = strToU8(f.body);
    const header = new Uint8Array(512);
    const put = (text: string, offset: number, len: number) => {
      const bytes = strToU8(text);
      header.set(bytes.subarray(0, len), offset);
    };
    put(f.name, 0, 100);
    put('0000644\0', 100, 8);
    put('0000000\0', 108, 8);
    put('0000000\0', 116, 8);
    put(body.length.toString(8).padStart(11, '0') + '\0', 124, 12);
    put('00000000000\0', 136, 12);
    header.set(strToU8('        '), 148); // checksum field blank while summing
    header[156] = (f.typeflag ?? '0').charCodeAt(0);
    put('ustar\0', 257, 6);
    put('00', 263, 2);

    let sum = 0;
    for (const b of header) sum += b;
    put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);

    blocks.push(header);
    const padded = new Uint8Array(Math.ceil(body.length / 512) * 512);
    padded.set(body);
    if (padded.length > 0) blocks.push(padded);
  }
  blocks.push(new Uint8Array(1024)); // end-of-archive

  const total = blocks.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const b of blocks) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}
