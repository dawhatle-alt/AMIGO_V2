import { describe, expect, it } from 'vitest';
import { inlineRuns, splitBlocks } from '@/lib/agent/markdown';

/** Advisor replies render fenced commands as copyable blocks and bold labels as bold. */
describe('advisor reply markdown-lite', () => {
  it('splits fenced code blocks out of the text', () => {
    const reply = '**Commands** — run these:\n\n```\nREM host A\ncd /d <media>\\UpgradeReady\nis_upgrade_ready.bat -p em\n```\n\nNotes:\n- keep the log\n\n```bat\nis_upgrade_ready.bat -p ctm\n```';
    expect(splitBlocks(reply)).toEqual([
      { type: 'text', text: '**Commands** — run these:' },
      { type: 'code', text: 'REM host A\ncd /d <media>\\UpgradeReady\nis_upgrade_ready.bat -p em' },
      { type: 'text', text: 'Notes:\n- keep the log' },
      { type: 'code', text: 'is_upgrade_ready.bat -p ctm' },
    ]);
  });

  it('leaves an unfenced reply as one text block and drops empty fences', () => {
    expect(splitBlocks('Just a sentence.')).toEqual([{ type: 'text', text: 'Just a sentence.' }]);
    expect(splitBlocks('a\n```\n```\nb')).toEqual([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ]);
  });

  it('renders bold and inline code runs, leaving stray markers alone', () => {
    expect(inlineRuns('Use `cd /d` from an elevated **cmd** window.')).toEqual([
      { kind: 'text', text: 'Use ' },
      { kind: 'code', text: 'cd /d' },
      { kind: 'text', text: ' from an elevated ' },
      { kind: 'bold', text: 'cmd' },
      { kind: 'text', text: ' window.' },
    ]);
    expect(inlineRuns('2 * 3 * 4 and a ** dangling marker')).toEqual([{ kind: 'text', text: '2 * 3 * 4 and a ** dangling marker' }]);
    expect(inlineRuns('')).toEqual([]);
  });
});
