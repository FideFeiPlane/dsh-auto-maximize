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
| Windows | Win32 `ShowWindow(hwnd, SW_MAXIMIZE)` | **pwsh 7** → **Windows PowerShell 5.1** fallback | Falls back to 5.1 (always present on Windows) automatically; no install needed. The `Add-Type` script works on both. |
| macOS | AppleScript clicks the green `AXZoomButton` | `osascript` (built-in) | Requires Accessibility permission for the caller; override the app name with `processName`. |
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
- On failure only writes to the host log (keyword `dsh-auto-maximize`); the app keeps running.

## License

[MIT](LICENSE) © FideFei
