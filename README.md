<h1 align="center">
  <a href="https://github.com/Y-Ysss/vscode-cisco-config-highlight">
    <img src="images/icon.png" alt="theme icon" width="200px">
  </a><br>
    Cisco Config Highlight
</h1>
<p align="center">Cisco device configuration Syntax Highlighting for Visual Studio Code.</p>

This project is in the development stages.

There's a possibility that definitions will change in the future.

## Features
This extension provides some awesome features for Cisco config text, including:

- Syntax highlighting
- Config outline (Experimental)

## Screenshot
<img src="images/Screenshot.png" alt="screenshot">

## Token Color Customizations

The color of syntax highlighting depends on the theme you have enabled.

If the theme you currently have enabled does not define the colors, you will need to customize the `settings.json` file.

Open the settings and add option strings to JSON.
(You can open the `settings.json` file by typing `Preferences: Open Settings (JSON)` in the command palette.)

### VSCode settings customize sample
``` json
    "editor.tokenColorCustomizations": {
        "textMateRules": [
            {
                "scope": "entity.name.class.interface.ethernet.cisco",
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
punctuation.config-param.first.cisco

comment.line.config.cisco

string.other.description.cisco
entity.name.tag.config-string.domain-name.cisco
entity.name.tag.config-string.hostname.cisco
entity.name.tag.config-string.username.cisco
entity.name.tag.config-string.logging-system-message.cisco
string.other.password.cisco
comment.block.banner.cisco

constant.numeric.hex.cisco
constant.numeric.integer.cisco

keyword.other.config-keyword.vlan.cisco
keyword.other.config-keyword.switchport-mode.cisco
keyword.other.config-keyword.add-remove.cisco
keyword.other.config-keyword.allowed-native.cisco
keyword.other.config-keyword.any-all.cisco
keyword.other.config-keyword.permit-deny.cisco
keyword.other.config-keyword.status.cisco
keyword.other.config-keyword.match.cisco
keyword.other.config-keyword.in-out.cisco
keyword.other.config-keyword.input-output.cisco
keyword.other.config-keyword.inside-outside.cisco

entity.name.class.interface.ethernet.cisco
entity.name.class.interface.wireless.cisco
entity.name.class.interface.loopback.cisco
entity.name.class.interface.portchannel.cisco
entity.name.class.interface.tunnel.cisco
entity.name.class.interface.vlan.cisco
entity.name.class.interface.null.cisco
entity.name.class.interface.serial.cisco
entity.name.class.interface.cellular.cisco
entity.name.class.interface.virtual-template.cisco
entity.name.class.interface.dialer.cisco
entity.name.class.interface.async.cisco
entity.name.class.interface.bri.cisco
entity.name.class.interface.bvi.cisco

keyword.other.address.ipv4.cidr.cisco
keyword.other.address.ipv4.full.cisco
keyword.other.address.ipv6.condensed.cisco
keyword.other.address.ipv6.full.cisco
keyword.other.address.mac.cisco

meta.function-call.command_hostname.user-mode.cisco
meta.function-call.command_hostname.privileged-mode.cisco

entity.name.class.vrf.declaration.cisco
entity.other.vrf.forwarding.cisco
entity.other.vrf.definition.cisco
entity.name.tag.vrf.vrf-name.cisco

entity.name.tag.bgp.neighbor-peer-group.name.cisco
entity.name.tag.bgp.peer-session.name.cisco
entity.name.tag.bgp.peer-policy.name.cisco
entity.name.tag.bgp.peer-group.name.cisco

entity.name.tag.qos.class.name.cisco
entity.name.tag.qos.service-policy.name.cisco
entity.name.tag.qos.policy-map.name.cisco
entity.name.tag.qos.class-map.name.cisco
entity.name.tag.qos.route-map.name.cisco
entity.name.tag.qos.prefix-list.name.cisco

keyword.other.acl.access-list.type.cisco
entity.name.tag.acl.access-list.name.cisco
entity.name.tag.acl.access-group.name.cisco
keyword.other.acl.object-group.type.cisco
entity.name.tag.acl.object-group.name.cisco

meta.function-call.command-disable.unused.cisco
meta.function-call.command-disable.default.cisco

```

## Experimental Features

### Show symbols in outline panel
Open the settings and enter a keyword in the search box. Select the check box to enable.

`@ext:Y-Ysss.cisco-config-highlight showSymbolsInOutlinePanel`

### Multilingual support
Currently, only the configuration page is available.

Following supported languages:
- English
- Japanese

## Install

[Visual Studio Marketplace - Cisco Config Highlight](https://marketplace.visualstudio.com/items?itemName=Y-Ysss.cisco-config-highlight)

## Recommended Extensions
I recommend the following extensions to more beautiful look:
- [Y-Ysss/Daybreak Theme](https://marketplace.visualstudio.com/items?itemName=Y-Ysss.vscode-daybreak-theme)
- [Jarvis Prestidge/Sublime Material Theme](https://marketplace.visualstudio.com/items?itemName=jprestidge.theme-material-theme)

## Requests or Issues
If you have any requests or Issues, please start an Issue or PullRequest on GitHub.

[GitHub - Y-Ysss/vscode-cisco-config-highlight](https://github.com/Y-Ysss/vscode-cisco-config-highlight)

## License
MIT License Copyright (c) 2021 Y-Ysss