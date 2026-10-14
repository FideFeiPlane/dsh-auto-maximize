/**
 * dsh-auto-maximize — Host-only 插件（仅运行在 host 进程）。
 *
 * 在启动时把 DeepSeek Harness 桌面窗口自动最大化一次，等价于用户手动点一次最大化按钮。
 * 插件运行在 DSH 的 host 进程里（由持有窗口的 Electron 主进程拉起），因此永远无法直接调用
 * BrowserWindow.maximize()（host 是纯 Node 进程，ELECTRON_RUN_AS_NODE=1）。改为按平台选择策略：
 *
 *   win32  1. pwsh 7（按 PATH 解析）
 *          2. Windows PowerShell 5.1（powershell.exe，Windows 自带）
 *          → 对 Electron 主进程拥有的窗口调用 Win32 ShowWindow(hwnd, SW_MAXIMIZE)
 *            （通过 host 的父进程 PID / exe 路径定位）。
 *   darwin osascript → 向最前端窗口发送最大化指令：把窗口 position/size 设为主屏可视区
 *          （AppleScriptObjC NSScreen；系统窗口 API，广泛支持）；若失败再点 AXZoomButton
 *          （绿色按钮）作为补救。需要调用方具备「辅助功能/Accessibility（System Events）」授权，
 *          缺授权时会输出逐步授权指引日志。
 *   linux  wmctrl，其次 xdotool → 对应用窗口设置 _NET_WM_STATE_MAXIMIZED
 *          （尽力而为：这些工具通常未预装）。
 *
 * 所有策略都是尽力而为、失败即软着陆：失败只记日志，绝不 crash host。
 *
 * 配置（可选，来自 profile 的 cordis.patch.yml 行）：
 *   - enabled:     false 完全禁用插件（默认 true）
 *   - timeoutMs:   持续寻找窗口的最长时间（默认 20000 毫秒）
 *   - processName: macOS/Linux 定位窗口所用的应用/进程名（默认取运行中可执行文件名）
 *   - logFile:     诊断日志：false 关闭；字符串指定自定义路径（默认 ~/.dsh/auto-maximize.log）
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

export const name = 'auto-maximize';

// ---- 自包含文件日志 -------------------------------------------------------
// host 的 ctx.logger 输出不一定落在可发现的文件里，因此插件把每一步都追加写入一个固定文件，
// 运行后很容易找到：
//   - macOS:   ~/.dsh/auto-maximize.log          （即 /Users/<you>/.dsh/…）
//   - Windows: %USERPROFILE%\.dsh\auto-maximize.log
// 可通过 `logFile` 配置：false 关闭文件日志；字符串改路径；删除文件即可清空。
// 保留策略：只记「最近几次」——每次模块加载（即每次 DSH 启动）先把上一次的日志轮转为
// <log>.old，再开始写本次，因此始终只保留「本次 + 最近一次」两份，文件不会无限累积。
const DEFAULT_LOG_FILE = path.join(os.homedir(), '.dsh', 'auto-maximize.log');
const LOG_OLD_SUFFIX = '.old';
let LOG_PATH = DEFAULT_LOG_FILE;
let LOG_ENABLED = true;

function rotateLogFile() {
  try {
    if (fs.existsSync(LOG_PATH)) {
      const oldPath = `${LOG_PATH}${LOG_OLD_SUFFIX}`;
      try { fs.rmSync(oldPath, { force: true }); } catch { /* 旧的 .old 删除失败也继续 */ }
      fs.renameSync(LOG_PATH, oldPath);
    }
  } catch {
    /* 日志文件不可访问时忽略，继续本次运行 */
  }
}
rotateLogFile();

function logLine(...args) {
  if (!LOG_ENABLED) return;
  try {
    const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
    fs.appendFileSync(LOG_PATH, line);
  } catch {
    /* 日志绝不能影响插件运行 */
  }
}

function configureLogging(logFile) {
  if (logFile === false) {
    LOG_ENABLED = false;
  } else if (typeof logFile === 'string' && logFile.length > 0) {
    LOG_PATH = logFile;
    LOG_ENABLED = true;
    rotateLogFile();
  }
}

