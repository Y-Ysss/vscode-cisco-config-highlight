import { describe, expect, it } from 'vitest';
import { measureOutlineDocument } from './documentMeasurement';

describe('measureOutlineDocument', () => {
  it('measures exact UTF-8 bytes and keeps the prefix line count in range', () => {
    expect(measureOutlineDocument('a\n\u3042\ninterface Gi0/1', 4, 3)).toEqual({
      byteSize: 21,
      prefixLineCount: 1,
    });
    expect(measureOutlineDocument('interface Gi0/0', 1, 1)).toEqual({
      byteSize: 15,
      prefixLineCount: 1,
    });
    expect(measureOutlineDocument('a\nb', 100, 3).prefixLineCount).toBe(3);
  });

  it('returns no prefix lines for an empty document', () => {
    expect(measureOutlineDocument('', 10, 0)).toEqual({
      byteSize: 0,
      prefixLineCount: 0,
    });
  });
});
