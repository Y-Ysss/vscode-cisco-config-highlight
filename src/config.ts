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
    }
  );
}
