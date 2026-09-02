'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Copy-to-clipboard button for terminal blocks; sits top-right of a `relative` parent. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* clipboard blocked — the block is still selectable */
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-gray-700 px-2 py-1 text-[10px] font-medium text-gray-200 hover:bg-gray-600"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
