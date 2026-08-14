# dsh-preset-minimal-windows

**极简模式（Windows）** — DeepSeek Harness 的 Windows 版极简 Agent 预设 + Git Bash 工具。

官方 `minimal` 预设的 shell 是持久 bash PTY（`dsh-terminal-bash` 硬编码 `/bin/bash`），Windows 上不可用。
本仓库提供其 Windows 替代：**Git Bash + PowerShell + str_replace_editor** 三工具，无持久 shell，每次调用起新进程。

## 特性

| 工具 | 说明 |
|---|---|
| `gitbash` | 通过 `ctx.subprocess` 直接拉起 Git for Windows 的 `bash.exe -c`，自动探测安装路径（`%ProgramFiles%\Git\bin\bash.exe` → `usr\bin` → x86 → PATH）；输出截断 + spill 落盘；超时终止（默认 120s / 上限 600s）；零外部依赖 |
| `pwsh` | 官方 `@deepseek-ai/dsh-tool-pwsh`，走宿主 `ctx.shell`（win32 下由 `dsh-pwsh-sandbox` 支撑），受文件沙箱约束 |
| `str_replace_editor` | 官方字符串替换文件编辑器（与 fs-local 共享隔离 realm） |

- 固定 persona（`complete: true`），不注入运行时上下文，无上下文压缩——与官方 `minimal` 相同的极简哲学
- 非 Windows 部署上自动跳过 `pwsh` 行（`disabled: process.platform !== 'win32'`）

## 安装

### 方式一：复制预设目录（推荐，单步）

把 `preset/minimal-windows` 整个目录复制到 `$DSH_HOME/.agent-presets/` 下（`$DSH_HOME` 默认是 `~/.dsh`，本机配置过则是 `E:\agent\dsh`）：

```powershell
# 把仓库里的 preset/minimal-windows 复制为：
# $DSH_HOME\.agent-presets\minimal-windows\
Copy-Item -Recurse preset\minimal-windows "$env:USERPROFILE\.dsh\.agent-presets\minimal-windows"
```

预设内的 `tool-gitbash` 行以**相对路径**引用 `./lib/gitbash.js`，插件文件随目录一起走，无需任何 profile 安装。重启 harness（或新会话）后，在预设列表选择「极简模式（Windows）」。

### 方式二：bundle 全局安装（可选）

仓库根目录的 `gitbash-tool/` 是标准 bundle 包（`@dsh-external/dsh-tool-gitbash`），想在所有预设的会话里都用上 `gitbash` 可以全局装：

```powershell
git clone https://github.com/zeroa234/dsh-preset-minimal-windows
cd dsh-preset-minimal-windows
dsh plugin --profile web add ./gitbash-tool
```

此时预设里的相对路径行与宿主 bundle 注册的 `gitbash` 工具同名共存（预设层遮蔽宿主层），行为一致，无需二选一。

## 与官方 minimal 的差异

| | 官方 `minimal` | 本预设 |
|---|---|---|
| Shell | 持久 bash PTY（`dsh-terminal` + `dsh-terminal-bash` + `dsh-tool-bash-persistent`） | `gitbash` + `pwsh`，每次调用全新进程 |
| 文件编辑 | `str_replace_editor` | 不变 |
| 平台 | Linux（`/bin/bash` 硬编码） | Windows（win32） |
| Persona | "You are a helpful software engineer assistant." | 同上 + 提示使用 gitbash / pwsh |

## 配置

`bashPath` 可选：不想用自动探测时，在预设的 `agent.cordis.yml` 或 profile patch 里覆盖：

```yaml
- id: tool-gitbash
  name: ./lib/gitbash.js   # 或 @dsh-external/dsh-tool-gitbash
  config:
    bashPath: 'C:\Program Files\Git\bin\bash.exe'
```

## 注意

- `gitbash` 直接经 `ctx.subprocess` 执行，**不经过文件沙箱**（无 sandbox 集成），命令以 harness 进程权限运行；`pwsh` 则受沙箱约束（读模式 ConstrainedLanguage、管道 EPERM 等）。
- 两个 shell 均为无状态：`cd`、环境变量等不跨调用保留。

## 仓库结构

```
dsh-preset-minimal-windows/
├── preset/
│   └── minimal-windows/     # 预设目录：复制到 $DSH_HOME/.agent-presets/ 即用
│       ├── agent.cordis.yml
│       ├── preset.yml
│       └── lib/gitbash.js   # 自包含插件（仅依赖 node 内置模块）
├── gitbash-tool/            # 同一工具的 bundle 形态（宿主级安装用）
│   ├── package.json
│   ├── cordis.patch.yml
│   ├── lib/index.js
│   └── README.md
└── LICENSE
```

## 许可证

MIT
