> **项目最高标准：所有编程规则、设计、实现、测试和审核统一遵从 [项目核心准则：12 条最高标准](docs/编程与审核原则.md)。该独立文档整合 [Karpathy 的 4 条原则](https://github.com/multica-ai/andrej-karpathy-skills) 与 [Mnilax 补充的 8 条规则](https://x.com/Mnilax/status/2053116311132155938)，同时约束 Codex 与 WorkBuddy 的派工、执行、审核和返工；其他项目规则不得与其冲突。**

> **修改前必读：每个新的日期开始修改时，请先阅读 `修改日志/` 中的全部过往修改日志，再开展修改。每次更新都必须写入当天的 `YY-MM-DD.md`，记录实际改动、验证结果和未完成事项。**

> **换电脑或新开聊天：先读 [CONTINUE.md](CONTINUE.md)。** 代码、设计方案、WorkBuddy 接入源码、安装方法、任务目标与验收检查点均保存在本仓库；各电脑重新登录并建立本机会话。每次结束工作前同步任务状态和修改日志，再提交推送。接入步骤见 [本地 WorkBuddy 工具](tools/workbuddy/README.md)。

> **最高优先级交接规范：必须使用 [Jiaojie Skill](.agents/skills/jiaojie/SKILL.md)。** Codex 和 WorkBuddy 开始接续任务时先按该 Skill 接收 [handoff.md](handoff.md)，确认当前目标、精确停止点、约束、废案和缺失；阶段结束、切换设备或交接前按其 EXPORT 流程更新并校验同一份交接文件。普通交接使用最小充分的 Markdown，不把整段聊天、登录凭据或隐藏推理上传。WorkBuddy 派工及返工同样必须遵从 Jiaojie 与项目 12 条核心准则。

# 伊瑟兰 · 灰港 · 网页跑团

[打开灰港试玩](https://echo-well.tintenfisch.workers.dev/)

基于 `docs/story/` 剧情框架制作的网页文字跑团，当前可玩内容是第一幕的灰港。单人模式浏览器打开即可游玩；联机模式需要一个小服务端：可以部署成**公开链接**（Cloudflare Workers + D1，免登录），也可以发布到 Cursor（需登录）。

## 玩法概览

- **开局**：单人先选角色，联机先建房再各选一名（至多四人）。可用预制角色、自定义车卡或随机生成。选一条开场引子后，从暴雨夜的七灯酒馆开始。
- **车卡**：12 种职业、8 种种族，四项属性各分配一次 +2、+1、0、−1，再选两项专长。对应检定加 1，同属性专长不叠加。职业和种族描述角色出身。开局后可从「角色卡」查看自定义角色资料。
- **阅读与行动**：剧情按屏展开，读完一批再行动。可以点人物、物件和地点，也可以写下任何行动；需要检定时显示难度与风险，由 2d6 加属性决定成功、部分成功或失败。
- **世界会倾斜**：每次有效选择都记入事件账本，推动势力动向、人物态度和二十个发展方向的倾向分。选择数达到门槛后可以「收束故事」，结局由程序按账本挑选，AI 只负责写出来。
- **回退**：可以退回到之前的某一屏重新选择；联机时要全桌同意。
- **档案与成就**：结局页列出这一局的走向、角色的去向和解锁的成就；只有内置主持人带服务器回执的一局才计入成就。

## 联机

- 标题页「与朋友联机」：建房得到 6 位房间码 / 邀请链接，朋友加入后每人认领一名角色（至多 4 名），房主选开场钩子后开局。没有座位的人可以旁观和聊天。
- 每个座位由认领它的玩家操作；他离线超过 45 秒或离开房间后，在座的任何玩家都可以代为操作。离开房间的座位此后轮空。
- 规则、检定与回退和单人完全一致：浏览器和服务器调用同一套操作（`src/iselan/play/ops.ts`），骰子由服务器掷出。桌边聊天不会写进故事。

## AI 主持人

- **内置主持人**：服务器读取环境变量 `OPENAI_API_KEY`（可选 `GM_BASE_URL`、`GM_MODEL`、`GM_ENDING_MODEL`）。能认出前缀的密钥会自动走对应服务：`xai-` 用 xAI，`sk-or-` 用 OpenRouter，`sk-proj-` 用 OpenAI；其他密钥（如 DeepSeek）走 `GM_BASE_URL` / `GM_MODEL`，正式环境用 DeepSeek，密钥不会下发到浏览器。所有调用共用 `src/iselan/config.ts` 里的每日费用上限与次数上限。联机房间始终使用它；未配置或用完时回退为离线规则主持。
- **自带密钥（仅单人）**：在「AI 主持人」设置里填写任意兼容 OpenAI Chat Completions 的接口，密钥只保存在本机浏览器，由浏览器直接请求服务商。这样的一局没有服务器回执，不计入成就。

## 开发

WorkBuddy 协作的职责、模型费用偏好和验收门槛见 [协作规范](docs/workbuddy/协作规范.md)；当前接入能力与限制见 [接入状态](docs/workbuddy/接入状态.md)。

```bash
npm install
npm run dev      # 本地开发
npm test         # 引擎、回合制与房间 API 测试（设置 TEST_DATABASE_URL 可同时跑 Postgres）
npm run build
```

本地 `npm run dev` 会把 `/api/*` 挂到同一个开发服务器上；没有 `DATABASE_URL` 时房间存在内存里。`npx wrangler dev` 则以 Cloudflare 的方式在本地运行（本地 D1）。

## 部署成公开链接（Cloudflare）

`wrangler.jsonc` 已配置好：Worker 负责 `/api/*`，其余是 `dist/` 里的静态页面，房间存在 D1 数据库 `echo-well` 中（首次请求自动建表）。公开模式不需要登录：每个浏览器有一个随机 ID，用来认出回来的玩家。

1. 打开 Cloudflare 控制台 → **Workers 和 Pages** → **创建** → **导入存储库**，连接 GitHub 并选择这个仓库。
2. 项目名填 `echo-well`；构建命令 `npm run build`，部署命令 `npx wrangler deploy`。之后每次推送都会自动重新部署。
3. 部署完成后，在该 Worker 的 **设置 → 变量和机密** 里添加机密 `OPENAI_API_KEY`。可选：`GM_BASE_URL`（任何兼容 OpenAI 的接口）、`GM_MODEL`。
4. 链接形如 `https://echo-well.<你的子域>.workers.dev`，发给朋友即可。

公开链接谁都能打开，所以服务器对 AI 调用设了上限：每日费用上限和全站、每人、每个 IP、每个房间的次数上限都在 `src/iselan/config.ts`（联机房间另受 `wrangler.jsonc` 里的 `GM_DAILY_LIMIT` 约束）。超过后自动改用离线规则主持。

## 发布到 Cursor（需登录）

`cursor-app.json` 声明了 Postgres，表结构见 `migrations/`。这种方式只能设为私有或团队可见，朋友需要登录 Cursor。设置 `ECHO_PUBLIC=1` 可以在任何 Node 托管（如 Vercel，需 `DATABASE_URL`）上改用免登录模式。

目录结构：

- `src/iselan/`：伊瑟兰引擎：编号词表（`data/`）、事件账本（`events/`）、规则（`rules/`）、文本挑选（`texts/`）、AI 协议（`ai/`）、互动（`interaction/`）、档案与成就（`profile/`、`achievements/`）、牌桌与共用操作（`play/`）
- `server/`：房间、轮询、座位与 AI 主持人代理；`platform.ts` 抽象出身份与存储，`node.ts`（Cursor / Node + Postgres）和 `worker/index.ts`（Cloudflare + D1）分别接入
- `src/net/`：联机客户端与轮询
- `src/ui/`：界面组件（标题、设置、联机大厅、聊天；`journey/` 是开局、牌桌、房间与结局页，`reading/`、`interaction/` 是阅读器与互动层）
- `src/audio/`：Web Audio 合成的雨声、矿洞环境音、钟声、骰子音效
- `public/art/story/`：按 `docs/story/10-插图计划.md` 生成的插图
