# 伊瑟兰_剧情交接设计包 V1.0｜设计交接分支

> 分支：`cursor/isrlan-design-handoff-034a`，基于 `feat/local-workbuddy-handoff`（`74d8ea8`）。
> 本目录只保存**设计依据**，不是游戏里已经实现的内容。目录位置按 `00-先读我.md` 的推荐放在 `docs/product/narrative-v1/`。
> 剧情文档的修订在 PR #5（分支 `cursor/open-world-endings-034a`）中进行，本分支不改 PR #5。

## 先读

> 本分支根目录的 `handoff.md` 是基础分支留下的旧版；剧情工作的最新交接点是 PR #5 分支（`cursor/open-world-endings-034a`）上的 `handoff.md` 与 `docs/story/11-审阅与修订记录.md`，接收时用 `git show origin/cursor/open-world-endings-034a:handoff.md` 读取。

1. `00-先读我.md`：已确认的方向、包内文件用途、同步与冲突规则。
2. `CODEX_跨电脑接收.md`：给另一台电脑上的 Codex 的接收步骤（用户原文）。
3. `CURSOR_立即发送.md`：发给 Cursor 的同步任务（用户原文）。

## 文件状态（2026-11-11 更新）

用户上传完整压缩包 `Iselan_Narrative_Achievements_QTE_Handoff_v1.zip` 后，清单中的 125 个文件全部到位，`tools/check_received.py --strict` 实测：125 项一致、0 项不符、0 项缺失。此前单独上传的 5 个文件与压缩包内的同名文件逐字节相同。

运行 `python docs/product/narrative-v1/tools/check_received.py --strict` 可以随时复核；本分支额外加入的 `README.md` 与 `tools/check_received.py` 不在清单中，脚本会忽略它们。

## 校验中发现的问题

`SHA256SUMS.txt` 里有 4 对 PNG 图标的内容完全相同；它们对应的 SVG 互不相同。这说明 PNG 导出时可能套用了同一张图：

| 成就 | 成就 | 图案 |
|---|---|---|
| EX02 七方旅人 | EX10 不留空白的地图 | 地图 |
| LG02 第七声的命名者 | LG03 皇帝的归来 | 王冠 |
| LG05 不敲响的钟 | LG08 让钟保持沉默 | 钟 |
| RE02 不愿遗忘的人 | RE06 绝不丢下任何人 | 心形 |

需要用户决定：是否为这些成就重新画出可以区分的图标，或者确认这是有意共用。包内的 `tools/validate_package.py` 只检查图标文件是否存在，没有发现这个问题。

### `tools/validate_package.py` 的两个副作用（已核对源码，未修改包内文件）

1. **它会重写 `SHA256SUMS.txt`**：脚本按当前目录重新生成清单，而不是对照原清单校验。在本目录运行后，清单会把本分支的 `README.md`、`tools/check_received.py` 也写进去，原始校验值就丢了。请先运行 `tools/check_received.py`；如需运行 `validate_package.py`，之后用 `git checkout -- docs/product/narrative-v1/SHA256SUMS.txt docs/product/narrative-v1/VALIDATION.txt` 还原。
2. **`VALIDATION.txt` 中“Browser smoke test …”一句是脚本里的固定文字**，每次运行都会原样写出，并不代表这一次真的执行了浏览器测试。脚本真实检查的只有：50 项成就数据结构、隐藏成就脱敏、图标文件存在、原型页含 `OFFLINE MOCK ONLY` 与 5 个关键元素。

## 以后要更新设计包时

完整的 V1.0 已在本分支。若出现新版本，只有一台电脑负责推送本分支，推送时另一台不要同时修改。

```bash
git fetch origin cursor/isrlan-design-handoff-034a
git switch cursor/isrlan-design-handoff-034a
# 把新版“伊瑟兰_剧情交接设计包”文件夹里的内容复制到 docs/product/narrative-v1/，保持原有子目录
python docs/product/narrative-v1/tools/check_received.py --strict
git add docs/product/narrative-v1
git commit -m "docs(product): update narrative design package"
git push origin cursor/isrlan-design-handoff-034a
```

提交前确认没有带上 `.local`、登录缓存、调试 URL、Token、私钥或 `.env` 的值。

## 边界

- 本分支只保存设计文件，不改游戏代码，也不改 PR #5。
- 实施（事件账本、成就引擎、QTE、界面）另建分支，按 `CODEX_跨电脑接收.md` 的顺序推进；`ui/` 原型只是模拟，不是已实现的功能。
- 不擅自合并、上线、充值、删除。合并到 `main` 会触发 Cloudflare 自动发布，必须由用户决定。
