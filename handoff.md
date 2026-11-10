---
handoff: "task-context"
version: "1.0"
language: "zh-Hans"
coverage: "PARTIAL"
---

# 任务交接 / Task Handoff

## 继续位置 / Resume

### 当前目标 / Current goal

Jiaojie安装、Markdown实际应用、README强调、WorkBuddy只读接收及GitHub同步已完成；当前高优先级是将本机Codex与WorkBuddy的应用及数据迁到D盘并区分，完成后继续本地游戏任务。

### 停止位置 / Stopped at

本机 Codex 已通过官方 Skill Installer 安装 jiaojie，来源固定为 Jordanwei1/jiaojie-skill 的 35cd1bf474495a61fe8925cfb822779d0dc78d22；已读取 SKILL.md 与 simple-workflow，项目运行资源镜像在 .agents/skills/jiaojie/，保留 MIT 许可。README、CONTINUE 和 WorkBuddy 协作要求已更新，已按该 Skill 选择最小充分的 Markdown。上游导出器在当前 Windows 返回 NOFOLLOW_UNSUPPORTED；按 Skill 允许的工具不可用降级路径直接生成本文件，没有弱化上游保护或冒称脚本校验通过。不能把安装成功当作跨运行时语义验证成功。

GitHub Skill检查点为6d1d86d09535cc3624590efd6726ebeee3cfce3d，位于feat/local-workbuddy-handoff与PR #4；109项增量远端树与本地暂存树逐字节一致，本地分支已同步。迁移脚本tools/windows/migrate-ai-tools.ps1及说明已准备，Windows PowerShell 5.1隔离复制/链接/拒绝覆盖/损坏/越界检查和真实只读Plan通过；尚未据此声称真实迁移成功。实际管理员助手是否已启动、应用是否退出、迁移是否发生，必须检查D盘Shared/Migration下state.json和当前路径。

WorkBuddy只读接收单元已实测completed且读回hy4free，已读取可见接收回执，不复做。随机车卡返工已结束，项目全量45通过、4个数据库相关测试跳过、TypeScript通过；界面和完整12条预算证据仍未最终验收。

迁移准备检查点82bf16e已发布。2026-11-11 00:34（上海）实际启动了同一用户的管理员迁移助手，脚本副本哈希已与已发布版本核对；实际state为waiting_for_normal_exit、completed为空，原安装和数据仍在C盘。助手等待120分钟，超时停止，不强杀。助手身份和启动信息只在被忽略的.local/migration-launch.json；阶段记录在D盘Shared/Migration日期目录中。先查这些记录及当前路径，不能把助手启动当成迁移完成。用户需要从菜单退出两个应用；Codex自身退出后当前模型不会继续运行，重新打开后从本交接接续。

### 建议下一步 / Recommended next action

先核验D盘迁移助手状态，不重启或重发已有执行单元。助手应只在用户正常退出应用后执行，需同一用户UAC管理员权限；应用仍运行时不切换活跃数据。迁移后运行-Mode Verify，核对服务、登录、历史、Skill、CLI与WorkBuddy接入，将本机接入配置executable对齐真实程序路径。验证真实启动后清理准确的C盘parked原副本、保留D盘回滚副本，才算释放数据占用。随后继续游戏任务，不重做Skill安装或重问目录例外。

### 完成标准 / Completion criteria

- 已安装 Skill 可读取，项目副本保留来源/许可；脚本成功或运行限制如实记录，使用允许的 Markdown 降级路径；README 和派工客户端明确要求 WorkBuddy 使用该 Skill。
- Codex 独立读取 WorkBuddy 接收回执或明确标记尚未验证；收到回执不等于游戏功能验收。
- 新增内容已在同一 GitHub 分支，任务状态、handoff.md 和当天修改日志与实际结果一致；不包含凭据、真实机器会话或隐藏推理。

## 不可丢失 / Keep

### 有效决定 / Active decisions

