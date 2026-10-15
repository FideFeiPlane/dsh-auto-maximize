# Changelog / 更新日志

## 1.1.6 - 2026-10-14

变更
- Windows：PowerShell 候选改为按 PATH 解析（`pwsh` → `powershell`），不再写死 `C:\Program Files\PowerShell\7\pwsh.exe`——每台机器安装位置不同，写死路径可能失效。
- 诊断日志：改为只保留最近几次——每次启动把上一次日志轮转为 `auto-maximize.log.old`，只留「本次 + 最近一次」两份，不再按体积累积。
- 新增 Windows 回归测试（候选列表无写死路径、ShowWindow 脚本形态、日志轮转）。

Change
- Windows: resolve PowerShell via PATH (`pwsh` → `powershell`) instead of the hardcoded
  `C:\Program Files\PowerShell\7\pwsh.exe` — install locations differ per machine, a fixed
  path can silently fail.
- Diagnostic log: keeps only the recent runs — each startup rotates the previous log to
  `auto-maximize.log.old`, retaining just "this run + the previous one" instead of growing
  by size.
- New Windows regression tests (PATH-based candidates, ShowWindow script shape, log rotation).

## 1.1.5 - 2026-10-14

变更
- 新增配置 `logFile`：`false` 关闭文件日志；传路径字符串可改日志位置（默认 `~/.dsh/auto-maximize.log`）；删除该文件即可清空。
- 新增 macOS 脚本回归测试（NSRect 分量提取、几何主路径顺序、权限关键词）。
- `CHANGELOG.md` 加入 npm 包 `files`，随包发布。

Change
- New `logFile` config option: `false` disables the file log, a path string relocates it
  (default `~/.dsh/auto-maximize.log`). Deleting the file clears it.
- Regression tests for the macOS script (NSRect component extraction, geometry-primary
  order, permission keywords).
- `CHANGELOG.md` added to the npm package `files`, so it ships with the tarball.

## 1.1.4 - 2026-10-14

变更
- macOS：主路径改为「发送最大化指令」——把窗口 `set position/size` 到主屏可视区（系统窗口 API，不依赖缩放按钮）；`AXZoomButton` 点击降为补救。

Change
- macOS: make "send the maximize instruction" the primary path — resize the front window to
  the main screen's visible frame (`set position/size`, the broadly-supported system window
  API, no dependence on the zoom button). The `AXZoomButton` click is now only a remedy if
  the geometry call fails.

## 1.1.3 - 2026-10-14

变更
- macOS：几何回退脚本用 `item 4 of fullFrame` 读取屏幕 frame，但 `NSRect` 桥接为 AppleScript 是两层列表 `{{x, y}, {w, h}}`，必然报「不能获得」导致按边界最大化从未生效。已改为正确的 `item` 路径（高度取 `item 2 of item 2`）。
- macOS：缩放按钮点击失败时现在会把原因返回并记入日志，不再被静默吞掉；最终失败行还会附带目标窗口标题便于诊断。

Change
- macOS: the geometry fallback read the screen frame with `item 4 of fullFrame`, but an
  `NSRect` bridges to AppleScript as a two-level list `{{x, y}, {w, h}}`, so that always
  threw "不能获得/Can't get" and the maximize-by-bounds path never ran. Extract the
  components with the correct `item` paths (`item 2 of item 2` for height, etc.).
- macOS: when the zoom button click fails, the reason is now returned in the output (and
  logged) instead of being silently swallowed, and the targeted window's title is included in
  the final failure line for diagnosis.

## 1.1.2 - 2026-10-14

变更
- 自包含文件日志：每一步（模块加载、`apply()`、每个子工具、每次 osascript/PowerShell 输出、最终结果）都会追加写入 `~/.dsh/auto-maximize.log`（macOS：`/Users/<you>/.dsh/…`，Windows：`%USERPROFILE%\.dsh\…`）。host 的 `ctx.logger` 输出不一定落在可发现的文件里，此日志提供始终可找到的排查线索。

