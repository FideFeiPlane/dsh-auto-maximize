# dsh-auto-maximize

DeepSeek Harness desktop plugin: **automatically maximizes the main window on startup** (equivalent to clicking the maximize button once).

Works with the DSH desktop app (desktop profile) and any scenario where DSH runs inside an Electron/system window.

## How it works & platform support

The plugin is host-only: it loads in the host process at app startup. The host is a Node child process
(`ELECTRON_RUN_AS_NODE=1`, spawned by the Electron main process that owns the window), so it can never
call `BrowserWindow.maximize()` — instead it uses per-platform OS-level maximize. Everything is
**best-effort: on failure it logs a warning and never crashes the host**:

| Platform | Strategy | Dependency | Notes |
|---|---|---|---|
| Windows | Win32 `ShowWindow(hwnd, SW_MAXIMIZE)` | **pwsh 7** → **Windows PowerShell 5.1** fallback | Falls back to 5.1 (always present on Windows) automatically; no install needed. PowerShell is resolved via PATH, no hardcoded install path. The `Add-Type` script works on both. Direct Win32 API call — no extra permission required. |
| macOS | Resize the window to the main screen's visible frame (`NSScreen.visibleFrame` — i.e. "send the window a maximize instruction"); if that fails, click the green `AXZoomButton` as a remedy | `osascript` (built-in) | Requires Accessibility permission for the caller; a grant guide is logged when missing. Override the app name with `processName`. |
| Linux | `wmctrl` → `xdotool` set `_NET_WM_STATE_MAXIMIZED` | usually **not preinstalled** | Best-effort; skips silently if both are missing. |

Window lookup (Windows): prefer the host's parent PID (the Electron main process) with a matching
executable path; fall back to scanning all processes with a main window for that executable path.
macOS/Linux match by window title / process name (defaults to the running executable's basename,
override with `processName`).

**Why not `BrowserWindow.maximize()`:** the host process is plain Node (`ELECTRON_RUN_AS_NODE=1`,
`require('electron')` fails), so plugins can only reach OS-level window handles. "Auto maximize" is
implemented as "equivalent to the user clicking the maximize button once" via system calls, not an
Electron API call.

## Install

### Option 1: from the plugin market / npm (once published)

```sh
dsh plugin --profile desktop add dsh-auto-maximize
```

### Option 2: local project install (development)

In your profile directory (e.g. `~/.dsh/profiles/desktop`):

```jsonc
// package.json
{
  "dependencies": { "dsh-auto-maximize": "file:./plugins/dsh-auto-maximize" },
  "dsh": { "profile": { "bundles": [ /* append */ "dsh-auto-maximize" ] } }
}
```

Then `pnpm install` and restart the DeepSeek Harness desktop app.

## Configuration

Override the `auto-maximize` row in the profile's `cordis.patch.yml`:

```yaml
- id: auto-maximize
  config:
    enabled: false        # disable
    timeoutMs: 30000      # how long to keep looking for the window (ms, default 20000)
    processName: 'DeepSeek Harness'   # process name used to locate the window on macOS/Linux
```

Options:

| Config | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | `false` disables the plugin entirely |
| `timeoutMs` | number | `20000` | max time to keep looking for the window (ms) |
| `processName` | string | executable basename | process/window name to match on macOS/Linux |
| `logFile` | boolean \| string | `~/.dsh/auto-maximize.log` | diagnostic log: `false` disables file logging; a string relocates it; delete the file to clear it |

## macOS: Accessibility permission required

On macOS, controlling another app's windows via `osascript` (System Events) requires
**Accessibility** permission. When it is missing the plugin logs a guide (keyword
`dsh-auto-maximize`). Grant it like this, then restart:

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Enable **DeepSeek Harness** (and the terminal/launcher that hosts it, if any).
3. Restart DeepSeek Harness (the grant does not affect already-running processes).

> ⚠️ **Note: the "instruction form" also needs the permission.** Whether the plugin resizes
> the window directly (`set position/size` — "send the window a maximize instruction") or
> clicks `AXZoomButton`, **both go through the same macOS Accessibility API and both need the
> Accessibility grant**. Why: the plugin runs in the host (an external Node process), and the
> only way it can move another process's window is that API — the system's gate is on the API
> itself, not on process identity. Even though `osascript` is DSH's own child process, TCC
> attributes the grant to the DSH app (so enabling DeepSeek Harness covers it), but it does
> not waive the grant. The only permission-free route is DSH maximizing its own window inside
> its own process (a startup flag / host→main IPC calling `BrowserWindow.maximize()`) — that
> needs a DSH-provided channel, which an external plugin cannot offer. **Keep the grant.**

If it still does not work, set `processName` to the real process name — a packaged app's
display name can differ from its executable's basename.

**Diagnostic log**: since 1.1.2 every step is appended to `~/.dsh/auto-maximize.log`
(Windows: `%USERPROFILE%\.dsh\auto-maximize.log`). When maximize "doesn't work", open this
file and you will immediately see the `osascript` result: `perm:` (missing permission) /
`nowindow:` (window not found) / `maximized-bounds` (success). Each startup rotates the
previous log to `auto-maximize.log.old`, keeping only this run and the previous one. Disable
it with `logFile: false`, or delete the file to clear it.

> By contrast, **Windows needs no extra permission**: `ShowWindow(hwnd, SW_MAXIMIZE)` is a
> direct Win32 API call (not simulated clicks) and needs no elevation for the user's own window.

## Uninstall

Remove `dsh-auto-maximize` from both places in the profile's `package.json`
(`dependencies` + `dsh.profile.bundles`), run `pnpm install`, restart the app.

## Development

```sh
npm install   # no third-party runtime deps; dev only (tests use node:test)
npm test      # smoke tests: module load / disabled branch / effect registration
npm pack      # build the publishable tarball (runs tests first)
```

## Publishing to npm

```sh
npm login                                   # first time
npm publish --registry https://registry.npmjs.org
```

Once published, submit the plugin for listing in [dsh-market](https://github.com/dsh-market/dsh-market)
via its "Submit a plugin ↗" link (a `data/plugins/<owner>__<repo>.yml` file in
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — see
[contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)).

## Known limitations

- Only meaningful in the desktop profile; a web profile has no window and the plugin skips silently.
- Runs once at startup; never touches window state you change during a session.
- Multi-instance/multi-window: on Windows it first locates the owning instance's window via
  "the host's parent PID + executable path", so multiple DSH instances don't interfere; only if
  parent matching fails does it scan all windows for the executable, which may hit another
  instance in a multi-open scenario. macOS/Linux take the "frontmost / first match" window —
  use `processName` to disambiguate when running several instances.
- On failure only writes to the host log (keyword `dsh-auto-maximize`); the app keeps running.

## Roadmap (not implemented — PRs welcome)

- **Settings UI toggle**: wire `enabled` into "Settings → General". The plugin is host-only and
  currently reads `cordis.patch.yml` only; a UI switch needs a client-plugin settings panel.
- **Drop the PowerShell dependency**: on Windows an FFI binding (e.g. koffi) could call
  `user32.dll` directly without spawning a subprocess, but it would add a native binary and
  break the "zero runtime deps" property, so it was not adopted (today PS 5.1 ships with Windows).
- **Official icon**: `assets/icon.svg` is a placeholder maximize glyph — a real icon is welcome.

## License

[MIT](LICENSE) © FideFei
