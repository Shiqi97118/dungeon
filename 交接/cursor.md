---
handoff: "task-context"
version: "1.0"
language: "zh-Hans"
coverage: "PARTIAL"
---

# 任务交接 / Task Handoff

## 继续位置 / Resume

### 当前目标 / Current goal

按 docs/story/13-代码代理任务书.md 的任务卡，在 feat/iselan-v1 上实现伊瑟兰第一章的“灰港首版”，规格以 docs/story/12-开工规格.md 为准。

### 停止位置 / Stopped at

2026-11-11 17:00（北京时间），Cursor 已完成九张卡，都等 Codex 审核：
- ENG-01：PR #7（cursor/eng-01-data-config-034a → feat/iselan-v1），生成类型与配置。
- CNT-01：PR #8（基于 #7 分支），灰港两种玩家事业的 22 条文本。
- ENG-02：PR #10（基于 #7 分支），事件账本、快照归约、存档版本 5。
- ENG-03：PR #11（GitHub 叠在 #10 上），src/iselan/rules/ 全部规则与 40 条测试；事件 73 种。
- ENG-04：PR #13（GitHub 叠在 #11 上），src/iselan/texts/ 文本选择器与 35 条测试，灰港 100 种子无异常。
- ENG-07：PR #14（GitHub 叠在 #13 上），api/profile 档案接口、D1 档案表、src/net/profile.ts 与 33 条测试。
- ENG-05：PR #15（GitHub 叠在 #14 上），src/iselan/ai/ AI 协议、api/gm 的 iselan_turn 与回执、src/net/iselanGm.ts 与 27 条测试。
- UI-01：PR #16（叠在 #15 上），阅读节奏和四个世界面板、23 条测试与截图。
- ACH-01：叠在 #16 上，成就目录、首版 10 项服务端判定、图鉴、解锁提示、结局页进度与 43 条测试。lint、test（284 通过）、build、check-texts、wrangler 打包预演全部通过。

### 建议下一步 / Recommended next action

下一张 Cursor 卡是 ENG-06（费用守卫），从 cursor/eng-05-ai-protocol-034a 切分支：server/iselanTurn.ts 的模型调用已返回用量（含缓存命中 token），在那里记 D1 费用账并按 CONFIG.cost 拦截。ENG-06 的方案：D1 费用账按北京时间分日，调用前按最坏情况预扣，超过 28 元转离线主持，调用后按实际 token 补差；次数上限也记在同一本账里（现有 useQuota 按 UTC 换日，不能直接用）；结局用 GM_ENDING_MODEL。#7 合并后把 #8、#10 的目标改为 feat/iselan-v1，并依次变基 #10、#11、#13、#14、#15、#16 与 ACH-01。

### 完成标准 / Completion criteria

- 每张卡满足 13 第 4 节的验收与第 5 节的检查。

## 不可丢失 / Keep

### 有效决定 / Active decisions

- Cursor 是唯一写游戏代码的代理；Codex 审核并可按 13 第 2 节的条件把任务 PR 合并进 feat/iselan-v1；Cursor 不合并自己的 PR。
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

## 材料与缺口 / Materials and gaps

### 工作区与关键文件 / Workspace and important files

- docs/story/12-开工规格.md、13-代码代理任务书.md、docs/协作看板.md、docs/story/data/、docs/story/tools/check-texts.mjs。

### 随包附件 / Included attachments

- 无 / None.

### 未决问题 / Open questions

- PR #7、#8、#10、#11、#13、#14、#15、#16 与 ACH-01 的 PR 待 Codex 审核（用户回家后）。
- 看板待决问题 3 已解决（新增提姆两句台词待 Codex 审）；4 的判定已解决，UI-02 要按看板写的两条接入（只传在座者、文本后置与行动同一次提交）。
- ENG-05 的取舍待审核：回执只担保 AI 原文，不担保本地规则结算；日志里每个 ai: 意图都必须有回应。
- ENG-07 的两处取舍待审核：全程离线主持的单人局记为“未验证”；Node 托管上档案返回 503（只在 Cloudflare 与本机开发可用）。
- ENG-04 的两处取舍待审核：没有软标签的条目只看必；用兜底条目也记缺口。见修改日志“Cursor · ENG-04”。
- 全面危机文本节奏（第 2 轮 12B，第 4 轮起每 2 轮 X1–X6）等细节待试玩校准，见修改日志“Cursor · ENG-03”。

### 已知缺失 / Known omissions

- 费用守卫（ENG-06）已暂停，未开工；未试玩。

### 需要重新验证 / Revalidate

- PR #7、#8、#10、#11、#13、#14、#15 是否已合并；feat/iselan-v1 的最新提交和打开的 [卡号] 草稿 PR。
