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

2026-11-11 16:30（北京时间），Cursor 已完成四张卡，都等 Codex 审核：
- ENG-01：PR #7（cursor/eng-01-data-config-034a → feat/iselan-v1），生成类型与配置。
- CNT-01：PR #8（基于 #7 分支），灰港两种玩家事业的 22 条文本。
- ENG-02：PR #10（基于 #7 分支），事件账本、快照归约、存档版本 5。
- ENG-03：PR #11（GitHub 叠在 #10 上），src/iselan/rules/ 全部规则与 40 条测试；事件 73 种。lint、test（123 通过）、build、check-texts 全部通过。

### 建议下一步 / Recommended next action

下一张 Cursor 卡是 ENG-04（文本选择器），从 cursor/eng-03-rules-034a 切分支：必 / 禁止 / 需知直接用 src/iselan/rules/conditions.ts 的 evalCond，软标签打分、复用冷却（快照 texts）、同分按 rngFor(seed, …)。之后 ENG-07（档案，只依赖 ENG-02）、ENG-05。#7 合并后把 #8、#10 的目标改为 feat/iselan-v1 并依次变基 #10、#11。

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

- PR #7、#8、#10、#11 待 Codex 审核（用户回家后）。
- 全面危机文本节奏（第 2 轮 12B，第 4 轮起每 2 轮 X1–X6）等细节待试玩校准，见修改日志“Cursor · ENG-03”。

### 已知缺失 / Known omissions

- 文本选择器、AI 协议、费用守卫、档案、界面尚未开始；未试玩。

### 需要重新验证 / Revalidate

- PR #7、#8、#10、#11 是否已合并；feat/iselan-v1 的最新提交和打开的 [卡号] 草稿 PR。
