# dsh-auto-maximize
DeepSeek Harness 桌面版插件：启动自动最大化主窗口（等同于手动点击最大化按钮）

适用于 DSH desktop profile，以及所有基于 Electron / 系统窗口运行 DSH 的场景。

**仓库**：Gitee（主）<https://gitee.com/FideFei/dsh-auto-maximize> ｜ GitHub（镜像）<https://github.com/FideFeiPlane/dsh-auto-maximize>

## 原理与平台支持

插件是 host-only 插件，随桌面版 host 进程在应用启动时加载。host 进程是 Node 子进程
（`ELECTRON_RUN_AS_NODE=1`，由 Electron 主进程拉起），拿不到 `BrowserWindow`，
因此按平台调用系统级「最大化」能力，全部**尽力而为、失败只记日志、绝不 crash host**：

| 平台 | 策略 | 依赖 | 备注 |
|---|---|---|---|
| Windows | Win32 `ShowWindow(hwnd, SW_MAXIMIZE)` | **pwsh 7** → **Windows PowerShell 5.1** 自动回退 | pwsh 7 缺失时自动用 5.1（Windows 自带）；无需额外安装。PowerShell 按 PATH 解析、不写死安装路径；5.1 的 `Add-Type` 内置编译器，脚本两版通用 |
| macOS | 把窗口设为主屏可视区大小（`NSScreen.visibleFrame`，即「向窗口发送最大化指令」）；该调用失败时再点击绿色 `AXZoomButton` 作为补救 | `osascript`（系统自带） | 需要「辅助功能/Accessibility」授权，未授权会给出指引日志；`processName` 可覆盖应用名 |
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
| `logFile` | boolean \| string | `~/.dsh/auto-maximize.log` | 诊断日志：`false` 关闭文件日志；字符串指定自定义路径；删除文件即清空 |

## macOS：需要「辅助功能」授权

macOS 出于安全限制，用 `osascript`（System Events）控制其他 App 的窗口必须先获得
**「辅助功能 / Accessibility」**授权。

> ⚠️ **注意事项：指令形式同样需要授权。** 插件把窗口直接设为 `set position/size`（「向窗口发送
> 最大化指令」）还是点击 `AXZoomButton`，**两种方式都走同一套 macOS Accessibility API，都需要
> 辅助功能授权**。原因：插件跑在 host（外部 Node 进程）里，要挪动另一个进程的窗口只能走该 API，
> 系统的闸门拦的是 API 本身、不是进程身份——哪怕 `osascript` 是 DSH 自己的子进程也一样（TCC 会把
> 授权追溯归属到 DSH 应用，所以勾选 DeepSeek Harness 即可覆盖它，但这并不豁免授权）。唯一能免授权的
> 路径是让 DSH 在自身进程内最大化自己的窗口（如启动参数 / host→main 的 IPC 调
> `BrowserWindow.maximize()`），那需要 DSH 本体提供通道，插件作为外部方做不到。**因此请保留授权**。

插件未获授权时会在 host 日志输出指引（关键字 `dsh-auto-maximize`），按以下步骤授权后重启即可：

1. 打开 **系统设置 → 隐私与安全性 → 辅助功能**；
2. 勾选 **DeepSeek Harness**（以及承载/启动它的终端或启动器，如有）；
3. 重启 DeepSeek Harness（授权对已运行的进程不生效）。

仍无效时，可用 `processName` 指定实际的进程名——打包后应用显示名可能与可执行文件名不同。

**诊断日志**：从 1.1.2 起，插件每一步都会追加写入 `~/.dsh/auto-maximize.log`
（Windows：`%USERPROFILE%\.dsh\auto-maximize.log`）。排查「没生效」时直接看这个文件，能立刻看到
`osascript` 返回的 `perm:`（缺授权）/ `nowindow:`（没找到窗口）/ `maximized-bounds`（成功）等结果。
不需要日志时用 `logFile: false` 关闭，或直接删除该文件清空。每次启动会把上一次日志轮转为
`auto-maximize.log.old`，只保留本次与最近一次，文件不会无限累积。

> 对比：**Windows 端不需要任何额外权限**——`ShowWindow(hwnd, SW_MAXIMIZE)` 是直接 Win32 API
> 调用（非模拟点击），对同一用户的窗口无需提权。

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
- 多实例/多窗口：Windows 上优先通过「host 的父进程 PID + 可执行路径」精确定位所属实例的
  主窗口，多个 DSH 实例互不干扰；父进程匹配失败时才按可执行路径扫描，此时多开场景可能
  命中另一个实例的窗口。macOS/Linux 取「最前端/首个匹配」窗口，多开时建议用 `processName` 区分。
- 失败只写 host 日志（关键字 `dsh-auto-maximize`），不影响应用运行。

## Roadmap（未实现，欢迎 PR）

- **设置 UI 开关**：把 `enabled` 接进「设置 → 通用设置」。当前为 host-only 插件，只能通过
  `cordis.patch.yml` 配置；做成界面开关需要 client-plugin 侧的设置面板扩展。
- **去掉 PowerShell 依赖**：Windows 端可改用 FFI（koffi 等）直调 `user32.dll`，免起子进程；
  但会引入原生二进制，破坏「零运行时依赖」，故暂未采用（现状：PS 5.1 为 Windows 自带）。
- **正式图标**：`assets/icon.svg` 为占位设计（最大化双框图形），欢迎替换为正式图标。

## License

[MIT](LICENSE) © FideFei
