/**
 * dsh-auto-maximize — Host-only plugin.
 *
 * Maximizes the DeepSeek Harness desktop window once at startup, equivalent to
 * the user clicking the maximize button. Runs inside the DSH host process
 * (spawned by the Electron main process that owns the window), so it can never
 * call BrowserWindow.maximize() directly (the host is a Node process,
 * ELECTRON_RUN_AS_NODE=1). Instead it picks a per-platform strategy:
 *
 *   win32  1. pwsh 7 (configured or auto-detected)
 *          2. Windows PowerShell 5.1 (powershell.exe, always present on Windows)
 *          → Win32 ShowWindow(hwnd, SW_MAXIMIZE) on the window owned by the
 *            Electron main process (found via the host's parent PID / exe path).
 *   darwin osascript → click the front window's AXZoomButton (the green button,
 *          i.e. exactly the "maximize" button); if that fails, set the window
 *          bounds to the main screen's visible frame (AppleScriptObjC NSScreen).
 *          Requires the caller to have Accessibility (System Events) permission;
 *          a step-by-step grant guide is logged when the permission is missing.
 *   linux  wmctrl, then xdotool → set _NET_WM_STATE_MAXIMIZED on the app window
 *          (best-effort: these tools are usually not preinstalled).
 *
 * All strategies are best-effort and fail soft: on failure they log a warning
 * and never crash the host.
 *
 * Configuration (optional, from the profile's cordis.patch.yml row):
 *   - enabled:     false disables the plugin entirely (default true)
 *   - timeoutMs:   how long to keep looking for the window (default 20000)
 *   - processName: app/process name used to locate the window on macOS/Linux
 *                  (default: derived from the running executable)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

export const name = 'auto-maximize';

// ---- Self-contained file logger -----------------------------------------
// The host's ctx.logger output may not land in a discoverable file, so the
// plugin also appends every step to a fixed file that is trivial to find after
// a run:
//   - macOS:   ~/.dsh/auto-maximize.log          (i.e. /Users/<you>/.dsh/…)
//   - Windows: %USERPROFILE%\.dsh\auto-maximize.log
const LOG_FILE = path.join(os.homedir(), '.dsh', 'auto-maximize.log');

function logLine(...args) {
  try {
    const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* logging must never break the plugin */
  }
}

const _require = createRequire(import.meta.url);
let PKG_VERSION = 'unknown';
try {
  PKG_VERSION = _require('../package.json').version ?? 'unknown';
} catch {
  /* noop */
}
logLine(`dsh-auto-maximize: module loaded (version=${PKG_VERSION}, platform=${process.platform}, pid=${process.pid}, log=${LOG_FILE})`);

const DEFAULTS = {
  enabled: true,
  timeoutMs: 20000,
  processName: undefined,
};

