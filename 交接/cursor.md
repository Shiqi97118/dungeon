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

2026-11-12 10:05（北京时间）。审核修复与整条栈已于 09:30 合并进 feat/iselan-v1。随后完成 QTE-01 第二阶段 dialogue-gesture（GH-SCN-09 晚宴），分支 cursor/qte-02-dialogue-gesture-034a，PR 指向 feat/iselan-v1，待合并。

### 建议下一步 / Recommended next action

1. 合并 QTE-01 第二阶段的 PR。
2. UI-02：把 evidence 接进 GH-BEAT-04、把 dialogue-gesture 接进 GH-SCN-09。两处都通过 settleInteraction 结算；晚宴要传入到场宾客（present），联机时实例用 interactionInstanceId(条目, 角色)。然后走 A1–A12。看板待决问题 7 的后四项随 UI-02 处理。

### 完成标准 / Completion criteria

- 每张卡满足 13 第 4 节的验收与第 5 节的检查。

## 不可丢失 / Keep

### 有效决定 / Active decisions

- Cursor 是唯一写游戏代码的代理。2026-11-12 起用户授权 Cursor 代 Codex 审核并合并进 feat/iselan-v1（不含 main）。
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

## 材料与缺口 / Materials and gaps

### 工作区与关键文件 / Workspace and important files

- docs/story/12-开工规格.md、13-代码代理任务书.md、docs/协作看板.md、docs/story/data/、docs/story/tools/check-texts.mjs。

### 随包附件 / Included attachments

- 无 / None.

### 未决问题 / Open questions

- 看板待决问题 7：伪造上传首版接受风险；回执绑定档案、导出摘要防篡改、AI 白名单覆盖、结局接口操作留给 UI-02。
- 晚宴的取舍待审：姿态只改演出，不改状态；“展示证据”没做；跳过按交涉 12；12 句反应文案。
- 第 2 档“与该方向相关的势力”：DIRECTION_RULES 还没列每个方向的势力，暂按任一势力判断，留给 CNT-03。

### 已知缺失 / Known omissions

- 两个交互模板只在开发演示 ?demo=evidence、?demo=gesture 里，还没有接进游戏。
- UI-02 灰港完整流程与 A1–A12 试玩未开始。
- QTE v2 原始补丁和日志始终没拿到，QTE-01 按结论独立实现。

### 需要重新验证 / Revalidate

- feat/iselan-v1 合并后的 Cloudflare 检查是否转绿。
- 已合并的远端分支是否已删除（保留 main、feat/iselan-v1、feat/local-workbuddy-handoff）。
