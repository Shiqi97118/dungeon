# 伊瑟兰_剧情交接设计包 V1.0｜设计交接分支

> 分支：`cursor/isrlan-design-handoff-034a`，基于 `feat/local-workbuddy-handoff`（`74d8ea8`）。
> 本目录只保存**设计依据**，不是游戏里已经实现的内容。目录位置按 `00-先读我.md` 的推荐放在 `docs/product/narrative-v1/`。
> 剧情文档的修订在 PR #5（分支 `cursor/open-world-endings-034a`）中进行，本分支不改 PR #5。

## 先读

1. `00-先读我.md`：已确认的方向、包内文件用途、同步与冲突规则。
2. `CODEX_跨电脑接收.md`：给另一台电脑上的 Codex 的接收步骤（用户原文）。
3. `CURSOR_立即发送.md`：发给 Cursor 的同步任务（用户原文）。

## 当前收到了哪些文件（2026-11-11）

运行 `python docs/product/narrative-v1/tools/check_received.py` 可以随时重新核对。该脚本把本目录与 `SHA256SUMS.txt` 逐个比对；加 `--strict` 时，只要有缺失或内容不符，退出码就是 1。

| 状态 | 文件 |
|---|---|
| 已收到，校验和一致 | `00-先读我.md`、`CURSOR_立即发送.md`、`CODEX_跨电脑接收.md`、`assets/icons/成就图标总览.png`、`assets/icons/png/` 中的 EX01–EX10 与 LG01–LG04（共 14 个） |
| 已收到，本身不在清单里 | `SHA256SUMS.txt`（清单本身）、`VALIDATION.txt`（打包后生成的静态验证报告） |
| **未收到** | `docs/01-叙事架构与剧情修订.md` 至 `docs/08-本次讨论决策台账.md`（8 个）；`data/achievements.v1.json`、`data/achievements.public.json`、`data/event-contract.example.json`；`contracts/narrative.types.ts`；`tools/validate_package.py`、`tools/build_assets.py`、`tools/build_prototype.py`；`ui/achievement-prototype.html` 与 3 张 UI 截图；其余 37 个 PNG 图标与全部 51 个 SVG 图标 |

清单共 125 个文件，已收到 18 个，缺 107 个。**在缺失文件补齐之前，不要根据聊天记忆或本 README 猜测它们的内容。**

## 校验中发现的问题

`SHA256SUMS.txt` 里有 4 对 PNG 图标的内容完全相同；它们对应的 SVG 互不相同。这说明 PNG 导出时可能套用了同一张图：

| 成就 | 成就 | 图案 |
|---|---|---|
| EX02 七方旅人 | EX10 不留空白的地图 | 地图 |
| LG02 第七声的命名者 | LG03 皇帝的归来 | 王冠 |
| LG05 不敲响的钟 | LG08 让钟保持沉默 | 钟 |
| RE02 不愿遗忘的人 | RE06 绝不丢下任何人 | 心形 |

需要用户决定：是否为这些成就重新画出可以区分的图标，或者确认这是有意共用。

## 怎样把完整设计包放进本分支（在用户自己的电脑上）

只有一台电脑负责推送本分支，推送时另一台不要同时修改。

```bash
git fetch origin cursor/isrlan-design-handoff-034a
git switch cursor/isrlan-design-handoff-034a
# 把本机“伊瑟兰_剧情交接设计包”文件夹里的内容复制到 docs/product/narrative-v1/，保持原有子目录
python docs/product/narrative-v1/tools/check_received.py --strict
git add docs/product/narrative-v1
git commit -m "docs(product): add full narrative design package v1.0"
git push origin cursor/isrlan-design-handoff-034a
```

提交前确认没有带上 `.local`、登录缓存、调试 URL、Token、私钥或 `.env` 的值。

## 边界

- 本分支只保存设计文件，不改游戏代码，也不改 PR #5。
- 实施（事件账本、成就引擎、QTE、界面）另建分支，按 `CODEX_跨电脑接收.md` 的顺序推进；`ui/` 原型只是模拟，不是已实现的功能。
- 不擅自合并、上线、充值、删除。合并到 `main` 会触发 Cloudflare 自动发布，必须由用户决定。