const WIN32_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DshAutoMaximize {
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@
$hostPid = {HOST_PID}
$exePath = '{EXE_PATH}'
$timeoutMs = {TIMEOUT_MS}
$deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
$hwnd = [IntPtr]::Zero
while ([DateTime]::UtcNow -lt $deadline) {
  # Preferred: the host's parent is the Electron main process that owns the window.
  $parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$hostPid" -ErrorAction SilentlyContinue).ParentProcessId
  if ($parent) {
    $cand = Get-Process -Id $parent -ErrorAction SilentlyContinue
    if ($cand -and $cand.Path -eq $exePath -and $cand.MainWindowHandle -ne [IntPtr]::Zero) {
      $hwnd = $cand.MainWindowHandle
      break
    }
  }
  # Fallback: any window owned by this executable.
  $scan = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exePath -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
  if ($scan) {
    $hwnd = $scan.MainWindowHandle
    break
  }
  Start-Sleep -Milliseconds 500
}
if ($hwnd -ne [IntPtr]::Zero) {
  [DshAutoMaximize]::ShowWindow($hwnd, 3) | Out-Null
  Write-Output "dsh-auto-maximize: maximized (hwnd=$hwnd)"
} else {
  Write-Output 'dsh-auto-maximize: desktop window not found within timeout'
}
`;

const DARWIN_SCRIPT = `
use framework "AppKit"
tell application "System Events"
  try
    set frontmost of process "{PROC}" to true
  on error errMsg
    if (errMsg contains "assistive access") or (errMsg contains "not authorized") or (errMsg contains "-1719") or (errMsg contains "-25211") or (errMsg contains "-1743") or (errMsg contains "辅助") then
      return "perm: " & errMsg
    end if
    return "fail: " & errMsg
  end try
  try
    set win to front window of process "{PROC}"
  on error errMsg
    if (errMsg contains "assistive access") or (errMsg contains "not authorized") or (errMsg contains "-1719") or (errMsg contains "-25211") or (errMsg contains "-1743") or (errMsg contains "辅助") then
      return "perm: " & errMsg
    end if
    return "nowindow: " & errMsg
  end try
  -- True maximize: click the green zoom button (the "maximize" command).
  try
    click (first button of win whose subrole is "AXZoomButton")
    return "maximized"
  on error clickErr
    if (clickErr contains "assistive access") or (clickErr contains "not authorized") or (clickErr contains "-1719") or (clickErr contains "-25211") or (clickErr contains "-1743") or (clickErr contains "辅助") then
      return "perm: " & clickErr
    end if
    -- Zoom button unavailable: send the maximize instruction directly by
    -- resizing the window to the main screen's visible frame.
    try
      set scr to current application's NSScreen's mainScreen()
      set fullFrame to scr's frame()
      set visFrame to scr's visibleFrame()
      -- An NSRect bridges to AppleScript as {{x, y}, {w, h}}.
      set screenH to item 2 of item 2 of fullFrame
      set visX to item 1 of item 1 of visFrame
      set visY to item 2 of item 1 of visFrame
      set visW to item 1 of item 2 of visFrame
      set visH to item 2 of item 2 of visFrame
      set position of win to {visX, screenH - (visY + visH)}
      set size of win to {visW, visH}
      return "maximized-bounds (zoom click failed: " & clickErr & ")"
    on error errMsg
      if (errMsg contains "assistive access") or (errMsg contains "not authorized") or (errMsg contains "-1719") or (errMsg contains "-25211") or (errMsg contains "-1743") or (errMsg contains "辅助") then
        return "perm: " & errMsg
      end if
      return "fail: " & errMsg & " | click: " & clickErr & " | win: " & (name of win)
    end try
  end try
end tell
`;

function runTool(file, args, { logger, extraTimeoutMs = 5000 }) {
  logLine(`runTool: spawn ${file} ${JSON.stringify(args)}`);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      logger.warn(`dsh-auto-maximize: cannot start ${file}: ${error.message}`);
      logLine(`runTool: spawn ${file} FAILED: ${error.message}`);
      resolve({ ok: false, output: '' });
      return;
    }
    let output = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      logLine(`runTool: ${file} done -> code=${result.code ?? '?'}${result.error ? ` err=${result.error.message}` : ''} output=${JSON.stringify(result.output).slice(0, 900)}`);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* already gone */ }
      finish({ ok: false, output });
    }, extraTimeoutMs);
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => {
      finish({ ok: false, output, error });
    });
    child.on('close', (code) => {
      finish({ ok: true, output, code });
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function appProcessName(options) {
  if (options.processName) return options.processName;
  return path.basename(process.execPath).replace(/\.exe$/i, '');
}

async function maximizeWindows(ctx, options) {
  const exePath = process.execPath;
  const exeLiteral = String(exePath).replace(/'/g, "''");
  const script = WIN32_SCRIPT
    .replace('{HOST_PID}', String(process.pid))
    .replace('{EXE_PATH}', exeLiteral)
    .replace('{TIMEOUT_MS}', String(options.timeoutMs));
  logLine(`maximizeWindows: start (hostPid=${process.pid}, exePath=${exePath}, timeoutMs=${options.timeoutMs})`);

  // Candidate PowerShell executables, first success wins:
  // configured pwsh path → pwsh 7 on PATH → Windows PowerShell 5.1 (always present).
  const candidates = [
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'pwsh',
    'powershell',
  ];
  let lastError = null;
  let anyRan = false;
  for (const candidate of candidates) {
    const result = await runTool(candidate, [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
      '-Command', script,
    ], { logger: ctx.logger, extraTimeoutMs: options.timeoutMs + 10000 });
    if (result.error && result.error.code === 'ENOENT') {
      logLine(`maximizeWindows: candidate "${candidate}" not installed (ENOENT)`);
      lastError = result.error;
      continue; // this PowerShell is not installed — try the next one
    }
    anyRan = true;
    const line = result.output.trim();
    logLine(`maximizeWindows: candidate "${candidate}" ran -> code=${result.code ?? '?'} output=${JSON.stringify(line).slice(0, 400)}`);
    if (line) ctx.logger.info(line);
    if (/maximized/.test(result.output)) { logLine('maximizeWindows: SUCCESS'); return; } // success
    // A PowerShell ran but found no window; lower versions won't do any better.
    lastError = new Error(result.output.trim() || 'no window found');
    break;
  }
  ctx.logger.warn(`dsh-auto-maximize: could not maximize on Windows (${lastError ? lastError.message : 'unknown'}, ran=${anyRan})`);
  logLine(`maximizeWindows: FAILED (${lastError ? lastError.message : 'unknown'}, ran=${anyRan})`);
}

async function maximizeDarwin(ctx, options) {
  const procName = appProcessName(options);
  const script = DARWIN_SCRIPT.replaceAll('{PROC}', procName);
  logLine(`maximizeDarwin: start (procName="${procName}", timeoutMs=${options.timeoutMs})`);
  let sawPermission = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await runTool('osascript', ['-e', script], { logger: ctx.logger, extraTimeoutMs: options.timeoutMs + 10000 });
    const line = result.output.trim();
    logLine(`maximizeDarwin: attempt ${attempt} line=${JSON.stringify(line)}`);
    if (line) ctx.logger.info(line);
    if (/maximized/.test(line)) { logLine('maximizeDarwin: SUCCESS'); return; } // zoom click or bounds fallback succeeded
    if (/^perm:/i.test(line)) { sawPermission = true; break; }
    await sleep(1000);
  }
  if (sawPermission) {
    logLine(`maximizeDarwin: PERMISSION MISSING (procName="${procName}")`);
    ctx.logger.warn(
      'dsh-auto-maximize: macOS needs Accessibility permission to control windows via System Events. ' +
      'Open System Settings → Privacy & Security → Accessibility, enable it for ' +
      'DeepSeek Harness (and any app that launches it), then restart DeepSeek Harness. ' +
      `(target process: "${procName}")`
    );
    return;
  }
  ctx.logger.warn(`dsh-auto-maximize: could not maximize on macOS (osascript returned no zoom/bounds for "${procName}")`);
  logLine(`maximizeDarwin: FAILED (osascript returned no zoom/bounds for "${procName}")`);
}

async function maximizeLinux(ctx, options) {
  const procName = appProcessName(options);
  logLine(`maximizeLinux: start (procName="${procName}")`);
  for (let attempt = 0; attempt < 3; attempt++) {
    // wmctrl: match window title, add maximized states.
    const wm = await runTool('wmctrl', ['-r', procName, '-b', 'add,maximized_vert,maximized_horz'], { logger: ctx.logger });
    if (wm.error && wm.error.code === 'ENOENT') {
      logLine('maximizeLinux: wmctrl not installed');
      // xdotool fallback: find window id by name, then set maximized states.
      const found = await runTool('xdotool', ['search', '--name', procName], { logger: ctx.logger });
      if (found.error && found.error.code === 'ENOENT') {
        ctx.logger.warn('dsh-auto-maximize: neither wmctrl nor xdotool is installed; cannot maximize on Linux');
        logLine('maximizeLinux: FAILED (neither wmctrl nor xdotool installed)');
        return;
      }
      const ids = found.output.trim().split(/\s+/).filter(Boolean);
      let done = false;
      for (const id of ids) {
        const set = await runTool('xdotool', ['windowstate', '--add', 'MAXIMIZED_VERT', 'MAXIMIZED_HORZ', id], { logger: ctx.logger });
        if (!set.error && set.code === 0) { done = true; break; }
      }
      if (done) { ctx.logger.info(`dsh-auto-maximize: maximized (xdotool, ${ids.length} window(s))`); logLine(`maximizeLinux: SUCCESS (xdotool, ${ids.length} window(s))`); return; }
    } else if (wm.code === 0) {
      ctx.logger.info('dsh-auto-maximize: maximized (wmctrl)');
      logLine('maximizeLinux: SUCCESS (wmctrl)');
      return;
    }
    await sleep(1000);
  }
  ctx.logger.warn(`dsh-auto-maximize: could not maximize on Linux (window "${procName}" not matched)`);
  logLine(`maximizeLinux: FAILED (window "${procName}" not matched)`);
}

export function apply(ctx, config = {}) {
  const options = { ...DEFAULTS, ...(config ?? {}) };
  logLine(`apply: called, config=${JSON.stringify(config ?? {})} options=${JSON.stringify(options)}`);
  if (options.enabled === false) {
    ctx.logger.info('dsh-auto-maximize: disabled by config');
    logLine('apply: disabled by config, returning');
    return;
  }

  ctx.effect(async () => {
    logLine(`apply: effect running (platform=${process.platform}, cwd=${process.cwd()}, execPath=${process.execPath})`);
    try {
      if (process.platform === 'win32') await maximizeWindows(ctx, options);
      else if (process.platform === 'darwin') await maximizeDarwin(ctx, options);
      else if (process.platform === 'linux') await maximizeLinux(ctx, options);
      else {
        ctx.logger.info(`dsh-auto-maximize: unsupported platform "${process.platform}", nothing to do`);
        logLine(`apply: unsupported platform "${process.platform}"`);
      }
    } catch (error) {
      ctx.logger.warn(`dsh-auto-maximize: ${error.message}`);
      logLine(`apply: effect threw: ${error.stack ?? error.message}`);
    }
    logLine('apply: effect finished');
  }, 'dsh-auto-maximize');
}
