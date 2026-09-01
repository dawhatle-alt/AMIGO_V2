import type { Gap } from '@/lib/types/case';

/**
 * Gap catalogue - the questions an HCU archive cannot answer (spec section 5,
 * "Known non-extractable"; PRD FR-12).
 *
 * Content lives here as a versioned data module, never inside a component
 * (CLAUDE.md). Wording, ordering and reference URLs match the golden reference
 * fixtures/facts.reference.json field-for-field. Links marked with a padlock
 * require a BMC Support login (reference/skill-references/url-reference.md).
 *
 * The list is static today because none of these depend on extracted facts.
 * buildGaps() exists so tailoring can be added later without changing callers.
 */
export const GAPS: readonly Gap[] = [
  {
    id: 'ctmsetown',
    question: 'Run ctmsetown -action list on EM and Server — any NOTIMPL entries?',
    why: 'NOTIMPL entries block the upgrade and must be resolved first.',
    state: 'run-command',
    command: 'ctmsetown -action list\nREM Run once as EM admin, once as Server admin.\nREM Paste FULL output. Zero NOTIMPL lines required.',
    refs: [
      { label: 'KA 000354649 — NOTIMPL resolution 🔒', url: 'https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pA8DCAU' },
    ],
  },
  {
    id: 'compat_mode',
    question: 'Compatibility Mode status and version',
    why: 'Hard gate: cannot upgrade to 9.0.22 if compatibility version is 9.0.19 or lower. Irreversible once off. (Not yet captured by the collector — spec X19.)',
    state: 'console',
    console: 'CCM → Manage → Compatibility Mode — record On/Off and the compatibility version shown.',
    refs: [
      { label: 'KA 000401828 — Compatibility Mode FAQ 🔒', url: 'https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pDZpCAM' },
    ],
  },
  {
    id: 'is_upgrade_ready',
    question: 'Run is_upgrade_ready near the upgrade window',
    why: 'Point-in-time readiness validation from the target install media.',
    state: 'run-command',
    command: 'cd <install_media>\\UpgradeReady\\upgrade_ready\nis_upgrade_ready.bat -p em\nis_upgrade_ready.bat -p ctm',
    refs: [
      { label: 'Verifying Upgrade Readiness 🔒', url: 'https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm' },
    ],
  },
  {
    id: 'cm_inventory',
    question: 'Control Modules installed on the Server\'s local agent',
    why: 'CMs are NOT upgraded in-place — each needs a separate migration case.',
    state: 'console',
    console: 'CCM → Agents → <local agent> → installed plug-ins; or list <agent_home>\\cm\\ on disk.',
  },
  {
    id: 'em_clients',
    question: 'How many EM clients exist, and where?',
    why: 'Determines Compatibility Mode duration — EM stays in compat mode until ALL clients are upgraded.',
    state: 'interview',
  },
  {
    id: 'target_version',
    question: 'Target version and fix pack (9.0.22 recommended)',
    why: 'Defines the upgrade path and applicable rules.',
    state: 'interview',
  },
  {
    id: 'upgrade_date',
    question: 'Planned upgrade date (DD/MMM/YYYY)',
    why: 'AMIGO Review requires 2 weeks lead time.',
    state: 'interview',
  },
  {
    id: 'downtime_window',
    question: 'Downtime window (start, duration)',
    why: 'Both components share the outage if co-hosted; runbook timers are built from this.',
    state: 'interview',
  },
  {
    id: 'fallback_plan',
    question: 'Documented and tested fallback plan?',
    why: 'Required before cutover — includes DB restore procedure.',
    state: 'interview',
  },
  {
    id: 'change_freeze',
    question: 'Change cutoff for job definitions/calendars/services',
    why: 'Prevents drift between EM and Server during upgrade.',
    state: 'interview',
  },
  {
    id: 'test_plan',
    question: 'Post-upgrade functional test plan',
    why: 'Verification phase of the runbook is built from this.',
    state: 'interview',
  },
  {
    id: 'same_machine',
    question: 'In-place on the same machine (not a migration)?',
    why: 'Migration to a new machine is not covered under AMIGO.',
    state: 'interview',
  },
  {
    id: 'cloud',
    question: 'Is the environment cloud-hosted?',
    why: 'KA 000223209 applies if yes.',
    state: 'interview',
  },
  {
    id: 'av_exclusions',
    question: 'Confirm Control-M exclusions are configured in the detected AV/monitoring tools',
    why: 'Scanning interference can corrupt the upgrade.',
    state: 'interview',
  },
  {
    id: 'firewall',
    question: 'Confirm firewall rules verified for the new version',
    why: 'EM↔Server and Server↔Agent ports.',
    state: 'interview',
  },
] as const;

/** Returns the gap list for a parsed environment. */
export function buildGaps(): Gap[] {
  return GAPS.map((g) => ({
    ...g,
    refs: g.refs ? g.refs.map((r) => ({ ...r })) : undefined,
  }));
}
