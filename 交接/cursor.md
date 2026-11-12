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

2026-11-12 08:50（北京时间）。11-11 的九张卡（PR #7、#8、#10、#11、#13、#14、#15、#16、#17）仍等 Codex 审核；WorkBuddy 的 PR #18（草稿，Windows 兼容与费用纯函数）叠在 #17 上。11-12 新增：
- UI-01 补充：PR #19（叠在 #18 上），375×667 翻页栏越屏修复。
- OPS：PR #21（cursor/ops-cf-previews-034a → feat/iselan-v1），修复所有分支 Cloudflare 检查失败（缺 Wrangler previews 配置块），自身检查已转绿。
- QTE-01 第一阶段：PR #22（叠在 #19 上），evidence（GH-BEAT-04）与互动外壳，按 GPT 的 7 条复核独立实现，31 项浏览器检查通过。
- ENG-06：cursor/eng-06-cost-guard-034a（叠在 #22 上），D1 费用账与 28 元全站上限，331 条测试通过。

### 建议下一步 / Recommended next action

1. Codex 审 PR #21 并合并进 feat/iselan-v1，然后自下而上变基 #7 → … → ENG-06。ENG-06 的 worker/index.ts 会与 #21 冲突，两边都保留：没有 env.DB 时 store、profiles、budget 都为 null。
2. QTE-01 第二阶段：dialogue-gesture（GH-SCN-09 晚宴），沿用 src/iselan/interaction/session.ts 的状态机与 src/ui/interaction/Modal.tsx；ART-02 视觉稿到了再替换账本的 CSS 占位。
3. UI-02：把 evidence 接进 GH-BEAT-04 的真实流程（结算走 settleInteraction，跳过时按普通检定），晚宴手势同理；再走 A1–A12。

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

- 11-11 九张卡与 11-12 的 PR #19、#21、#22、ENG-06 都待 Codex 审核。
- 看板待决问题 5（待用户）：价格表只有两种 DeepSeek 模型，正式环境若用 xAI / OpenRouter 密钥，ENG-06 之后 AI 主持回 503。
- 看板待决问题 6：PR #21 合并后其余分支的 Cloudflare 检查才会转绿。
- QTE-01 的取舍待审核：requestId 即账本意图编号；结果未知时只许同请求重试，玩家不能改选；跳过给出普通检定（洞察 12），检定本身由 UI-02 接骰子流程。
- ENG-06 的取舍待审核：只有供应商明确返回错误状态才释放预占；旧版主持不报用量，按预估入账；部署的 Node 托管没有共享账，iselan_turn 回 503。
- 之前的 ENG-04、ENG-05、ENG-07 取舍与 03 的节奏细节，见 11-11 修改日志对应小节。

### 已知缺失 / Known omissions

- QTE 的 dialogue-gesture 未做；evidence 只在开发演示 ?demo=evidence 里，没有接进游戏。
- UI-02 灰港完整流程与 A1–A12 试玩未开始。
- QTE v2 原始补丁和日志始终没拿到，QTE-01 按结论独立实现。

### 需要重新验证 / Revalidate

- PR #21 是否已合并进 feat/iselan-v1；各栈上分支变基后的 Cloudflare 检查。
- PR #18 是否仍是草稿、head 是否仍为 9ff450f（#19 及以上都基于它）。
