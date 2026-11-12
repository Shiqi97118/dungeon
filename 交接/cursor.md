---
handoff: "task-context"
version: "1.0"
language: "zh-Hans"
coverage: "PARTIAL"
---

# 任务交接 / Task Handoff

## 继续位置 / Resume

### 当前目标 / Current goal

2026-11-12 14:54 起 Cursor 停止，剩余工作（代码与内容）连同待决定事项一并交给 GPT。按 docs/story/13-代码代理任务书.md 的任务卡，在 feat/iselan-v1 上实现伊瑟兰第一章的“灰港首版”，规格以 docs/story/12-开工规格.md 为准。

### 停止位置 / Stopped at

2026-11-12 14:54（北京时间），Cursor 交出。QTE-01 两阶段都已合并进 feat/iselan-v1。UI-02 第一片（src/iselan/play 桌面控制器）已合并（PR #26）；随后按用户意见放慢节奏：时辰 6 轮一段，主线段落至少隔 4 轮（PR #27，已合并）。随后加存档与回退（PR #28）、联机回退表决（PR #29），均已合并。第二片单人界面已合并（PR #31）。第三片结局页与 AI 结局裁决已合并（PR #39）。第四片联机接新引擎已合并（PR #41）。第五片删旧章与标题文案已合并（PR #42）。第六片 A1–A12 验收已合并（PR #43）。第七片联机收束全员同意、读完再换批已合并（PR #45）。联机 CPU 优化已合并（PR #46）。CNT-02/04 七个地区已合并（PR #47）。ART-01 首批九张插图已合并（PR #48）。feat/iselan-v1 当前全部检查通过：npm test 352、tsc 两套、build、lint（2 个旧警告）、check-texts --all 十个文件严格零问题。

### 建议下一步 / Recommended next action

交给 GPT，按顺序：

1. 决定并处理 PR #44（首页暖黑旧金风格、选人只留姓名身份、去掉开场引子选择与属性展示）。需要 GPT 决定：开场引子（12 规格里有 4 种，房间服务端仍支持 `hook` 操作）是否真的去掉；属性是否在别处（如角色卡浮层）保留。若合并：#44 基于旧点，要接上今天的 `src/ui/journey/Room.tsx`（`JoinPanel`、`MAX_SEATS = 4`、`voting`、`send` 带 `at`）与 `Journey.tsx`；跑全部检查和三个浏览器脚本后再合。
2. 决定联机 CPU 的处理：长局每次操作约 15 毫秒（Node 实测，同实例连续约 9 毫秒），Workers 免费档 10 毫秒。二选一：(a) 用户升级付费档（需用户本人同意，不能代为购买）；(b) 改分段存储——房间表另存事件与屏幕的追加段，每次操作只读写最后一段与小的“头”（turn、pending、checkpoints），涉及 `server/rooms.ts`、`server/store` 的 D1 表结构、`src/iselan/play/persist.ts`，以及客户端增量拉取。开放联机前必须有结论。
3. 补灰港内容缺口（CNT）：让人物死亡的文本（A5 现在只能注入事件验证）；记忆账本（memory_ledger_seen，第二层真相）的第二个来源；卢多不在时码头的“进入”文本；酒馆“盈利”（business_profitable）的判定规格——规格写好后代码要在 `src/iselan/rules/projects.ts` 发出该事件。
4. 次要：萨卡的别名“萨卡·赤牙（在王国）”是为对话标题凑的，宜改为解析器忽略标题括号（`docs/story/tools/check-texts.mjs`）；新事实补 `about`。
5. EXP-01、CNT-03（看板里暂缓）；自定义角色留给后续卡。

接手须知：
- 先读 `AGENTS.md`、`docs/编程与审核原则.md`、`docs/workbuddy/协作规范.md`、本文件与 `修改日志/26-11-12.md` 末尾几节。
- 改动后必跑：`npm run texts`、`npm test`、`npx tsc -b`、`npx tsc -p tsconfig.worker.json`、`npm run build`、`npm run lint`、`node docs/story/tools/check-texts.mjs --all`。
- 浏览器验收脚本在 Cursor 机器的 /tmp，未入库；可按日志里各节“浏览器”一条描述的检查项重写（单人 21 项、结局 16 项、房间 16 项）。
- AI 固定前缀正好 1500 token 上限（`ai.test.ts` 有测试），加任何前缀文字都要同时删减。
- 合并流程：PR 指向 feat/iselan-v1，“Workers Builds: echo-well” 通过后再合；不合并到 main、不部署。