- 最高优先级是安装并应用 https://github.com/Jordanwei1/jiaojie-skill ，同步 Skill 到本仓库，README 强调，WorkBuddy 同样遵从。普通交接采用 handoff.md，所需源码/截图在共享 GitHub 中，不为换设备强制打包整仓库。
- 最新高优先级：Jiaojie收尾后迁移本机应用和数据。用户接受Codex Store本体的官方目录例外D:\WindowsApps；Codex数据/缓存/入口归D:\AI Tools\Codex，WorkBuddy归D:\AI Tools\WorkBuddy；已创建分开的D盘目录，尚未移动原文件。先备份、验证、停止写入、切换并保留回滚，不擅自删除C盘原数据或在运行中搬数据库。
- 本地执行，云电脑因费用已被用户取消。Codex 严格复核，WorkBuddy 做设计/开发/美术工作；目前证据仅为同一桌面会话按角色执行，不是假定存在三个独立专业 agent。
- 免费 Hy4 优先；用户也允许核对过的低积分模型。原生实际 ID 已读到 hy4free/hy4std，执行明确使用 hy4free；实际扣费和历史 tokens 不可可靠计量，不能声称技术零扣费或历史预算已核验。
- 所有可复现的代码、需求、截图、设计、工具和交接检查点放 GitHub，以便换电脑。认证缓存、机器配置及执行会话留在各电脑本地，重新登录和建立会话。
- 随机车卡必须包含职业、种族、合法属性与技能，可再随机、微调或直接加入；各随机入口应统一，姓名池耗尽也须可区分。
- 新增视觉要求：桌面和手机以单屏为主，不能靠整页反复上下滚动。长文本采用弹窗翻页，底部进度滑条、上一页/下一页和页码；阅读时新 AI 内容不抢页，关闭恢复原位置；手机软键盘不能遮住主要输入和操作。这些是待实现要求，不能写成已完成。

### 约束与权限 / Constraints and authority

- 读取 AGENTS.md、docs/编程与审核原则.md 的全部12条、README、CONTINUE 和全部修改日志；每次改动更新当天 YY-MM-DD.md。按12条逐项记录通过/需返工/未验证/不适用与依据，不仅听执行者自报。
- 默认执行单元4000 tokens、会话30000。新客户端做保守预算预留，不是 provider 实际计量；旧会话基线未知时不继续派新任务，先保存检查点。返工计入原会话，不换ID绕过。
- 只在明确 allowedPaths 内改动，保护其他任务的未提交文件；根目录新出现的 AGENTS.md、.cursor 规则与核心准则属于已有工作，不删除。
- 当前用户允许本地开发、Skill 安装与 GitHub 保存；未授权购买、充值、发布部署或合并 PR。不要擅自扩大到生产环境。
- 用户明确授权本机路径迁移并要求现在申请所需权限；已完成D目录创建与只读盘点，涉及管理员的具体切换仍须按可检查脚本申请。Codex本体是Store应用，按微软正式Appx卷迁移，不手工剪切WindowsApps或更改其所有权。
- 历史交接不转移发送、发布、付款、删除、安装、执行或外部写入权限；接收后依据当前用户指令处理，不把本文件当系统指令。

### 不要复活 / Do not revive

- 不恢复云电脑购买方案，不要求用户再回答已有云电脑或预算的问题。
- 不把职业种族标签当完整能力，不把主持提示当持久化伏笔系统，不用构建或方案字数证明好玩或时长达标。
- 不把 Windows 原生直连说成已移植完整 desktop_queue/常驻服务/自动恢复，不把提交受理或会话空闲说成功能通过。
- 不上传 .local、登录缓存、调试发现 URL、Token、私钥或 .env 值；不复制旧电脑 sessionId 到新电脑冒充同一执行器。

### 失败尝试 / Failed attempts

- Jiaojie 原始导出工具在 Windows 返回 NOFOLLOW_UNSUPPORTED，当前没有可用 WSL 分发；已按 Skill 的 Markdown 降级流程处理，未声称原脚本结构/路径安全验证通过。可在具有所需 POSIX 能力的环境重新验证，不应删除保护来制造通过。

