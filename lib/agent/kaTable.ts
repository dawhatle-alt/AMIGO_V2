/**
 * BMC Knowledge Article reference table for the advisor's system prompt
 * (PRD FR-16). Versioned data module — ported from the prototype's KA_LIST
 * (reference/prototypes/amigo-runbook-AZAMA79-v2.jsx) and the checklist
 * references (reference/skill-references/SKILL.md).
 *
 * Every KA lives behind a BMC Support Central login (url-reference.md), so a
 * URL is included only where the reference material records the sfdcid —
 * the advisor cites by number and never invents a link.
 */

export const KA_TABLE_VERSION = 'v22';

export interface KnowledgeArticle {
  id: string;
  title: string;
  /** Support Central link, when known. */
  url?: string;
}

const KA_BASE = 'https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=';

export const KA_TABLE: readonly KnowledgeArticle[] = [
  { id: 'KA 000354649', title: 'NOTIMPL entries in ctmsetown -action list', url: `${KA_BASE}kA114000000pA8DCAU` },
  { id: 'KA 000401828', title: 'Compatibility Mode FAQ', url: `${KA_BASE}kA114000000pDZpCAM` },
  { id: 'KA 000401084', title: 'Supported Java versions for Control-M 9.0.22', url: `${KA_BASE}kA114000000pDVGCA2` },
  { id: 'KA 000286154', title: 'Verify EM web server startup after upgrade', url: `${KA_BASE}kA114000000H8URCA0` },
  { id: 'KA 000415171', title: 'Post-upgrade considerations', url: `${KA_BASE}kA114000000pCSvCAM` },
  { id: 'KA 000419428', title: 'Automation API CLI OS support (dropped OSes)', url: `${KA_BASE}kA114000000pCJgCAM` },
  { id: 'KA 000308365', title: 'Authorized Control-M/Server host on agents', url: `${KA_BASE}kA114000000HDmyCAG` },
  { id: 'KA 000358019', title: 'Control-M/Server exe directory not in PATH', url: `${KA_BASE}kA114000000pA97CAE` },
  { id: 'KA 000406529', title: 'Multiple Control-M/Servers on the same host (CTM-7845)' },
  { id: 'KA 000404872', title: 'EM and Server on different Windows drives (CTM-7632)' },
  { id: 'KA 000419757', title: 'Agents on RHEL 8.5+ in SSL mode before a Server upgrade' },
  { id: 'KA 000374213', title: 'EM and Server on the same UNIX host with different users (Kafka/zookeeper port conflict)' },
  { id: 'KA 000386814', title: 'High Availability upgrade steps' },
  { id: 'KA 000223209', title: 'Control-M in cloud environments' },
  { id: 'KA 000318316', title: 'Control-M for z/OS — separate AMIGO case with the mainframe team' },
  { id: 'KA 000277312', title: 'AMIGO program overview' },
] as const;

/** One line per KA, for the system prompt. */
export function kaTableText(): string {
  return KA_TABLE.map((ka) => `${ka.id} — ${ka.title}${ka.url ? ` (${ka.url}) 🔒` : ' 🔒'}`).join('\n');
}
