/**
 * Markdown-lite for advisor replies. The model answers with fenced command
 * blocks, **bold** labels and `inline code`; rendering those (and nothing
 * more) keeps commands copyable and labels scannable without pulling in a
 * markdown library or trusting arbitrary HTML.
 */

export type ReplyBlock = { type: 'code'; text: string } | { type: 'text'; text: string };

/** Split a reply into fenced code blocks and text between them. */
export function splitBlocks(content: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  const fence = /```[^\n]*\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(content)) !== null) {
    const before = content.slice(last, m.index).trim();
    if (before) blocks.push({ type: 'text', text: before });
    const code = (m[1] ?? '').replace(/\s+$/, '');
    if (code) blocks.push({ type: 'code', text: code });
    last = m.index + m[0].length;
  }
  const tail = content.slice(last).trim();
  if (tail) blocks.push({ type: 'text', text: tail });
  return blocks;
}

export type InlineRun = { kind: 'text' | 'bold' | 'code'; text: string };

/** Split one line of text into plain / **bold** / `code` runs. */
export function inlineRuns(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const re = /\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) runs.push({ kind: 'bold', text: m[1] });
    else if (m[2] !== undefined) runs.push({ kind: 'code', text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ kind: 'text', text: text.slice(last) });
  return runs;
}
