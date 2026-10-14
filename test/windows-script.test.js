import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 回归测试：Windows 策略与诊断日志的形态约束。
// 历史 bug：候选列表写死了 C:\Program Files\PowerShell\7\pwsh.exe，
// 但每台机器安装位置不同——必须按 PATH 解析，绝不写死绝对路径。
const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

test('win32: PowerShell 按 PATH 解析，候选列表无写死的安装路径', () => {
  const cand = src.match(/const candidates = \[([\s\S]*?)\];/);
  assert.ok(cand, '找到 candidates 数组');
  assert.ok(!cand[1].includes('Program Files'), '不得包含写死的 "Program Files" 路径');
  assert.match(cand[1], /'pwsh'/);
  assert.match(cand[1], /'powershell'/);
});

test('win32: 脚本调用 ShowWindow(hwnd, 3)，含父进程定位与超时兜底', () => {
  const m = src.match(/const WIN32_SCRIPT = `([\s\S]*?)`;/);
  assert.ok(m, '找到 WIN32_SCRIPT 模板');
  const script = m[1];
  assert.match(script, /ShowWindow\(\$hwnd, 3\)/);
  assert.match(script, /ParentProcessId/);
  assert.match(script, /MainWindowHandle/);
  assert.match(script, /not found within timeout/);
});

test('log: 只保留「本次 + 最近一次」，启动时轮转为 <log>.old，不做体积截断', () => {
  assert.match(src, /rotateLogFile/);
  assert.match(src, /LOG_OLD_SUFFIX/);
  assert.match(src, /\$\{LOG_PATH\}\$\{LOG_OLD_SUFFIX\}/);
  assert.ok(!src.includes('MAX_LOG_BYTES'), '不应存在按字节数截断的逻辑');
});
