import { ExternalLink } from 'lucide-react';
import type { Ref } from '@/lib/types/case';
import { isLoginRequired } from '@/lib/plan/refs';

export { isLoginRequired };

/**
 * Documentation / KA link. Links to BMC Support Central content carry the
 * padlock in their label (reference/skill-references/url-reference.md) and
 * get a tooltip explaining the login requirement.
 */
export function RefLink({ refItem }: { refItem: Ref }) {
  const locked = isLoginRequired(refItem);
  return (
    <a
      href={refItem.url}
      target="_blank"
      rel="noopener noreferrer"
      title={locked ? 'Requires BMC Support Central login — sign in at bmc.com/support first' : undefined}
      className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary-dark hover:underline"
    >
      <ExternalLink size={11} />
      {refItem.label}
    </a>
  );
}
