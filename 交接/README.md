# 交接

每个代理只写自己的文件，会话结束时按 Jiaojie 技能 EXPORT 覆盖更新（规则见 `docs/story/13-代码代理任务书.md` 第 3.3 节）。

| 文件 | 谁写 | 内容 |
|---|---|---|
| `cursor.md` | Cursor | 写代码的停止点、下一张卡、未验证项 |
| `codex.md` | Codex | 审核与集成的停止点、派给 WorkBuddy 的任务与结果 |

根目录 `handoff.md` 是总交接，只由 Codex 在合并任务 PR 后更新。