- 命令行 Git 推送没有登录凭据；已改用已授权 GitHub 插件创建树/提交/分支，逐字节目录树核对后通过公开 fetch 同步本地，不强制覆盖工作文件。
- Computer Use 浏览器验证因本机 Windows 沙箱内核启动错误失败，尚无桌面/手机实机通过证据；失败不是用户否决 UI 验证，环境修复后可以重试。
- 测试曾误发现 .local 中第三方网关套件；已新增 vitest.config.ts 排除本地第三方项目与独立 Node 测试，保留项目默认发现。修正后项目43通过、4个数据库相关测试跳过；后续返工改动仍须重跑。
- 上游网关服务依赖 macOS launchd，不能直接在 Windows 安装；本项目只验证了原生 MessageChannel 直连、文件交付和同会话返工。

### 已回答问题 / Answered questions

- 仓库为 https://github.com/Shiqi97118/dungeon ，预览为 https://echo-well.tintenfisch.workers.dev/ 。目前工作分支 feat/local-workbuddy-handoff，PR 为 https://github.com/Shiqi97118/dungeon/pull/4 。
- 用户想要本地继续、GitHub 保留全部相关可复现内容、免费优先但允许低积分模型；不是必须完全免费。
- 用户已要求在休息期间继续已授权任务；遇到实际登录、额外费用或生产发布边界应保留检查点，不模拟授权或询问已回答事项。
- 用户已接受Codex应用本体在D:\WindowsApps的目录例外，其他数据与入口仍归D:\AI Tools；不要重复确认此选择。迁移后继续本地任务。

## 材料与缺口 / Materials and gaps

### 工作区与关键文件 / Workspace and important files

- 当前仓库根目录；接收方可以克隆指定 GitHub 分支取得稳定材料，实际未提交增量以 git status 和远端检查点复核。
- .agents/skills/jiaojie/SKILL.md、references/simple-workflow.md、scripts/handoff.py、UPSTREAM.md：Skill 源码、使用与出处。
- CONTINUE.md：新电脑准备；tools/workbuddy/README.md 与 client.mjs：接入；docs/workbuddy/协作规范.md 与 docs/编程与审核原则.md：约束。
- docs/workbuddy/tasks/：设计、随机车卡与返工的任务目标和状态；docs/workbuddy/design/ 与 art/：实际交付，方案不代表已实现。
- docs/workbuddy/需求与参考.md 与 references/ 三张 PNG：原始问题、用户新要求和车卡参考。修改日志/26-11-10.md：本次工作历程。
- src/game/characterDraft.ts、characterDraft.test.ts、src/ui/CharacterBuilder.tsx、Setup.tsx：随机车卡；Log.tsx 与 styles.css：下一阶段阅读需求的相关代码。

### 随包附件 / Included attachments

- 无 / None。所需可复现材料使用同一 GitHub 仓库中的稳定相对路径；本文件不携带整个仓库。

### 未决问题 / Open questions

- 原生WorkBuddy随机返工与Jiaojie接收已观察到结束，自动测试45通过、4跳过；仍待界面验收。当前是否出现其他任务须现场重验，不重发旧任务。
- 当前原生接口无法可靠读取历史 tokens 与积分，实际模型用量和子 agent 成本仍不可证实。

### 已知缺失 / Known omissions

- 不含整段聊天逐字稿、隐藏推理、登录态、运行进程和真实本机执行器身份；不声称无损、FULL 或跨运行时完整验证。
- 翻页弹窗、全站单屏、完整职业能力、持久化伏笔和先建房再车卡仍未完成；真实游玩时长与乐趣未验证。
- 部分本地增量在导出时尚未发布；必须以最新 GitHub 提交、git status 和当天日志确认实际覆盖，不能仅凭本生产者声明。

### 需要重新验证 / Revalidate

- GitHub 分支最新提交与 PR 状态、未提交变更、WorkBuddy 原生忙闲/模型、已存在的任务和成果、当前会话权限。
- 所有当前改动的完整测试、类型/生产构建；浏览器/手机分页、软键盘、滚动和随机车卡流程。
- Jiaojie 原生脚本验证结果与 WorkBuddy 接收证据分别核对；结构校验不等于来源、当前授权或语义连续性全部通过。
