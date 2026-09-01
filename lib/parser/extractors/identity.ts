import type { Archive } from '@/lib/parser/archive';
import type { FactSet } from '@/lib/parser/facts';
import { dictReader, pyRepr, splitLines } from '@/lib/parser/text';

/** Identity & versions — X01–X05 (spec §5). */

interface VersionRow extends Record<string, string> {
  package: string;
  platform: string;
  package_date: string;
  install_date: string;
  version: string;
  type: string;
}

const VERSION_COLUMNS = [
  'package',
  'platform',
  'package_date',
  'install_date',
  'version',
  'type',
] as const;

/** X01 — installed-versions table → server version, fix pack, patch history. */
export function x01InstalledVersions(ar: Archive, F: FactSet): void {
  const hit = ar.read('CNF_INFO/versions/installed-versions.txt');
  if (!hit) return;

  const rows: VersionRow[] = [];
  for (const line of splitLines(hit.text).slice(1)) {
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length >= 6) {
      const row = {} as VersionRow;
      VERSION_COLUMNS.forEach((col, i) => {
        row[col] = parts[i] ?? '';
      });
      rows.push(row);
    }
  }
  if (rows.length === 0) return;

  // Stable sort by install_date, as the reference does.
  rows.sort((a, b) => (a.install_date < b.install_date ? -1 : a.install_date > b.install_date ? 1 : 0));
  const s = ar.src(hit.member);
  const latest = rows[rows.length - 1] as VersionRow;

  F.add('server.patch_history', rows, 'EXACT', s, 'X01');
  F.add('server.version', latest.version, 'EXACT', s, 'X01', pyRepr(latest));

  const fps = rows.filter((r) => ['fixpack', 'patch'].includes(r.type.toLowerCase()));
  const lastFp = fps[fps.length - 1];
  if (lastFp) {
    F.add('server.fixpack', lastFp.package, 'EXACT', s, 'X01');
  }
}

/** X02 (+ X10 capacity) — latest check_config report → EM version, home, sizing. */
export function x02CheckConfig(ar: Archive, F: FactSet): void {
  const reports = [...ar.findAll(/check_config_report_\d+\.json$/)].sort();
  const member = reports[reports.length - 1];
  if (!member) return;

  const data = JSON.parse(ar.readMember(member)) as {
    version?: unknown;
    location?: unknown;
    production_size?: { jobs?: unknown; users?: unknown; size?: unknown } | null;
  };
  const s = ar.src(member);

  F.add('em.version', data.version ?? null, 'EXACT', s, 'X02');
  F.add('em.home', data.location ?? null, 'EXACT', s, 'X02');

  const ps = data.production_size;
  if (ps && Object.keys(ps).length > 0) {
    F.add('em.daily_jobs', ps.jobs ?? null, 'EXACT', s, 'X10');
    F.add('em.size_class', ps.size ?? null, 'EXACT', s, 'X10');
    F.add('em.users', ps.users ?? null, 'EXACT', s, 'X10');
  }
}

/** X03 — hostname, keyed by the archive's product. Also stamps `ar.host`. */
export function x03Hostname(ar: Archive, F: FactSet): void {
  const hit = ar.read('OS/Network/Hostname.txt');
  if (!hit) return;
  const first = splitLines(hit.text.trim())[0];
  if (first === undefined) return;
  F.add(`${ar.product.toLowerCase()}.host`, first, 'EXACT', ar.src(hit.member), 'X03');
  ar.host = first;
}

/** X04 — OS name and version from the hardware summary. */
export function x04Os(ar: Archive, F: FactSet): void {
  const hit = ar.read('OS/Hardware/HardwareConfig.txt');
  if (!hit) return;
  const s = ar.src(hit.member);
  const p = ar.product.toLowerCase();

  const name = /OS Name:\s*(.+)/.exec(hit.text);
  const ver = /OS Version:\s*(.+)/.exec(hit.text);
  if (name?.[1]) F.add(`${p}.os_name`, name[1].trim(), 'EXACT', s, 'X04');
  if (ver?.[1]) F.add(`${p}.os_version`, ver[1].trim(), 'EXACT', s, 'X04');
}

/**
 * X05 — database type. PostgreSQL and Oracle are read from their own sections;
 * MS SQL is INFERRED by elimination and must be confirmed by the TSA (FR-10).
 */
export function x05Db(ar: Archive, F: FactSet): void {
  const pg = ar.find('pg_settings-table.csv');
  const ora = ar.findAll(/\/db\/oracle\//);

  if (pg) {
    const text = ar.readMember(pg);
    const vm = /server_version\D+([\d.]+)/.exec(text);
    F.add('db.type', 'PostgreSQL', 'EXACT', ar.src(pg), 'X05');
    if (vm?.[1]) F.add('db.version', vm[1], 'EXACT', ar.src(pg), 'X05');
  } else if (ora.length > 0 && ora[0]) {
    F.add('db.type', 'Oracle', 'EXACT', ar.src(ora[0]), 'X05');
  } else {
    F.add(
      'db.type',
      'MS SQL (by elimination — no PostgreSQL/Oracle sections in archive)',
      'INFERRED',
      ar.absence('<absence of db/postgresql & db/oracle>'),
      'X05',
    );
  }
}

/** X06 — Control-M/Server system parameters. */
export function x06Sysprm(ar: Archive, F: FactSet): void {
  const hit = ar.read('report/SYSPRM.csv');
  if (!hit) return;
  const rows = dictReader(hit.text);
  const r = rows[0];
  if (!r) return;

  const s = ar.src(hit.member);
  const mirror = (r.MIRRORDB ?? 'N').toUpperCase();
  F.add('server.ha', mirror === 'Y' ? 'Yes' : 'No (standalone)', 'EXACT', s, 'X06', pyRepr(r));
  F.add('server.ssl_enabled', r.SSL_ENBL ?? null, 'EXACT', s, 'X06');
  F.add('server.newday_time', r.DAYTIME ?? null, 'EXACT', s, 'X06');
  if (r.CTM_VERSION) {
    F.add('server.running_version', r.CTM_VERSION, 'EXACT', s, 'X06');
  }
}

/** X07 — EM high-availability / distributed layout, by CONFIG_HA.INI presence. */
export function x07EmHa(ar: Archive, F: FactSet): void {
  const member = ar.find('EM/ini/CONFIG_HA.INI') ?? ar.find('ini/CONFIG_HA.INI');
  if (member) {
    F.add('em.ha_or_distributed', 'Yes — CONFIG_HA.INI present', 'EXACT', ar.src(member), 'X07');
  } else if (ar.find('EMSiteConfig.ini')) {
    F.add(
      'em.ha_or_distributed',
      'No (standalone — no CONFIG_HA.INI)',
      'EXACT',
      ar.absence('<absence of CONFIG_HA.INI>'),
      'X07',
    );
  }
}
