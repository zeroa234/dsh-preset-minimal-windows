# dsh-preset-minimal-windows

**极简模式（Windows）** — DeepSeek Harness 的 Windows 版极简 Agent 预设 + Git Bash 工具。
**Minimal Windows agent preset + Git Bash tool for DeepSeek Harness.**

官方 `minimal` 预设的 shell 是持久 bash PTY（`dsh-terminal-bash` 硬编码 `/bin/bash`），Windows 上不可用。
本仓库提供其 Windows 替代：**Git Bash + PowerShell + str_replace_editor** 三工具，无持久 shell，每次调用起新进程。

The official `minimal` preset ships a persistent bash PTY stack (`dsh-terminal-bash` hardcodes `/bin/bash`) that does not work on Windows.
This repo provides the Windows replacement: **Git Bash + PowerShell + str_replace_editor** — no persistent shell, a fresh process per call.

---

## 中文说明 · Chinese

### 特性 · Features

| 工具 Tool | 说明 Description |
|---|---|
| `gitbash` | 通过 `ctx.subprocess` 直接拉起 Git for Windows 的 `bash.exe -c`，自动探测安装路径（`%ProgramFiles%\Git\bin\bash.exe` → `usr\bin` → x86 → PATH）；输出截断 + spill 落盘；超时终止（默认 120s / 上限 600s）；零外部依赖。Spawns Git for Windows' `bash.exe -c` via `ctx.subprocess`, auto-probing install paths; output truncation + spill files; timeout kill (default 120s / cap 600s); zero external dependencies. |
| `pwsh` | 官方 `@deepseek-ai/dsh-tool-pwsh`，走宿主 `ctx.shell`（win32 下由 `dsh-pwsh-sandbox` 支撑），受文件沙箱约束。Official `@deepseek-ai/dsh-tool-pwsh` over the host `ctx.shell` (backed by `dsh-pwsh-sandbox` on win32), sandbox-constrained. |
| `str_replace_editor` | 官方字符串替换文件编辑器（与 fs-local 共享隔离 realm）。Official string-replace file editor (shares the isolated `fs` realm with fs-local). |

- 固定 persona（`complete: true`），不注入运行时上下文，无上下文压缩——与官方 `minimal` 相同的极简哲学。Fixed persona (`complete: true`), no runtime context, no compaction — the same minimal philosophy as the official `minimal`.
- 非 Windows 部署上自动跳过 `pwsh` 行（`disabled: process.platform !== 'win32'`）。The `pwsh` row is skipped automatically on non-Windows platforms.

### 安装 · Installation

#### 方式一：复制预设目录（推荐，单步）· Method 1: copy the preset directory (recommended, one step)

把 `preset/minimal-windows` 整个目录复制到 `$DSH_HOME/.agent-presets/` 下（`$DSH_HOME` 默认是 `~/.dsh`，配置过则是 `E:\agent\dsh`）：

Copy the whole `preset/minimal-windows` directory into `$DSH_HOME/.agent-presets/` (`$DSH_HOME` defaults to `~/.dsh`):

```powershell
# 把仓库里的 preset/minimal-windows 复制为：
# $DSH_HOME\.agent-presets\minimal-windows\
Copy-Item -Recurse preset\minimal-windows "$env:USERPROFILE\.dsh\.agent-presets\minimal-windows"
```

预设内的 `tool-gitbash` 行以**相对路径**引用 `./lib/gitbash.js`，插件文件随目录一起走，无需任何 profile 安装。重启 harness（或新会话）后，在预设列表选择「极简模式（Windows）」。

The preset's `tool-gitbash` row references `./lib/gitbash.js` by a **relative path**, so the plugin travels with the directory and no profile install is needed. Restart the harness (or start a new session) and pick **极简模式（Windows）** in the preset list.

#### 方式二：bundle 全局安装（可选）· Method 2: install the bundle host-wide (optional)

仓库根目录的 `gitbash-tool/` 是标准 bundle 包（`@dsh-external/dsh-tool-gitbash`），想在所有预设的会话里都用上 `gitbash` 可以全局装：

`gitbash-tool/` is a standard bundle package (`@dsh-external/dsh-tool-gitbash`); install it host-wide to get `gitbash` in every preset's sessions:

```powershell
git clone https://github.com/zeroa234/dsh-preset-minimal-windows
cd dsh-preset-minimal-windows
dsh plugin --profile web add ./gitbash-tool
```

此时预设里的相对路径行与宿主 bundle 注册的 `gitbash` 工具同名共存（预设层遮蔽宿主层），行为一致，无需二选一。

The preset's relative-path row and the host bundle's `gitbash` coexist under the same name (the preset layer shadows the host layer); behavior is identical, no need to choose.

### 与官方 minimal 的差异 · Differences from the official `minimal`

| | 官方 `minimal` | 本预设 This preset |
|---|---|---|
| Shell | 持久 bash PTY（`dsh-terminal` + `dsh-terminal-bash` + `dsh-tool-bash-persistent`）Persistent bash PTY | `gitbash` + `pwsh`，每次调用全新进程 Fresh process per call |
| 文件编辑 File editing | `str_replace_editor` | 不变 Same |
| 平台 Platform | Linux（`/bin/bash` 硬编码） | Windows（win32） |
| Persona | "You are a helpful software engineer assistant." | 同上 + 提示使用 gitbash / pwsh Same + hints to use gitbash / pwsh |

### 配置 · Configuration

`bashPath` 可选：不想用自动探测时，在预设的 `agent.cordis.yml` 或 profile patch 里覆盖：

`bashPath` is optional — override it in the preset's `agent.cordis.yml` or a profile patch to skip auto-detection:

```yaml
- id: tool-gitbash
  name: ./lib/gitbash.js   # 或 @dsh-external/dsh-tool-gitbash / or @dsh-external/dsh-tool-gitbash
  config:
    bashPath: 'C:\Program Files\Git\bin\bash.exe'
```

### 注意 · Notes

- `gitbash` 直接经 `ctx.subprocess` 执行，**不经过文件沙箱**（无 sandbox 集成），命令以 harness 进程权限运行；`pwsh` 则受沙箱约束（读模式 ConstrainedLanguage、管道 EPERM 等）。`gitbash` runs directly through `ctx.subprocess` **without the file sandbox** (no sandbox integration), with harness-process privileges; `pwsh` is sandbox-constrained (ConstrainedLanguage in read-only mode, pipe EPERM, etc.).
- 两个 shell 均为无状态：`cd`、环境变量等不跨调用保留。Both shells are stateless: `cd` and environment variables do not persist across calls.

### 仓库结构 · Repository layout

```
dsh-preset-minimal-windows/
├── preset/
│   └── minimal-windows/     # 预设目录：复制到 $DSH_HOME/.agent-presets/ 即用 · Copy into $DSH_HOME/.agent-presets/ to use
│       ├── agent.cordis.yml
│       ├── preset.yml
│       └── lib/gitbash.js   # 自包含插件（仅依赖 node 内置模块）· Self-contained plugin (node builtins only)
├── gitbash-tool/            # 同一工具的 bundle 形态（宿主级安装用）· Bundle form for host-wide install
│   ├── package.json
│   ├── cordis.patch.yml
│   ├── lib/index.js
│   └── README.md
└── LICENSE
```

### 许可证 · License

MIT
