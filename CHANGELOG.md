# Changelog
## Visual Studio Marketplace Released Version History

[marketplace.visualstudio.com/items?itemName=Y-Ysss.cisco-config-highlight&ssr=false#version-history](https://marketplace.visualstudio.com/items?itemName=Y-Ysss.cisco-config-highlight&ssr=false#version-history)


## 0.5.0 (Unreleased)
### Changed
- Update implementation of symbol display in the outline panel, which is currently an experimental feature.


## 0.4.1 (2022-06-04)
### Added
- Add syntax highlighting pattern.
  - Add pool name pattern


## 0.4.0 (2022-06-04)
### Added
- Added notification of incompatible changes.
- Add syntax highlighting pattern.
  - Add remark keyword
### Changed
- Change Token Name Issue#2
  - Note: If you have customized the token color in Settings.json, the corresponding Token must be renamed to the new name.
  - Changed the category name of tokens whose category name was QoS to Group.
  ```
  entity.name.tag.qos.class.name.cisco --> entity.name.tag.group.class.name.cisco
  entity.name.tag.qos.service-policy.name.cisco --> entity.name.tag.group.service-policy.name.cisco
  entity.name.tag.qos.policy-map.name.cisco --> entity.name.tag.group.policy-map.name.cisco
  entity.name.tag.qos.class-map.name.cisco --> entity.name.tag.group.class-map.name.cisco
  entity.name.tag.qos.route-map.name.cisco --> entity.name.tag.group.route-map.name.cisco
  entity.name.tag.qos.prefix-list.name.cisco --> entity.name.tag.group.prefix-list.name.cisco
  ```
  - Changed the category name of some tokens whose category name is ACL to Group.
  ```
  keyword.other.acl.object-group.type.cisco --> keyword.other.group.object-group.type.cisco
  entity.name.tag.acl.object-group.name.cisco --> entity.name.tag.group.object-group.name.cisco
  ```


## 0.3.5 (2021-12-12)
### Added
- Add syntax highlighting pattern.
  - Add shutdown keyword
### Changed
- Update syntax highlighting patterns.
  - Changed the beginning-of-line match pattern of some patterns from `\s` to `(^|\\s)`.
  - Updated regular expression in hostname to exclude irrelevant matches.


## 0.3.4 (2021-12-10)
### Added
- Add Command symbol to outline panel.
### Changed
- Update syntax highlighting patterns.
  - Update route-map, prefix-list patterns.
- Symbol info object moved to symbolsInfo.ts file.


## 0.3.3 (2021-11-07)
### Changed
- Update outline symbol pattern.
  - Exclude vrf forwarding from ip vrf outline symbol.


## 0.3.2 (2021-11-07)
### Changed
- Update outline symbol.
  - Add vrf symbol.


## 0.3.1 (2021-10-11)
### Changed
- Update syntax highlighting patterns.
  - Add logging system message pattern.
  - Add interface patterns. (BRI, BVI)
  - Update status pattern. (add first character uppercase.)


## 0.3.0 (2021-09-14)
### Added
- Add a list to the config to toggle which symbols to enable.
### Changed
- Changed to use TypeScript.


## 0.2.0 (2021-07-12)
### Changed
- Add the feature to show symbols in the outline panel.
- Add `showSymbolsInOutlinePanel` to configuration.


## 0.1.5 (2021-05-27)
### Changed
- Update syntax highlighting patterns.
  - Add interface async patterns
  - Add string patterns
  - Update patterns
### Removed
- remove comment patterns from `language-configuration.json`.


## 0.1.4 (2021-05-25)
### Changed
- Update syntax highlighting patterns.
  - Add interface dialer patterns
  - Change key names
  - Update patterns


## 0.1.3 (2021-05-23)
### Changed
- Update syntax highlighting patterns.
  - Add bgp pattern
  - Add acl pattern
  - Add string pattern
  - Update patterns


## 0.1.2 (2021-05-22)
### Changed
- Update syntax highlighting patterns.
  - Add patterns
  - Change key names
  - Update patterns

## 0.1.1 (2021-05-22)
### Changed
- Update syntax highlighting patterns.
  - Add patterns
  - Change key names
  - Update patterns

## 0.1.0 (2021-05-21)
### Added
- Add syntax highlighting patterns.

## 0.0.1 (2021-03-29)
- Initial release
