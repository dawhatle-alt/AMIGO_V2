import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseArchives } from '@/lib/parser';
import { installDateKey } from '@/lib/parser/extractors/identity';

/**
 * X01 install-date ordering.
 *
 * Windows collections write ISO dates, where string order equals date order —
 * the original fixtures never caught this. Linux collections write Mon-DD-YYYY,
 * which sorts alphabetically by month name; the plain string sort made X01
 * report a 9.0.21.300 environment (last install Aug-20-2025) as 9.0.20.207
 * (May-18-2023 merely sorts last alphabetically). fixtures/hcu_SBCMSR02L.zip
 * reproduces the real Linux archive's shape; the same fix lives in
 * reference/amigo_prefill.py — regenerate the fixture with
 * fixtures/build_realdate_fixture.py.
 */

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');

function read(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(FIXTURES, name)));
}

describe('installDateKey', () => {
  it('parses ISO dates', () => {
    expect(installDateKey('2023-07-22')).toBe('20230722');
  });

  it('parses Mon-DD-YYYY dates, case-insensitively', () => {
    expect(installDateKey('Apr-01-2025')).toBe('20250401');
    expect(installDateKey('AUG-20-2025')).toBe('20250820');
    expect(installDateKey('dec-05-2023')).toBe('20231205');
  });

  it('keys compare in true date order across both formats', () => {
    expect(installDateKey('Aug-20-2025')! > installDateKey('Apr-01-2025')!).toBe(true);
    expect(installDateKey('Feb-07-2023')! < installDateKey('May-18-2023')!).toBe(true);
    expect(installDateKey('2020-07-03')! < installDateKey('Feb-07-2023')!).toBe(true);
  });

  it('returns null for unrecognised formats — never guesses', () => {
    expect(installDateKey('July 3, 2020')).toBeNull();
    expect(installDateKey('03/07/2020')).toBeNull();
    expect(installDateKey('Xyz-01-2025')).toBeNull();
    expect(installDateKey('')).toBeNull();
  });
});

describe('real-date fixture (hcu_SBCMSR02L.zip, Linux Mon-DD-YYYY)', () => {
  const result = parseArchives([
    { fileName: 'hcu_SBCMSR02L.zip', bytes: read('hcu_SBCMSR02L.zip') },
  ]);

  it('parses cleanly as a Server archive', () => {
    expect(result.warnings).toEqual([]);
    expect(result.meta.archives[0]?.product).toBe('Server');
    expect(result.meta.archives[0]?.host).toBe('SBCMSR02L');
  });

  it('reports the version of the LAST-INSTALLED package, not the alphabetical last', () => {
    // Aug-20-2025 is the newest install; a string sort would land on May-18-2023
    // and report 9.0.20.207.
    expect(result.facts['server.version']?.value).toBe('9.0.21.300');
  });

  it('reports the latest fix pack / patch by date', () => {
    expect(result.facts['server.fixpack']?.value).toBe('PACTV.9.0.21.302');
  });

  it('emits patch history in true chronological order', () => {
    const history = result.facts['server.patch_history']?.value as { install_date: string }[];
    expect(history.map((r) => r.install_date)).toEqual([
      'Jul-03-2020',
      'Feb-07-2023',
      'May-18-2023',
      'Apr-15-2024',
      'Feb-05-2025',
      'Apr-01-2025',
      'Aug-20-2025',
    ]);
  });
});

describe('fallback when a date is unrecognised', () => {
  it('reverts to the plain string sort for the whole table', () => {
    const table = [
      'Package     Platform  PackageDate  InstallDate  Version     Type',
      'AAA.9.0.20  windows   2020-01-01   weird-date   9.0.20.000  Full',
      'BBB.9.0.21  windows   2024-01-01   Apr-01-2025  9.0.21.000  Fixpack',
    ].join('\n');
    const bytes = zipSync({
      'CNF_INFO/versions/installed-versions.txt': strToU8(table + '\n'),
      'hcu_logs/collector.log': strToU8('INFO Collection completed successfully\n'),
    });
    const result = parseArchives([{ fileName: 'mixed.zip', bytes }]);
    // String order: 'Apr-01-2025' < 'weird-date', so AAA sorts last.
    expect(result.facts['server.version']?.value).toBe('9.0.20.000');
    expect(result.warnings).toEqual([]);
  });
});
