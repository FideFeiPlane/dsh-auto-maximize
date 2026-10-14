# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [1.1.4] - 2026-10-14

### Changed
- macOS: make "send the maximize instruction" the primary path — resize the
  front window to the main screen's visible frame (`set position/size`, the
  broadly-supported system window API, no dependence on the zoom button). The
  `AXZoomButton` click is now only a remedy if the geometry call fails.

## [1.1.3] - 2026-10-14

### Fixed
- macOS: the geometry fallback read the screen frame with `item 4 of fullFrame`,
  but an `NSRect` bridges to AppleScript as a two-level list `{{x, y}, {w, h}}`,
  so that always threw "不能获得/Can't get" and the maximize-by-bounds path never
  ran. Extract the components with the correct `item` paths (`item 2 of item 2`
  for height, etc.). This is the "send the window a maximize instruction" path
  (resize to the main screen's visible frame) and no longer depends on the zoom
  button being clickable.
- macOS: when the zoom button click fails, the reason is now returned in the
  output (and logged) instead of being silently swallowed, and the targeted
  window's title is included in the final failure line for diagnosis.

## [1.1.2] - 2026-10-14

### Added
- Self-contained file logger: every step (module load, `apply()`, each spawned
  tool, per-attempt osascript/PowerShell output, final outcome) is appended to
  `~/.dsh/auto-maximize.log` (macOS: `/Users/<you>/.dsh/…`, Windows:
  `%USERPROFILE%\.dsh\…`). The host's `ctx.logger` output may not land in a
  discoverable file, so this gives an always-findable trace for diagnosing why
  startup maximization does not take effect on a machine.

## [1.1.1] - 2026-10-14

### Fixed
- macOS: also recognize `-1719` ("assistive access not allowed") and the localized
  Chinese keyword `辅助` as Accessibility-permission errors, so the grant guide is
  logged on non-English (e.g. 简体中文) macOS systems instead of a generic failure.

## [1.1.0] - 2026-10-14

### Added
- macOS: geometry fallback — when the `AXZoomButton` click fails, set the window bounds
  to the main screen's visible frame (`NSScreen.visibleFrame` via AppleScriptObjC).
- macOS: detect missing Accessibility permission and log a step-by-step grant guide
  (System Settings → Privacy & Security → Accessibility), instead of a generic failure.
- Placeholder plugin icon (`assets/icon.svg`).
- GitHub Actions CI (`.github/workflows/ci.yml`): `npm test` + `npm pack --dry-run` on
  push/PR; publish-with-provenance job on `v*` tags.
- README: macOS permission guide, multi-instance behavior, Roadmap section.

### Fixed
- macOS: distinguishing permission errors from "window not found" so the retry loop and
  guidance are accurate.

## [1.0.0] - 2026-10-14

### Added
- Host-only DSH plugin that maximizes the desktop window at startup.
- Windows strategy: Win32 `ShowWindow(hwnd, SW_MAXIMIZE)` via PowerShell, with
  automatic fallback pwsh 7 → Windows PowerShell 5.1.
- macOS strategy: AppleScript click on the `AXZoomButton`.
- Linux strategy: `wmctrl` → `xdotool` (`_NET_WM_STATE_MAXIMIZED`).
- Config: `enabled`, `timeoutMs`, `processName`.
- Smoke tests (node:test), publish-ready npm package (`dsh.bundle` manifest).

[1.1.4]: https://gitee.com/FideFei/dsh-auto-maximize
[1.1.3]: https://gitee.com/FideFei/dsh-auto-maximize
[1.1.2]: https://gitee.com/FideFei/dsh-auto-maximize
[1.1.1]: https://gitee.com/FideFei/dsh-auto-maximize
[1.1.0]: https://gitee.com/FideFei/dsh-auto-maximize
[1.0.0]: https://gitee.com/FideFei/dsh-auto-maximize
