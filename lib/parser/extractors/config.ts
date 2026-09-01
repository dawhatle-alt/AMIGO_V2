import type { Archive } from '@/lib/parser/archive';
import type { FactSet } from '@/lib/parser/facts';

/** Configuration state — X13–X18. */

/** X13 — external Java: JAVA_HOME, its version, and the system PATH version. */
export function x13Java(ar: Archive, F: FactSet): void {
  const hit = ar.read('OS/Java/check_java_versions.txt');
  if (!hit) return;
  const s = ar.src(hit.member);

  const home = /JAVA_HOME:\s*(.+)/.exec(hit.text);
  const hv = /JAVA_HOME version:.*?"([\d._]+)"/.exec(hit.text);
  const sysv = /System Java.*?"([\d._]+)"/.exec(hit.text);

  if (home?.[1]) F.add('em.java_home', home[1].trim(), 'EXACT', s, 'X13');
  if (hv?.[1]) F.add('em.java_home_version', hv[1], 'EXACT', s, 'X13');
  if (sysv?.[1]) F.add('em.java_system_version', sysv[1], 'EXACT', s, 'X13');
}

/** X14 — Automation API gateway port, required to be set before Server upgrade. */
export function x14Apigtw(ar: Archive, F: FactSet): void {
  const hit = ar.read('CNF_INFO/data/api_gateway_url.dat');
  if (!hit) return;
  const pm = /:(\d+)/.exec(hit.text);
  if (pm?.[1]) {
    F.add('server.apigtw_port', pm[1], 'EXACT', ar.src(hit.member), 'X14', hit.text);
  }
}

/** X15 — GD_FORWARD; absent means the 9.0.21+ default applies. */
export function x15GdForward(ar: Archive, F: FactSet): void {
  const hit = ar.read('CNF_INFO/data/config.dat');
  if (!hit) return;
  const gm = /^GD_FORWARD\s+(\S+)/m.exec(hit.text);
  const value = gm?.[1] ?? 'not set (default — forward ordering active per 9.0.21+ behavior)';
  F.add('server.gd_forward', value, 'EXACT', ar.src(hit.member), 'X15');
}

/** X16 — ctmldnrs.dat presence. */
export function x16Ctmldnrs(ar: Archive, F: FactSet): void {
  const member = ar.find('ctmldnrs.dat');
  F.add(
    'server.ctmldnrs_in_use',
    member ? 'Yes' : 'No (file not present in data/)',
    'EXACT',
    member ? ar.src(member) : ar.absence('<absence>'),
    'X16',
  );
}

/** X17 — LDAP configuration and directory service type. */
export function x17Ldap(ar: Archive, F: FactSet): void {
  const conf = ar.find('EM/LDAP/ldap.conf') ?? ar.find('LDAP/ldap.conf');
  if (conf) {
    const typeHit = ar.read('LDAP/DirectoryServiceType.cfg');
    const dtype = typeHit ? typeHit.text.trim() : 'type file absent';
    F.add('em.ldap', `Configured (${dtype})`, 'EXACT', ar.src(conf), 'X17');
  } else {
    F.add(
      'em.ldap',
      'Not configured (no ldap.conf collected)',
      'EXACT',
      ar.absence('<absence>'),
      'X17',
    );
  }
}

/** X18 — SSL policy file inventory (order follows the archive's own entries). */
export function x18SslPolicies(ar: Archive, F: FactSet): void {
  const plcs = ar
    .findAll(/cert\/.*\.plc$/)
    .map((n) => n.split('/').pop() as string);
  if (plcs.length > 0) {
    F.add('server.ssl_policies', plcs, 'EXACT', `${ar.fileName}:CNF_INFO/cert/*.plc`, 'X18');
  }
}
