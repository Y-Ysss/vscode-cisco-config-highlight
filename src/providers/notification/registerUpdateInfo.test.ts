import {
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import * as vscode from 'vscode';

import {
  getApplicableNotifications,
  registerUpdateInfo,
  shouldRunAction,
} from './registerUpdateInfo';

type ShowInformationMessage = (
  message: string,
  ...items: string[]
) => Thenable<string | undefined>;

function spyOnShowInformationMessage(): MockInstance<ShowInformationMessage> {
  return vi.spyOn(
    vscode.window,
    'showInformationMessage',
  ) as unknown as MockInstance<ShowInformationMessage>;
}

function createExtensionContext(
  previousVersion: string | undefined,
  currentVersion: string,
): {
  context: vscode.ExtensionContext;
  state: Map<string, unknown>;
  setKeysForSync: ReturnType<typeof vi.fn>;
} {
  const state = new Map<string, unknown>();
  const setKeysForSync = vi.fn();
  if (previousVersion !== undefined) {
    state.set('previous_version', previousVersion);
  }

  return {
    state,
    setKeysForSync,
    context: {
      globalState: {
        get: <T>(key: string): T | undefined => state.get(key) as T | undefined,
        update: async (key: string, value: unknown): Promise<void> => {
          state.set(key, value);
        },
        setKeysForSync,
      },
      extension: { packageJSON: { version: currentVersion } },
    } as unknown as vscode.ExtensionContext,
  };
}

describe('registerUpdateInfo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the current version without notifying on first install', async () => {
    const { context, state, setKeysForSync } = createExtensionContext(
      undefined,
      '0.9.0',
    );
    const information = spyOnShowInformationMessage();
    const warning = vi.spyOn(vscode.window, 'showWarningMessage');

    await registerUpdateInfo(context);

    expect(state.get('previous_version')).toBe('0.9.0');
    expect(setKeysForSync).toHaveBeenCalledWith([]);
    expect(information).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it('shows one aggregated notification when multiple notices are crossed', async () => {
    const { context } = createExtensionContext('0.3.0', '0.9.0');
    const information =
      spyOnShowInformationMessage().mockResolvedValue(undefined);

    await registerUpdateInfo(context);

    expect(information).toHaveBeenCalledTimes(1);
    expect(information).toHaveBeenCalledWith(
      expect.stringContaining('0.4.0'),
      'Show Changelog',
    );
    expect(information.mock.calls[0]?.[0]).toContain('0.6.0');
  });

  it('does not block registration while the notification remains open', async () => {
    const { context } = createExtensionContext('0.5.0', '0.7.0');
    let resolveDialog: ((selected: string | undefined) => void) | undefined;
    const dialog = new Promise<string | undefined>((resolve) => {
      resolveDialog = resolve;
    });
    spyOnShowInformationMessage().mockReturnValue(dialog);

    await expect(registerUpdateInfo(context)).resolves.toBeUndefined();

    resolveDialog?.(undefined);
  });

  it('does not run the action when the notification is dismissed', async () => {
    const { context } = createExtensionContext('0.5.0', '0.7.0');
    spyOnShowInformationMessage().mockResolvedValue(undefined);
    const openExternal = vi.spyOn(vscode.env, 'openExternal');

    await registerUpdateInfo(context);
    await Promise.resolve();

    expect(openExternal).not.toHaveBeenCalled();
  });

  it('opens the changelog when the action is selected', async () => {
    const { context } = createExtensionContext('0.5.0', '0.7.0');
    spyOnShowInformationMessage().mockResolvedValue('Show Changelog');
    const openExternal = vi
      .spyOn(vscode.env, 'openExternal')
      .mockResolvedValue(true);

    await registerUpdateInfo(context);

    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledTimes(1));
    expect(openExternal.mock.calls[0]?.[0].toString()).toBe(
      'https://github.com/Y-Ysss/vscode-cisco-config-highlight/blob/main/CHANGELOG.md',
    );
  });
});

describe('getApplicableNotifications', () => {
  it.each([
    {
      previousVersion: '0.3.0',
      currentVersion: '0.4.0',
      expected: ['0.4.0'],
    },
    {
      previousVersion: '0.4.0',
      currentVersion: '0.5.0',
      expected: [],
    },
    {
      previousVersion: '0.5.0',
      currentVersion: '0.7.0',
      expected: ['0.6.0'],
    },
    {
      previousVersion: '0.3.0',
      currentVersion: '0.9.0',
      expected: ['0.4.0', '0.6.0'],
    },
  ])(
    'selects notices crossed by $previousVersion -> $currentVersion',
    ({ previousVersion, currentVersion, expected }) => {
      expect(
        getApplicableNotifications(previousVersion, currentVersion).map(
          (notice) => notice.introducedIn,
        ),
      ).toEqual(expected);
    },
  );

  it.each([
    ['0.6.0', '0.6.0'],
    ['0.7.0', '0.6.0'],
    ['invalid', '0.9.0'],
    ['0.5.0', 'invalid'],
  ])('returns no notices for %s -> %s', (previousVersion, currentVersion) => {
    expect(getApplicableNotifications(previousVersion, currentVersion)).toEqual(
      [],
    );
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
