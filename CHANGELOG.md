# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - 2026-10-14

### Added
- Host-only DSH plugin that maximizes the desktop window at startup.
- Windows strategy: Win32 `ShowWindow(hwnd, SW_MAXIMIZE)` via PowerShell, with
  automatic fallback pwsh 7 → Windows PowerShell 5.1.
- macOS strategy: AppleScript click on the `AXZoomButton`.
- Linux strategy: `wmctrl` → `xdotool` (`_NET_WM_STATE_MAXIMIZED`).
- Config: `enabled`, `timeoutMs`, `processName`.
- Smoke tests (node:test), publish-ready npm package (`dsh.bundle` manifest).

[1.0.0]: https://gitee.com/FideFei/dsh-auto-maximize
