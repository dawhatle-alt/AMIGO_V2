import type { FactSet } from '@/lib/parser/facts';

/**
 * Cross-archive derivations — X08 and X25 (PRD FR-7).
 * These run after every archive's extractors, and only join values that were
 * already extracted; they never read the archives again.
 */
export function derive(F: FactSet): void {
  x08SameHost(F);
  x25Ka000419757(F);
}

/** X08 — are EM and Server co-located? Drives the outage sequence (FR-22). */
function x08SameHost(F: FactSet): void {
  const emHost = F.get('em.host');
  const svHost = F.get('server.host');
  if (typeof emHost !== 'string' || typeof svHost !== 'string') return;

  const same = emHost.toLowerCase() === svHost.toLowerCase();
  F.add(
    'topology.em_server_same_host',
    same ? 'Yes' : `No — EM on ${emHost}, Server on ${svHost}`,
    'DERIVED',
    'join(em.host, server.host)',
    'X08',
  );
}

/**
 * X25 — KA 000419757: agents on RHEL 8.5 or newer running in SSL mode.
 * Both conditions must hold; a match pins a risk banner in Facts Review (FR-11).
 */
function x25Ka000419757(F: FactSet): void {
  const agents = F.get('agents');
  if (!Array.isArray(agents)) return;

  const hits: unknown[] = [];
  for (const agent of agents as Record<string, unknown>[]) {
    const osName = typeof agent.OS === 'string' ? agent.OS : '';
    const ssl = typeof agent.SSL === 'string' ? agent.SSL : 'N';
    const mm = /Red Hat.*?(\d+)\.(\d+)/.exec(osName);
    if (!mm?.[1] || !mm[2]) continue;
    const major = Number(mm[1]);
    const minor = Number(mm[2]);
    const atLeast85 = major > 8 || (major === 8 && minor >= 5);
    if (atLeast85 && ssl.toUpperCase() === 'Y') {
      hits.push(agent.NODEID ?? null);
    }
  }
  if (hits.length > 0) {
    F.add(
      'flags.ka_000419757',
      { triggered: true, agents: hits },
      'DERIVED',
      'join(agents.OS, agents.SSL)',
      'X25',
    );
  }
}
