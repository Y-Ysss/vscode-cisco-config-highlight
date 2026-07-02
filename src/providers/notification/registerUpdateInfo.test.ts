import { describe, expect, it, vi } from 'vitest';

// vscode is mocked via alias in vitest.config.ts; no vi.mock needed
// extension.ts creates outputChannel at module level, so mock it explicitly
vi.mock('./extension', () => ({
  outputChannel: { appendLine: vi.fn(), append: vi.fn() },
}));

import { isIgnore, shouldRunAction } from './registerUpdateInfo';

describe('isIgnore', () => {
  describe('patch version bump (should be ignored)', () => {
    it('returns true for patch bump 0.6.0 -> 0.6.1', () => {
      expect(isIgnore('0.6.0', '0.6.1')).toBe(true);
    });

    it('returns true for patch bump 1.0.0 -> 1.0.5', () => {
      expect(isIgnore('1.0.0', '1.0.5')).toBe(true);
    });
  });

  describe('minor/major version bump (should notify)', () => {
    it('returns false for minor bump 0.5.0 -> 0.6.0', () => {
      expect(isIgnore('0.5.0', '0.6.0')).toBe(false);
    });

    it('returns false for major bump 0.9.9 -> 1.0.0', () => {
      expect(isIgnore('0.9.9', '1.0.0')).toBe(false);
    });

    it('returns false for preminor bump 0.6.0 -> 0.7.0-beta.1', () => {
      expect(isIgnore('0.6.0', '0.7.0-beta.1')).toBe(false);
    });
  });

  describe('same version or downgrade (should be ignored)', () => {
    it('returns true for same version 0.6.1 -> 0.6.1', () => {
      expect(isIgnore('0.6.1', '0.6.1')).toBe(true);
    });

    it('returns true for downgrade 0.6.1 -> 0.6.0', () => {
      expect(isIgnore('0.6.1', '0.6.0')).toBe(true);
    });
  });
});

describe('shouldRunAction', () => {
  it('returns true when selected button matches label', () => {
    expect(shouldRunAction('Show Changelog', 'Show Changelog')).toBe(true);
  });

  it('returns false when dialog is dismissed', () => {
    expect(shouldRunAction(undefined, 'Show Changelog')).toBe(false);
  });

  it('returns false when selected button does not match label', () => {
    expect(shouldRunAction('Later', 'Show Changelog')).toBe(false);
  });
});
