# 换电脑继续：先读本页

## 当前试玩版本（2026-11-12）

灰港首版已通过 PR #52 合入 `main`，并由 Cloudflare 发布。[公开试玩](https://echo-well.tintenfisch.workers.dev/)

在新电脑从 `main` 开始游戏开发。先读项目准则、全部修改日志，再按 Jiaojie 接收 [最新游戏交接](交接/cursor.md)。下文记录此前 WorkBuddy 协作与本机环境的历史。

最后检查日期：2026-11-11。GitHub 是项目代码、可复现工具和任务交接的共同来源；本地聊天不是唯一进度记录。

最高优先级：先读 `.agents/skills/jiaojie/SKILL.md`，按 RECEIVE 流程接收根目录 `handoff.md`。本页保留环境准备与历史检查点；最新意图、停止点和建议下一步以 `handoff.md` 为交接入口，不凭旧聊天或旧摘要擅自恢复被否决的方案。

## 当前决定

- 云电脑方案已取消，继续本地执行，不购买云资源。
- Codex 调度和验收，WorkBuddy 实际执行。免费 hy4 优先，允许核对过的低积分模型；不自动充值或切换高消耗模型。
- 目前使用 Windows 原生直连，不是完整 desktop_queue 持久服务；退出应用、电脑关机后不能继续执行。
- WorkBuddy 没有验证过的项目专用设计/开发/美术 agent。本轮按同一 hy4free 会话分角色执行，未冒称三个独立专业 agent。

## 必读顺序

1. AGENTS.md、docs/编程与审核原则.md、README.md 和 `修改日志/` 的全部历史日志。
2. 本页以及 `docs/workbuddy/需求与参考.md`、`协作规范.md`、`接入状态.md`。
3. 对应任务 JSON、实际成果和验收记录；已开始或已验收任务不要重新运行。

## 进度检查点

- 已实现基础阅读改进：保留日志位置、未读入口、字号、专注阅读和朗读；浏览器/手机体验仍需实测。
- 已实现基础车卡选择：12 职业、8 种族、标准属性数组、两项专长。职业与种族目前主要是背景标签，完整规则能力尚未落地。
- 入团理由和关系默认生成；主持上下文包含背景。持久化的伏笔验证与回收仍未实现。
- WorkBuddy 已交付 `docs/workbuddy/design/` 三份方案/证据和 `docs/workbuddy/art/视觉与阅读方案.md`。均是方案，不是已实现的功能，完整设计仍待审查。
- 用户新增要求：完整随机车卡，允许微调或直接加入。任务 ID 为 `dungeon-random-character-2026-11-10-v1`，范围与验收要求见 `docs/workbuddy/tasks/random-character.json`。最终状态以该任务文件和当天日志为准。
- 仍需实现：先建房再车卡的联机流程、职业种族实际能力、道具教学、持久化剧情节奏和伏笔、实机体验验证。

## 在新电脑准备

1. 本批交接位于 `feat/local-workbuddy-handoff` 分支（合并前不要仅克隆旧 main）：`git clone --branch feat/local-workbuddy-handoff https://github.com/Shiqi97118/dungeon.git`。先核对 GitHub 最新提交和任务状态，再编辑代码。不要在两台电脑同时改同一分支。
2. 安装 Git、Node.js 24 LTS（带 npm）、Windows 版 WorkBuddy 与 Codex；分别正常登录。认证信息不放进仓库。
3. 在仓库根目录运行 `npm ci`、`npm test -- --testTimeout=30000`、`npm run build`，建立本机基线。
4. 按 `tools/workbuddy/README.md` 安装固定版本参考网关，生成本机配置，验证连接并创建本机专用会话。
5. 给新的 Codex 聊天这句指令：

> 请先阅读 CONTINUE.md、README.md 和全部修改日志；核对 GitHub 最新版本、任务 JSON 及实际交付文件，报告已完成、待验收和未完成项，再使用本仓库 WorkBuddy 接入工具继续下一项任务。不要重复派发已开始或已验收的任务，不假称已验证的能力，不覆盖已有改动。

## 每次换电脑前

- 等 WorkBuddy 当前任务结束，读取成果并更新任务状态、验收结果、修改日志；提交并推送代码和文档。
- 若任务未结束，明确记录为执行中，先在旧电脑确认完成或停止，再决定是否在新电脑恢复；GitHub 检查点不是跨电脑分布式锁。
- 新电脑重新建立原生会话。不要复制另一台电脑的本机 sessionId、登录缓存或 `.local/` 任务库冒充同一执行器。
- GitHub 保存目标、约束、产物和已核验进度，不能迁移正在运行的进程或保证聊天上下文逐字恢复。

## 2026-11-12 ART-01 灰港首批

Codex 按用户最新授权在独立工作树 Dungeon-grayport-art、分支 art/grayport-p0 交付九张场景与事件 JPG，插图计划标 🟡。来源与提示词见 docs/workbuddy/art/ART-01-灰港首批插图.md，精确停止点见交接/codex.md。九张待人工审阅，肖像及后续图仍待制作。367 测试通过、1 项 SVG 换行比较失败、4 项数据库跳过；build、lint、严格文本和 18 组阅读器加载/不遮字检查通过。原工作树未提交改动保留。
