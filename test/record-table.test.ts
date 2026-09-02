import { describe, expect, it } from 'vitest';
import { isRecordArray } from '@/components/ui/RecordTable';

describe('record-array detection', () => {
  it('accepts uniform record arrays that extractors produce', () => {
    expect(isRecordArray([{ drive: 'C:', free_gb: 92 }])).toBe(true);
    expect(isRecordArray([{ NODEID: 'appsrv01', STATE: 'AVAILABLE' }])).toBe(true);
  });

  it('rejects values that should stay prose', () => {
    expect(isRecordArray([])).toBe(false);
    expect(isRecordArray(['site.plc', 'ac.plc'])).toBe(false);
    expect(isRecordArray('MS SQL')).toBe(false);
    expect(isRecordArray({ ABA001: ['v0'] })).toBe(false);
    expect(isRecordArray([{}])).toBe(false);
    expect(isRecordArray(null)).toBe(false);
  });
});
