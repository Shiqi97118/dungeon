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

2026-11-12 14:55（北京时间）。QTE-01 两阶段都已合并进 feat/iselan-v1。UI-02 第一片（src/iselan/play 桌面控制器）已合并（PR #26）；随后按用户意见放慢节奏：时辰 6 轮一段，主线段落至少隔 4 轮（PR #27，已合并）。随后加存档与回退（PR #28）、联机回退表决（PR #29），均已合并。第二片单人界面已合并（PR #31）。第三片结局页与 AI 结局裁决已合并（PR #39）。第四片联机接新引擎已合并（PR #41）。第五片删旧章与标题文案已合并（PR #42）。第六片 A1–A12 验收已合并（PR #43）。第七片联机收束全员同意、读完再换批已合并（PR #45）。联机 CPU 优化已合并（PR #46）。CNT-02/04 七个地区已合并（PR #47）。ART-01 首批九张插图已审，集成分支已提交 PR。

### 建议下一步 / Recommended next action

1. PR #44（首页风格与简化选人）等用户确认，确认后接上今天的联机大厅改动再合并；审 GPT 补的灰港内容缺口（人物死亡文本、账本第二来源、码头无卢多的进入文本、酒馆盈利规格）。2. 开放联机前确认 Workers 档位：长局每次操作仍约 15 毫秒（Node 实测），再降要把房间改成分段存储。3. EXP-01、CNT-03。自定义角色（旧车卡已删）留给后续卡。

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
- 回退（2026-11-12）：用户希望后悔时不重开；任一决定前可回退；联机局需在座真人全员同意（用户要求）；回退前已解锁的成就保留（用户 10:53 确认）。
- 节奏（2026-11-12）：用户嫌 3 轮一段时辰、主线隔 2 轮太快；现为 6 轮一段、至少隔 4 轮。主线间隔不能超过 4 轮，否则 A3 来不及在时钟到 4 前做完。

## 材料与缺口 / Materials and gaps

### 工作区与关键文件 / Workspace and important files

- docs/story/12-开工规格.md、13-代码代理任务书.md、docs/协作看板.md、docs/story/data/、docs/story/tools/check-texts.mjs。

### 随包附件 / Included attachments

- 无 / None.

### 未决问题 / Open questions

- 看板待决问题 7：伪造上传首版接受风险；回执绑定档案、导出摘要防篡改、AI 白名单覆盖、结局接口操作留给 UI-02。
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
