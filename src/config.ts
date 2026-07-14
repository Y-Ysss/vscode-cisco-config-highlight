import * as vscode from 'vscode';
import {
  Configurations as Conf,
  EXTENSION_ID,
} from './contributions/configurations';

export function getConfig() {
  return vscode.workspace.getConfiguration(EXTENSION_ID);
}

export function getConfigOutlineShowSymbolsInOutlinePanel(): boolean {
  return (
    getConfig().get<boolean>(Conf.outlineShowSymbolsInOutlinePanel) ?? false
  );
}

export function getConfigOutlineSymbolsList(): Record<string, boolean> {
  return (
    getConfig().get<Record<string, boolean>>(Conf.outlineSymbolsList) ?? {
      command: true,
      ip_vrf: true,
      router_bgp: true,
      address_family: true,
      class_map: true,
      policy_map: true,
      interface: true,
      sub_interface: true,
      route_map: true,
      ip_prefix_list: true,
    }
  );
}

export const DEFAULT_OUTLINE_MAX_FILE_SIZE_FOR_FULL_SCAN = 10485760;

export function getConfigOutlineMaxFileSizeForFullScan(): number {
  const configured = getConfig().get<number>(
    Conf.outlineMaxFileSizeForFullScan,
    DEFAULT_OUTLINE_MAX_FILE_SIZE_FOR_FULL_SCAN,
  );
  return typeof configured === 'number' &&
    Number.isFinite(configured) &&
    configured > 0
    ? configured
    : DEFAULT_OUTLINE_MAX_FILE_SIZE_FOR_FULL_SCAN;
}

export const DEFAULT_DIAGNOSTICS_MAX_FILE_SIZE_FOR_FULL_SCAN = 10485760;

export function getConfigDiagnosticsEnabled(): boolean {
  return getConfig().get<boolean>(Conf.diagnosticsEnabled, true) ?? true;
}

export function getConfigDiagnosticsMaxFileSizeForFullScan(): number {
  const configured = getConfig().get<number>(
    Conf.diagnosticsMaxFileSizeForFullScan,
    DEFAULT_DIAGNOSTICS_MAX_FILE_SIZE_FOR_FULL_SCAN,
  );
  return typeof configured === 'number' &&
    Number.isFinite(configured) &&
    configured > 0
    ? configured
    : DEFAULT_DIAGNOSTICS_MAX_FILE_SIZE_FOR_FULL_SCAN;
}

export function getConfigDiagnosticsAllowNonContiguousMask(): boolean {
  return (
    getConfig().get<boolean>(Conf.diagnosticsAllowNonContiguousMask, false) ??
    false
  );
}
