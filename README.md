<h1 align="center">
  <a href="https://github.com/Y-Ysss/vscode-cisco-config-highlight">
    <img src="https://raw.githubusercontent.com/Y-Ysss/vscode-cisco-config-highlight/main//icon.png" alt="theme icon" width="200px">
  </a><br>
    Cisco Config Highlight
</h1>
<p align="center">Cisco config Syntax Highlighting for Visual Studio Code.</p>

Cisco config Syntax Highlighting for Visual Studio Code

This project is in the development stages

## Screenshot
<img src="https://raw.githubusercontent.com/Y-Ysss/vscode-cisco-config-highlight/main/Screenshot.png" alt="screenshot">

## Token Scopes List
```
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
entity.name.class.interface.ethernet.cisco
entity.name.class.interface.wireless.cisco
entity.name.class.interface.loopback.cisco
entity.name.class.interface.portchannel.cisco
entity.name.class.interface.tunnel.cisco
entity.name.class.interface.vlan.cisco
entity.name.class.interface.null.cisco
constant.numeric.hex.cisco
constant.numeric.integer.cisco
keyword.other.ipaddress.ipv4.cidr.cisco
keyword.other.ipaddress.ipv4.full.cisco
keyword.other.ipaddress.ipv6.condensed.cisco
keyword.other.ipaddress.ipv6.full.cisco
eyword.other.ipaddress.mac.cisco
meta.function-call.command_hostname.cisco
meta.function-call.command_hostname.cisco
string.other.description.cisco
entity.name.class.vrf.declaration.cisco
entity.other.vrf.forwarding.cisco
entity.other.vrf.definition.cisco
entity.name.tag.vrf.vrf-name.cisco
entity.name.tag.qos.class.name.cisco
entity.name.tag.qos.service-policy.name.cisco
entity.name.tag.qos.policy-map.name.cisco
entity.name.tag.qos.class-map.name.cisco
entity.name.tag.qos.route-map.name.cisco
entity.name.tag.qos.prefix-list.name.cisco
keyword.other.qos.access-list.type.cisco
entity.name.tag.qos.access-list.name.cisco
entity.name.tag.qos.access-group.type.cisco
keyword.other.qos.object-group.type.cisco
entity.name.tag.qos.object-group.name.cisco
meta.function-call.command-disable.unused.cisco
meta.function-call.command-disable.default.cisco
```


## Token Color Customizations

VSCode settings customize sample

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
                    "keyword.other.ipaddress",
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

## License
MIT License Copyright (c) 2021 Y-Ysss