Change
- Self-contained file logger: every step (module load, `apply()`, each spawned tool,
  per-attempt osascript/PowerShell output, final outcome) is appended to
  `~/.dsh/auto-maximize.log` (macOS: `/Users/<you>/.dsh/…`, Windows:
  `%USERPROFILE%\.dsh\…`). The host's `ctx.logger` output may not land in a discoverable
  file, so this gives an always-findable trace for diagnosing why startup maximization does
  not take effect on a machine.

## 1.1.1 - 2026-10-14

变更
- macOS：将 `-1719`（不允许辅助访问）与本地化中文关键词「辅助」识别为辅助功能权限错误，使非英文（如简体中文）系统也能输出授权指引而非泛化失败。

Change
- macOS: also recognize `-1719` ("assistive access not allowed") and the localized
  Chinese keyword `辅助` as Accessibility-permission errors, so the grant guide is logged on
  non-English (e.g. 简体中文) macOS systems instead of a generic failure.

## 1.1.0 - 2026-10-14

变更
- macOS：几何回退——`AXZoomButton` 点击失败时，把窗口设为主屏可视区大小（AppleScriptObjC 的 `NSScreen.visibleFrame`）。
- macOS：检测缺失的辅助功能授权并输出逐步授权指引（系统设置→隐私与安全性→辅助功能），不再泛化失败。
- macOS：区分权限错误与「找不到窗口」，使重试与指引更准确。
- 占位插件图标（`assets/icon.svg`）。
- GitHub Actions CI（`.github/workflows/ci.yml`）：push/PR 跑 `npm test` + `npm pack --dry-run`；`v*` tag 时带 provenance 发布。
- README：macOS 授权指引、多实例行为、Roadmap。

Change
- macOS: geometry fallback — when the `AXZoomButton` click fails, set the window bounds to
  the main screen's visible frame (`NSScreen.visibleFrame` via AppleScriptObjC).
- macOS: detect missing Accessibility permission and log a step-by-step grant guide (System
  Settings → Privacy & Security → Accessibility), instead of a generic failure.
- macOS: distinguishing permission errors from "window not found" so the retry loop and
  guidance are accurate.
- Placeholder plugin icon (`assets/icon.svg`).
- GitHub Actions CI (`.github/workflows/ci.yml`): `npm test` + `npm pack --dry-run` on
  push/PR; publish-with-provenance job on `v*` tags.
- README: macOS permission guide, multi-instance behavior, Roadmap section.

## 1.0.0 - 2026-10-14

变更
- DSH host-only 插件，启动时自动最大化桌面窗口。
- Windows 策略：通过 PowerShell 调用 Win32 `ShowWindow(hwnd, SW_MAXIMIZE)`，pwsh 7 → Windows PowerShell 5.1 自动回退。
- macOS 策略：AppleScript 点击 `AXZoomButton`。
- Linux 策略：`wmctrl` → `xdotool`（`_NET_WM_STATE_MAXIMIZED`）。
- 配置：`enabled`、`timeoutMs`、`processName`。
- 冒烟测试（node:test）、可发布的 npm 包（`dsh.bundle` 清单）。

Change
- Host-only DSH plugin that maximizes the desktop window at startup.
- Windows strategy: Win32 `ShowWindow(hwnd, SW_MAXIMIZE)` via PowerShell, with automatic
  fallback pwsh 7 → Windows PowerShell 5.1.
- macOS strategy: AppleScript click on the `AXZoomButton`.
- Linux strategy: `wmctrl` → `xdotool` (`_NET_WM_STATE_MAXIMIZED`).
- Config: `enabled`, `timeoutMs`, `processName`.
- Smoke tests (node:test), publish-ready npm package (`dsh.bundle` manifest).

---

仓库：Gitee（主）<https://gitee.com/FideFei/dsh-auto-maximize> ｜ GitHub（镜像）<https://github.com/FideFeiPlane/dsh-auto-maximize>
