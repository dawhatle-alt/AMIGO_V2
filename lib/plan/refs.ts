import type { Ref } from '@/lib/types/case';
import { KA_TABLE } from '@/lib/agent/kaTable';

/**
 * Documentation references used by plan/runbook content, following
 * reference/skill-references/url-reference.md:
 *  - public docs.bmc.com/xwiki links wherever they cover the topic;
 *  - documents.bmc.com / selfservice.bmc.com links carry 🔒 (Support Central login);
 *  - the dead Control-M_EM_Upgrade.htm / Control-M_Server_Upgrade.htm pages are never used.
 */

const DOC = 'https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/';
const XWIKI = 'https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/';

const locked = (label: string, url: string): Ref => ({ label: `${label} 🔒`, url });
const open = (label: string, url: string): Ref => ({ label, url });

export const REF = {
  upgradeGuide: locked('Control-M Upgrade Guide', `${DOC}Control-M_upgrade.htm`),
  compatMode: locked('Compatibility Mode', `${DOC}Control-M_upgrade.htm#CompatibilityMode`),
  upgradeReqs: locked('Upgrade Requirements and Considerations', `${DOC}Control-M_upgrade.htm#UpgradeRequirementsandConsiderations`),
  pgUpgrade: locked('Upgrading the PostgreSQL Database Server', `${DOC}Control-M_upgrade.htm#UpgradingthePostgreSQLDatabaseServer`),
  sysReqs: locked('Full Installation System Requirements', `${DOC}Control-M_full_installation_system_requirements.htm`),
  emSysReqs: locked('EM System Requirements', `${DOC}Control-M_Enterprise_Manager_installation.htm#ControlMEMSystemRequirements`),
  fullInstall: locked('Control-M Full Installation', `${DOC}Control-M_full_installation.htm`),
  installIntro: locked('Obtaining Installation Files', `${DOC}Introduction_to_Control-M_Installation.htm`),
  javaInstall: locked('External Java Installation', `${DOC}Java_Installation.htm`),
  preInstallUnix: locked('Pre-Installation Procedures on UNIX', `${DOC}Control-M_pre-installation_procedures_on_UNIX.htm`),
  firewall: locked('Firewall Configuration', `${DOC}Firewall.htm`),
  haInstall: locked('High Availability Installation', `${DOC}High_availability_installation.htm`),
  emUtils: locked('EM Utilities', `${DOC}EM_Utils.htm`),
  serverUtils: locked('Server Utilities', `${DOC}Server_Utils.htm`),
  ctmsetown: locked('ctmsetown Utility', `${DOC}Utilities/ctmsetown.htm`),
  ctmldnrs: locked('ctmldnrs Utility', `${DOC}Utilities/ctmldnrs.htm`),
  emSysParams: locked('Configuring EM System Parameters', `${DOC}Configuring_Control-M_EM_System_Parameters.htm`),
  serverAgentComms: locked('Server-Agent Communication', `${DOC}Control-M_Server-Agent_Communication.htm`),
  aapiDocs: locked('Automation API Documentation', 'https://documents.bmc.com/supportu/API/Monthly/en-US/Documentation/home.htm'),

  pacTool: open('PAC Compatibility Tool', 'https://docs.bmc.com/xwiki/bin/view/Standalone/BMC-Product-Compatibility/compatibility/'),
  compat9022: open('9.0.22 Compatibility', `${XWIKI}ctm9022/Control-M-9-0-22-Release-Notes/Control-M-Compatibility/`),
  patches9022: open('All 9.0.22 Patches', `${XWIKI}ctm9022/Patches/`),
  patches9021: open('All 9.0.21 Patches', `${XWIKI}ctm9021/Patches/`),
  emPatch9022: open('EM Patch 9.0.22.026', `${XWIKI}ctm9022/Patches/Control-M-EM-PANFT-9-0-22-026/`),
  serverPatch9022: open('Server Patch 9.0.22.025', `${XWIKI}ctm9022/Patches/Control-M-Server-PACTV-9-0-22-025/`),
  java11Eos: open('Java 11 End of Support', `${XWIKI}ctm9021/Technical-Bulletins/Announcements/Deprecation-and-End-of-Support/Java-11-LTS-on-Control-M-EM-Control-M-Server-Control-M-Agent-Control-M-Plug-ins-and-Control-M-Automation-API-End-of-Support/`),
  aixEos: open('AIX End of Support (end of 2026)', `${XWIKI}Announcements/Deprecation-and-End-of-Support/Control-M-EM-and-Control-M-Server-on-AIX-End-of-Support-Planned-for-the-End-of-2026/`),
  ctmldnrsBulletin: open('ctmldnrs Utility Update', `${XWIKI}ctm9021/Technical-Bulletins/Announcements/ctmldnrs-Utility-Update/`),
  pgBulletin: open('BMC PostgreSQL Database Server Upgrade', `${XWIKI}Announcements/BMC-PostgreSQL-Database-Server-Upgrade/`),
  amigoOverview: open('AMIGO Program Overview', 'https://www.bmc.com/support/resources/amigo_program_overview.html'),
  supportCentral: open('BMC Support Central', 'https://www.bmc.com/support'),
} as const;

/** KA reference by number, when the KA table records its URL. */
export function ka(id: string): Ref | null {
  const entry = KA_TABLE.find((k) => k.id === id);
  if (!entry?.url) return null;
  return { label: `${entry.id} — ${entry.title} 🔒`, url: entry.url };
}

/** Compact ref list helper that drops KAs without a known URL. */
export function refs(...items: (Ref | null | undefined)[]): Ref[] {
  return items.filter((r): r is Ref => !!r);
}

/** True when the link needs a BMC Support Central login (url-reference.md: 🔒). */
export function isLoginRequired(ref: Ref): boolean {
  return ref.label.includes('🔒') || /https:\/\/(documents|selfservice)\.bmc\.com\//.test(ref.url);
}
