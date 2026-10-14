# dsh-auto-maximize

DeepSeek Harness 桌面版插件：**打开时自动最大化主窗口**（等价于启动后手动点一次「最大化」按钮）。

适用于 DSH 桌面版（desktop profile）与任何以 Electron/系统窗口运行 DSH 的场景。

## 原理与平台支持

插件是 host-only 插件，随桌面版 host 进程在应用启动时加载。host 进程是 Node 子进程
（`ELECTRON_RUN_AS_NODE=1`，由 Electron 主进程拉起），拿不到 `BrowserWindow`，
因此按平台调用系统级「最大化」能力，全部**尽力而为、失败只记日志、绝不 crash host**：

| 平台 | 策略 | 依赖 | 备注 |
|---|---|---|---|
| Windows | Win32 `ShowWindow(hwnd, SW_MAXIMIZE)` | **pwsh 7** → **Windows PowerShell 5.1** 自动回退 | pwsh 7 缺失时自动用 5.1（Windows 自带）；无需额外安装。5.1 的 `Add-Type` 内置编译器，脚本两版通用 |
| macOS | AppleScript 点击窗口绿色 `AXZoomButton` | `osascript`（系统自带） | 需要「辅助功能/Accessibility」授权给调用方；`processName` 可覆盖应用名 |
| Linux | `wmctrl` → `xdotool` 设置 `_NET_WM_STATE_MAXIMIZED` | 通常**未预装**，需自行安装 | 尽力而为；两者都缺则跳过 |

窗口定位（Windows）：优先取 host 进程的父进程 PID（即 Electron 主进程）且可执行文件路径一致，
失败则按可执行文件路径扫描所有带主窗口的进程。macOS/Linux 按窗口标题/进程名匹配
（默认取运行中的可执行文件名，可用 `processName` 覆盖）。

**为什么不能直接调 `BrowserWindow.maximize()`**：host 进程是纯 Node（`ELECTRON_RUN_AS_NODE=1`，
已实测 `require('electron')` 失败），插件只能拿到系统级窗口句柄——因此「自动最大化」被实现为
「等价于用户点击一次最大化按钮」的系统调用，而非 Electron API 调用。

## 安装

### 方式一：通过插件市场 / npm（推荐，发布后可用）

```sh
dsh plugin --profile desktop add dsh-auto-maximize
```

### 方式二：本地工程安装（开发调试）

在 profile 目录（如 `~/.dsh/profiles/desktop`）：

```jsonc
// package.json
{
  "dependencies": { "dsh-auto-maximize": "file:./plugins/dsh-auto-maximize" },
  "dsh": { "profile": { "bundles": [ /* 追加 */ "dsh-auto-maximize" ] } }
}
```

然后 `pnpm install`，重启 DeepSeek Harness 桌面版。

## 配置

在 profile 的 `cordis.patch.yml` 中覆盖 `auto-maximize` 行即可：

```yaml
- id: auto-maximize
  config:
    enabled: false        # 禁用
    timeoutMs: 30000      # 等待窗口出现的超时（毫秒，默认 20000）
    processName: 'DeepSeek Harness'   # macOS/Linux 定位窗口用的进程名
```

配置项：

| 配置 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | `false` 时整个插件不做事 |
| `timeoutMs` | number | `20000` | 启动后持续寻找窗口的最长时间（毫秒） |
| `processName` | string | 可执行文件名 | macOS/Linux 定位窗口用的进程/窗口标题名 |

## 卸载

从 profile 的 `package.json` 两处（`dependencies` + `dsh.profile.bundles`）移除
`dsh-auto-maximize`，再执行 `pnpm install`，重启应用。

## 开发

```sh
npm install   # 无第三方运行时依赖；仅 dev 需要（测试用 node:test）
npm test      # 冒烟测试：模块加载 / 禁用分支 / 效果注册
npm pack      # 生成可发布的 tarball（先跑测试）
```

## 发布到 npm

```sh
npm login                                   # 首次
npm publish --registry https://registry.npmjs.org
```

发布后即可在 [dsh-market](https://github.com/dsh-market/dsh-market) 插件市场的
「申请收录插件 ↗」入口提交收录（指向 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
的 `data/plugins/<owner>__<repo>.yml`，见 [提交指南](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)）。

## 已知限制

- 仅在桌面版（desktop profile）有意义；web profile 无窗口，插件会安静跳过。
- 只启动时执行一次，不会干预会话中手动调整的窗口状态。
- 失败只写 host 日志（关键字 `dsh-auto-maximize`），不影响应用运行。

## License

[MIT](LICENSE) © FideFei