const _require = createRequire(import.meta.url);
let PKG_VERSION = 'unknown';
try {
  PKG_VERSION = _require('../package.json').version ?? 'unknown';
} catch {
  /* 无操作 */
}
logLine(`dsh-auto-maximize: module loaded (version=${PKG_VERSION}, platform=${process.platform}, pid=${process.pid}, log=${LOG_PATH})`);

const DEFAULTS = {
  enabled: true,
  timeoutMs: 20000,
  processName: undefined,
  // undefined → 默认 ~/.dsh/auto-maximize.log；false → 关闭文件日志；字符串 → 写到此路径。
  logFile: undefined,
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
  # 优先：host 的父进程就是持有窗口的 Electron 主进程。
  $parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$hostPid" -ErrorAction SilentlyContinue).ParentProcessId
  if ($parent) {
    $cand = Get-Process -Id $parent -ErrorAction SilentlyContinue
    if ($cand -and $cand.Path -eq $exePath -and $cand.MainWindowHandle -ne [IntPtr]::Zero) {
      $hwnd = $cand.MainWindowHandle
      break
    }
  }
  # 回退：该可执行文件拥有的任意带主窗口的进程。
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
  -- 主路径：直接发送最大化指令——把窗口设为主屏可视区尺寸
  -- （set position/size 是系统窗口 API，广泛支持，不依赖缩放按钮）。
  try
    set scr to current application's NSScreen's mainScreen()
    set fullFrame to scr's frame()
    set visFrame to scr's visibleFrame()
    -- NSRect 桥接为 AppleScript 是 {{x, y}, {w, h}}。
    set screenH to item 2 of item 2 of fullFrame
    set visX to item 1 of item 1 of visFrame
    set visY to item 2 of item 1 of visFrame
    set visW to item 1 of item 2 of visFrame
    set visH to item 2 of item 2 of visFrame
    set position of win to {visX, screenH - (visY + visH)}
    set size of win to {visW, visH}
    return "maximized-bounds"
  on error errMsg
    if (errMsg contains "assistive access") or (errMsg contains "not authorized") or (errMsg contains "-1719") or (errMsg contains "-25211") or (errMsg contains "-1743") or (errMsg contains "辅助") then
      return "perm: " & errMsg
    end if
    -- 补救：点击绿色缩放按钮（即「最大化」命令）。
    try
      click (first button of win whose subrole is "AXZoomButton")
      return "maximized (zoom click)"
    on error clickErr
      if (clickErr contains "assistive access") or (clickErr contains "not authorized") or (clickErr contains "-1719") or (clickErr contains "-25211") or (clickErr contains "-1743") or (clickErr contains "辅助") then
        return "perm: " & clickErr
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

  // PowerShell 候选可执行文件，按 PATH 解析、第一个成功的胜出
  // （每台机器安装位置不同，不写死绝对路径）：
  // pwsh 7 → Windows PowerShell 5.1（powershell.exe 位于 System32，恒在 PATH）。
  const candidates = [
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
      continue; // 这个 PowerShell 未安装——试下一个
    }
    anyRan = true;
    const line = result.output.trim();
    logLine(`maximizeWindows: candidate "${candidate}" ran -> code=${result.code ?? '?'} output=${JSON.stringify(line).slice(0, 400)}`);
    if (line) ctx.logger.info(line);
    if (/maximized/.test(result.output)) { logLine('maximizeWindows: SUCCESS'); return; } // 成功
    // 该 PowerShell 跑了但没找到窗口；更低的版本不会做得更好。
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
    if (/maximized/.test(line)) { logLine('maximizeDarwin: SUCCESS'); return; } // 缩放点击或边界回退成功
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
    // wmctrl：按窗口标题匹配，追加最大化状态。
    const wm = await runTool('wmctrl', ['-r', procName, '-b', 'add,maximized_vert,maximized_horz'], { logger: ctx.logger });
    if (wm.error && wm.error.code === 'ENOENT') {
      logLine('maximizeLinux: wmctrl not installed');
      // xdotool 回退：按名称找窗口 id，再设置最大化状态。
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
  configureLogging(options.logFile);
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
