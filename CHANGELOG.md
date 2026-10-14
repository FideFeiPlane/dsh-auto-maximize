# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

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

[1.1.1]: https://gitee.com/FideFei/dsh-auto-maximize
[1.1.0]: https://gitee.com/FideFei/dsh-auto-maximize
[1.0.0]: https://gitee.com/FideFei/dsh-auto-maximize
