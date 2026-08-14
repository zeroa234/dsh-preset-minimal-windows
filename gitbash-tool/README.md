# @dsh-external/dsh-tool-gitbash

一个给 DeepSeek Harness（dsh）用的 **Git Bash 执行工具插件**（Windows）。

## 为什么需要它

harness 自带的 bash 工具（`@deepseek-ai/dsh-tool-bash`）在 Windows 上被 standard agent preset
默认禁用（`disabled: process.platform === 'win32'`），官方选择用 pwsh 工具顶上。本插件仿照
`@deepseek-ai/dsh-tool-pwsh` 的结构，直接通过 `ctx.subprocess` 拉起 Git Bash（`bash.exe -c`），
与 pwsh 工具平级共存。

## 特性

- 工具名：`gitbash`，参数 `command` / `description` / `workdir` / `timeoutMs`
- 每次调用都是全新 bash 进程，无状态
- 输出截断 + spill 文件（超长输出落盘并提示路径）
- 超时自动终止（默认 120s，上限 600s）
- 零外部依赖：只 import node 内置模块，避免链接包在运行时解析 harness 包的问题

## 安装

```powershell
dsh plugin --profile web add E:\agent\dsh-deep-whale\gitbash-tool
```

安装后重启 harness，新会话的工具列表里就会出现 `gitbash`。

## 配置

可选配置 `bashPath`（通过 profile 的 cordis.patch.yml 覆盖该行 config）：

```yaml
- id: tool-gitbash
  name: '@dsh-external/dsh-tool-gitbash'
  config:
    bashPath: 'C:\Program Files\Git\bin\bash.exe'
```

默认探测顺序：`%ProgramFiles%\Git\bin\bash.exe` → `usr\bin\bash.exe` → x86 路径 → PATH 里的 `bash`。

## 注意

- 工具绕过 harness 的文件沙箱（没有 sandbox 集成），命令以 harness 进程的权限直接执行。
- 与官方 `dsh-tool-bash` 不同：本工具固定走 Git Bash，不使用 `ctx.shell` 能力缝。
