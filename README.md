<h1 align="center">
  <a href="https://github.com/Y-Ysss/vscode-cisco-config-highlight">
    <img src="images/icon.png" alt="theme icon" width="200px">
  </a><br>
    Cisco Config Highlight
</h1>
<p align="center">Syntax Highlighting for Cisco Device Configuration in Visual Studio Code.</p>

**日本語版: [README.ja.md](README.ja.md)**

This project is in the development stages.

Definitions may change in future versions.

> [!NOTE]  
> Experimental Tool Release  
> A tool for customizing token definitions has been released.  
> With the theme editor, you can customize colors and styles while checking the scopes of tokens.  
> This tool is an experimental feature and may change in the future.  
> - [TextMate Theme Editor for Cisco Config Highlight](https://text-mate-theme-editor.yuyosy.workers.dev)
>
> The theme editor is a web application that runs in the browser.
> 
> <img src="https://raw.githubusercontent.com/yuyosy/textmate-theme-editor/refs/heads/main/public/screenshot.png" alt="theme icon" width="480px">



## Features
This extension provides useful features for Cisco config text, including:

- Syntax highlighting
- Config outline (Experimental)
- Configuration diagnostics (Experimental)


## Installation
The extension for VS Code is available on the Visual Studio Marketplace and the Open VSX Registry:
- [Visual Studio Marketplace - Cisco Config Highlight](https://marketplace.visualstudio.com/items?itemName=Y-Ysss.cisco-config-highlight)
- [Open VSX Registry - Cisco Config Highlight](https://open-vsx.org/extension/Y-Ysss/cisco-config-highlight)


## Supported Platforms

Syntaxes commonly used in configuration files are supported.
- IOS
- IOS-XE
- NXOS

The following platforms provide similar syntax highlighting for constructs that overlap with IOS:
- IOS-XR
- ASA

I would like to expand support for these platforms in the future.


## Screenshot
> [!NOTE]  
> All screenshots in this README use a custom theme ([Y-Ysss/Daybreak Theme](https://marketplace.visualstudio.com/items?itemName=Y-Ysss.vscode-daybreak-theme)).
<img src="images/Screenshot.png" alt="screenshot">

## Token Color Customizations

The color of syntax highlighting depends on the theme you have enabled.

Not all highlighting settings are enabled in VSCode's default theme. For a better experience, I recommend using a custom theme or defining your own token color customizations.

If the colors are not defined in the currently activated theme, or if you want to customize the colors and style to your liking, you will need to edit the `settings.json`.

Open the settings and add the customization options to the JSON.
(You can open the `settings.json` file by typing `Preferences: Open Settings (JSON)` in the command palette.)

For more information on how to customize the settings.json file, please refer to the following URL.

[Visual Studio Code Documentation - Color Themes](https://code.visualstudio.com/docs/getstarted/themes)

### Scope Hierarchy
Tokens follow a hierarchical structure, which allows you to abbreviate scopes when customizing them.

For example, consider the following two scopes:
- `entity.name.class.interface.ethernet`
- `entity.name.class.interface.loopback`

If you specify these scopes in full, the customization will apply only to those specific tokens.

However, if you use a higher-level scope such as:
- `entity.name.class.interface`

The customization will apply to all tokens under that scope.
The higher (shallower) the level in the hierarchy, the broader the range of tokens affected.


### VSCode settings.json customize sample
``` json
    "editor.tokenColorCustomizations": {
        "textMateRules": [
            {
                "scope": "entity.name.class.interface.ethernet",
                "settings": {
                    "foreground": "#328f16",
                    "fontStyle": "italic"
                }
            },
            {
                "scope": [
                    "keyword.other.address",
                    "constant.numeric"
                ],
                "settings": {
                    "foreground": "#cc0ca2",
                    "fontStyle": "underline"
                }
            }
        ]
    }
```

## Token Scopes List
```
comment.block.banner
comment.line.config

constant.numeric.hex
constant.numeric.integer

entity.name.class.interface.async
entity.name.class.interface.bri
entity.name.class.interface.bvi
entity.name.class.interface.cellular
entity.name.class.interface.dialer
entity.name.class.interface.ethernet
entity.name.class.interface.loopback
entity.name.class.interface.management
entity.name.class.interface.null
entity.name.class.interface.portchannel
entity.name.class.interface.serial
entity.name.class.interface.tunnel
entity.name.class.interface.virtual-template
entity.name.class.interface.vlan
entity.name.class.interface.wireless
entity.name.class.interface.bdi
entity.name.class.interface.nvi
entity.name.class.interface.vmi
entity.name.class.interface.vasileft
entity.name.class.interface.vasiright
entity.name.class.interface.app-gigabitethernet

entity.name.class.vrf.declaration

entity.name.tag.acl.access-group.name
entity.name.tag.acl.access-list.name
entity.name.tag.acl.access-class.name

entity.name.tag.bgp.neighbor-peer-group.name
entity.name.tag.bgp.peer-group.name
entity.name.tag.bgp.peer-policy.name
entity.name.tag.bgp.peer-session.name

entity.name.tag.config-string.domain-name
entity.name.tag.config-string.hostname
entity.name.tag.config-string.logging-system-message
entity.name.tag.config-string.username
entity.name.tag.config-string.name
entity.name.tag.config-string.role

entity.name.tag.wireless.ssid.name

entity.name.tag.crypto.crypto-map.name
entity.name.tag.crypto.transform-set.name
entity.name.tag.crypto.ipsec-profile.name
entity.name.tag.crypto.isakmp-profile.name
entity.name.tag.crypto.keyring.name
entity.name.tag.crypto.key-chain.name

entity.name.tag.group.class-map.name
entity.name.tag.group.class.name
entity.name.tag.group.object-group.name
entity.name.tag.group.policy-map.name
entity.name.tag.group.pool.name
entity.name.tag.group.prefix-list.name
entity.name.tag.group.route-map.name
entity.name.tag.group.service-policy.name
entity.name.tag.group.policy-list.name
entity.name.tag.group.traffic-filter.name
entity.name.tag.group.community.name

entity.name.tag.event-manager.applet.name
entity.name.tag.event-manager.environment.name
entity.name.tag.event-manager.run.name
entity.name.tag.event-manager.action.label

entity.name.tag.vrf.vrf-name

keyword.other.acl.access-list.type
keyword.other.address.ipv4.cidr
keyword.other.address.ipv4.full
keyword.other.address.ipv6.condensed
keyword.other.address.ipv6.full
keyword.other.address.mac

keyword.other.config-keyword.add-remove.add
keyword.other.config-keyword.add-remove.except
keyword.other.config-keyword.add-remove.remove
keyword.other.config-keyword.allowed-native
keyword.other.config-keyword.any-all.all
keyword.other.config-keyword.any-all.any
keyword.other.config-keyword.in-out.in
keyword.other.config-keyword.in-out.out
keyword.other.config-keyword.input-output.input
keyword.other.config-keyword.input-output.output
keyword.other.config-keyword.inside-outside.inside
keyword.other.config-keyword.inside-outside.outside
keyword.other.config-keyword.match.all
keyword.other.config-keyword.match.any
keyword.other.config-keyword.permit-deny.deny
keyword.other.config-keyword.permit-deny.permit
keyword.other.config-keyword.shutdown
keyword.other.config-keyword.status.administratively-down
keyword.other.config-keyword.status.deleted
keyword.other.config-keyword.status.down
keyword.other.config-keyword.status.up
keyword.other.config-keyword.switchport-mode.access
keyword.other.config-keyword.switchport-mode.dynamic
keyword.other.config-keyword.switchport-mode.trunk
keyword.other.config-keyword.enable-disable.enable
keyword.other.config-keyword.enable-disable.disable
keyword.other.config-keyword.vlan
keyword.other.group.object-group.type

meta.function-call.command_hostname.privileged-mode
meta.function-call.command_hostname.user-mode
meta.function-call.command-disable.default
meta.function-call.command-disable.unused

punctuation.config-param.first

string.other.description
string.other.password
string.other.remark
string.other.secret
string.other.key-string
```

## Experimental Features

- Show symbols in outline panel
- Multilingual support (settings page)


### Show symbols in outline panel

<img src="images/outline.png" alt="screenshot">

Open the settings and enter a keyword in the search box. Select the check box to enable.

```
@ext:Y-Ysss.cisco-config-highlight showSymbolsInOutlinePanel
```

#### Supported symbols
- Command
  - `hostname#{command name}`
  - `hostname>{command name}`
- Virtual Routing and Forwarding(VRF)
  - `ip vrf {vrf-name}`
- Border Gateway Protocol(BGP)
  - `router bgp {autonomous-system-number}`
  - `address-family ipv4 {unicast|multicast|vrf vrf-name }`
- Group
  - `class-map {match-any|match-all} name`
  - `policy-map {name}`
- Interface
  - `interface {type, slot, port, etc...}`
  - e.g. `interface GigabitEthernet0/0`
- Sub Interface
  - `interface {type, slot, port, etc...}.{number}`
- Route Map
  - `route-map {name} {permit|deny} {sequence-number}`
- IPv4 Prefix List
  - `ip prefix-list {name} ...`

#### Outline hierarchy and large files

Prompt commands such as `hostname#show running-config` and `hostname>show ...` are recognized as command symbols. Output that follows a `show` command is grouped beneath that command when applicable. Configuration symbols are grouped into category nodes; sub-interfaces are nested under their parent interface, and BGP address families are nested under the corresponding BGP process.

For files larger than `cisco-config-highlight.outline.maxFileSizeForFullScan` in UTF-8 bytes, Outline scans only the beginning of the file. A truncation symbol indicates that the remaining content was not scanned.

### Diagnostics

Diagnostics checks these supported scopes:

- IPv4 routes, interface addresses, and prefix lists
- IPv6 addresses, prefix lists, and ACL prefixes
- IPv4 ACL wildcard masks
- IOS and NX-OS network object-groups

An **Error** indicates an invalid IPv4/IPv6 address or an invalid mask/wildcard value. **Warnings** include malformed or out-of-range prefix lengths, invalid prefix-list modifiers or relations, and disallowed non-contiguous subnet masks.

Diagnostics does not validate every command or every platform-specific syntax. For files larger than `cisco-config-highlight.diagnostics.maxFileSizeForFullScan` in UTF-8 bytes, it silently validates only visible ranges plus a buffer around them; it does not show a notification.


### Multilingual support
Currently, only the settings page is available.

The following languages are supported:
- English
- Japanese

## Notes
### Highlighting in large files

If you want to enable highlighting in large files, change the following setting to false:
```
"editor.largeFileOptimizations": false
```
However, VSCode disables features on large files for performance reasons, and forcing VSCode to syntax highlight large files may result in poor editor performance.


## Recommended Extensions
I recommend the following extensions for a better visual experience:
- [Y-Ysss/Daybreak Theme](https://marketplace.visualstudio.com/items?itemName=Y-Ysss.vscode-daybreak-theme)
- [Jarvis Prestidge/Sublime Material Theme](https://marketplace.visualstudio.com/items?itemName=jprestidge.theme-material-theme)

## Requests or Issues
If you have any requests or issues, please open an Issue or submit a Pull Request on GitHub.

[GitHub - Y-Ysss/vscode-cisco-config-highlight](https://github.com/Y-Ysss/vscode-cisco-config-highlight)

## License
MIT License Copyright (c) 2021 Y-Ysss
