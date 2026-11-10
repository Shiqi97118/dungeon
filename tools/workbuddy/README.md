# 可迁移的本地 WorkBuddy 接入

Windows 原生直连适配器，由本项目维护；复用参考网关的原生消息协议，不改 WorkBuddy 安装包、不读取登录凭据。当前支持人工启动和有界等待，不是后台常驻调度器。

## 安装

先读根目录 CONTINUE.md。需要 Windows、Node.js 24、npm、Git 和已正常安装登录的 WorkBuddy。

```powershell
./tools/workbuddy/setup.ps1
```

脚本将参考仓库下载到 `.local/workbuddy-gateway` 并固定到 `fbaaa2ef6d6cb59f48b953a1f27058202a81553f`，安装依赖并构建；配置写入 `.local/workbuddy/config.json`。已有配置保留，已有网关版本不符时停止，不覆盖。原仓库源码不在本仓库重新分发。

默认 WorkBuddy 安装路径为 `C:/Program Files/WorkBuddy/WorkBuddy.exe`，不同路径请修改本机配置。配置范例见 `config.example.json`。`allowedModels` 默认仅 hy4free；增加低积分模型前，先从当前端核对真实 ID 和积分消耗。

若 npm 不在 PATH，可显式传入本机 npm-cli.js 与 Node 路径：

```powershell
./tools/workbuddy/setup.ps1 -NodeBin '<node.exe绝对路径>' -NpmCli '<npm-cli.js绝对路径>'
```

## 启动与绑定

先完成已有任务，通过 WorkBuddy 菜单正常退出，再运行：

```powershell
./tools/workbuddy/start-workbuddy.ps1
node tools/workbuddy/client.mjs models
node tools/workbuddy/client.mjs init
node tools/workbuddy/client.mjs status
```

启动脚本不强制结束现有进程。客户端核验连接仅绑定回环地址、端口属于配置中的 WorkBuddy.exe，且原生页面来自该安装。不会打印包含账户信息的发现 URL。

同一电脑同一仓库已有明确的执行会话时，可用 `attach <sessionUUID>` 代替 init；跨电脑重新 init，不复制 session.json。初始化结果不确定时保留现场检查，不重新创建会话。

## 派工与验收

任务文件示例在 `docs/workbuddy/tasks/`。只有状态为 ready 的任务可提交；执行中或已验收任务先核对检查点，不直接重跑。

```powershell
node tools/workbuddy/client.mjs submit docs/workbuddy/tasks/<待执行任务>.json
node tools/workbuddy/client.mjs wait
node tools/workbuddy/client.mjs status
```

任务必须有稳定 id、明确 prompt 和 allowedPaths。客户端在提交前持久保存轮次；同一 id 不重复提交，连接失败记为 uncertain，不能换 id 绕过核查。wait 最长约45秒，不取消任务。提交回执只代表受理；原生会话 idle 只代表当前不忙，必须检查实际文件和测试，才能验收。

每次派工和返工都会携带项目12条准则全文，并要求实际读取仓库内 Jiaojie Skill，先 RECEIVE `handoff.md`，阶段结束按 EXPORT 提供精确检查点。`readOnly: true` 任务可使用空 allowedPaths，只在对话中给接收回执；这是提示约束，不是操作系统只读隔离。

新执行会话按每任务最多4000、会话30000 tokens 做保守预留；实际 provider 输入、推理、输出消耗不可可靠读取，预留不等于实际计量或技术限额。达到预留上限停止派工；旧会话没有可信预算基线时，不继续派新任务，先保存其原目标和结果，再从明确检查点创建新执行单元。不能借换ID绕过旧任务预算。

Jiaojie 原始 Python 工具在本机 Windows 实测返回 `NOFOLLOW_UNSUPPORTED`。保留上游安全保护，按 Skill 允许的工具不可用路径读写 Markdown，并明确未通过原始 CLI 校验；具有所需 POSIX 能力的环境可重新运行原校验。不要把人工格式检查描述成脚本、路径安全或语义连续性验证通过。

allowedPaths 是传给 WorkBuddy 的任务约束，不是操作系统隔离沙箱；仍需 Codex 检查完整 diff 与测试。任务状态和检查结果由验收者同步更新任务 JSON、CONTINUE.md 和当天修改日志，再提交 GitHub。当前没有自动向 GitHub 回报的后台服务。

同机客户端通过本地锁串行运行。异常退出留下锁时，先确认没有客户端和未闭合操作，再检查锁里的 PID；不自动抢锁或重发。换电脑通过已提交的任务目标与产物接续，不迁移正在运行的进程。

```powershell
node --test tools/workbuddy/core.node-test.mjs
```

## GitHub 与本机边界

提交：接入源码、固定版本安装步骤、无凭据配置范例、任务目标与范围、真实交付和验收记录。

本机保存：登录状态、机器绝对路径、本机 sessionId、调试连接、队列临时凭证和日志，均在 `.local/` 或各应用自己的认证目录。`.local/` 已被 Git 忽略；不要强制加入。

参考来源：https://github.com/dudu555-djiao/codex-workbuddy-gateway 。Windows 本项目适配路线为 native_rpc_windows，不声称已经移植上游 macOS launchd 服务、完整队列或自动恢复。

## 编程与审核原则

submit 在提交前读取 docs/编程与审核原则.md 并把完整内容附入每次派工提示，缺失或为空则停止提交。Codex 按全部 12 条准则独立审核并记录依据；该提示属于执行约束，不是技术沙箱或自动合规证明。既有任务不自动重发，后续审核和返工使用新标准。