### 完成标准 / Completion criteria

- 每张卡满足 13 第 4 节的验收与第 5 节的检查。

## 不可丢失 / Keep

### 有效决定 / Active decisions

- 2026-11-12 14:54 起用户把剩余代码与内容、以及待决定事项交给 GPT（此前 Cursor 是唯一写游戏代码的代理，并代 Codex 审核合并进 feat/iselan-v1，不含 main）。
- 每天 AI 费用 ≤ 30 元（硬上限 28 元）；不新增服务端密钥，成就校验用 D1 回执（12 第 8.4 节）。
- 新剧情直接替换旧第一章；PR #4 不单独发布。

### 约束与权限 / Constraints and authority

- 不合并到 feat/local-workbuddy-handoff 或 main、不部署、不充值、不改密钥；只改任务卡范围内的路径（13 第 3.5 节）。
- 历史交接不转移任何外部写入权限。

### 不要复活 / Do not revive

- 不再计划 GM_SIGNING_KEY。
- 不在代码里另写文本解析器或另起编号。

### 失败尝试 / Failed attempts

- 无 / None.

### 已回答问题 / Answered questions

- Codex 合并权限：用户授权“怎么合理怎么推进”（2026-11-11）。
- 正式环境只用 DeepSeek 的 API（2026-11-12），价格表不补其他模型。
- 回退（2026-11-12）：用户希望后悔时不重开；任一决定前可回退；联机局需在座真人全员同意（用户要求）；回退前已解锁的成就保留（用户 10:53 确认）。
- 节奏（2026-11-12）：用户嫌 3 轮一段时辰、主线隔 2 轮太快；现为 6 轮一段、至少隔 4 轮。主线间隔不能超过 4 轮，否则 A3 来不及在时钟到 4 前做完。

## 材料与缺口 / Materials and gaps

### 工作区与关键文件 / Workspace and important files

- docs/story/12-开工规格.md、13-代码代理任务书.md、docs/协作看板.md、docs/story/data/、docs/story/tools/check-texts.mjs。

### 随包附件 / Included attachments

- 无 / None.

### 未决问题 / Open questions

以下都交给 GPT 决定（用户 2026-11-12 14:54 授权）；永久性后果仍需玩家同意，花钱的事仍需用户本人同意：

- PR #44 是否合并、开场引子与属性展示是否保留。
- 联机 CPU：升级档位（用户同意）还是改分段存储。
- 看板待决问题 7：伪造上传首版接受风险；回执绑定档案、导出摘要防篡改、AI 白名单覆盖、结局接口操作未做。
- 晚宴的取舍待审：姿态只改演出，不改状态；“展示证据”没做；跳过按交涉 12；12 句反应文案。
- UI-02 第一片的取舍待审：人物常驻地点、难度换算（12 对 10+）；结局已改为 AI 裁决。
- 第 2 档“与该方向相关的势力”：DIRECTION_RULES 还没列每个方向的势力，暂按任一势力判断，留给 CNT-03。

### 已知缺失 / Known omissions

- 服务端每次操作仍要解压、解析、打包整份牌桌：长局约 15 毫秒 CPU（同实例连续操作约 9 毫秒），Workers 免费档 10 毫秒仍可能超。
- 离线主持只对在场人物的社交与战斗要求检定，其余行动不检定。离线局没有回执，成就不解锁。
- A1–A12 都是自动测试，没有人工在手机上走；A5 的人物死亡靠注入事件（灰港没有让人物死亡的文本）。
- 酒馆盈利（business_profitable）从不发出：规格没写怎么判定。
- QTE v2 原始补丁和日志始终没拿到，QTE-01 按结论独立实现。

### 需要重新验证 / Revalidate

- feat/iselan-v1 合并后的 Cloudflare 检查是否转绿。
- 已合并的远端分支是否已删除（保留 main、feat/iselan-v1、feat/local-workbuddy-handoff）。
