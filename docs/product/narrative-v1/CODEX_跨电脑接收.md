# 给另一台电脑 Codex：跨电脑接收

本包是伊瑟兰剧情与成就/QTE 产品设计的**版本化交接**。当你在另一台机器接收时，不要根据聊天记忆猜测旧任务状态。先拉取仓库最新分支，查看 git status、PR #5 最新 SHA、AGENTS.md、docs/编程与审核原则.md（全部 12 条）、handoff.md 与修改日志。

**执行顺序：**

1. 读取 `00-先读我.md`、`docs/08-本次讨论决策台账.md`、`docs/06-迭代实施计划.md`；列出已授权范围、受保护文件、未决问题。
2. 核对 `data/achievements.v1.json`（完整内部设计）和 `data/achievements.public.json`（客户端防剧透目录）；校验 `assets/icons/svg/`、`assets/icons/png/`，阅读 `contracts/narrative.types.ts`。
3. 不修改 Cursor 正在编辑的 PR #5；为事件账本/成就引擎创建**独立分支**，先出设计差异和单元测试计划。
4. 实施顺序：canonical event → reducer + replay → achievement evaluator/幂等 → 跨账号/多角色归因 → UI 接口 → QTE 模板结果接入 → 三轴结局与编年史。
5. 线上不能信客户端单独上报成就；UI 原型仅是 mock，不是已实现。遇到实际账号/持久化能力缺口，明确列为 blocker，不要假装已跨设备同步。
6. 每个阶段报告测试与实际缺失，按项目规定维护修改日志/交接点；不擅自合并、上线、充值、删除。

你可以先运行 `python tools/validate_package.py` 做交接包静态验证，再按仓库本来的 `npm test`、`npm run build` 执行代码层测试（测试结果不能凭此包推断）。
