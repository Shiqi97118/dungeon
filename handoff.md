---
handoff: "task-context"
version: "1.0"
language: "zh-Hans"
coverage: "PARTIAL"
---

# 任务交接 / Task Handoff

## 继续位置 / Resume

### 当前目标 / Current goal

把第一章重写为恢弘的原创奇幻世界“伊瑟兰”：玩家做任何事都合理，结局不固定，从 20 个发展方向中按实际进展由 AI 在合适时机给出。当前阶段只写剧情框架文档，不改代码。

### 停止位置 / Stopped at

2026-11-11，Cursor 云端代理在分支 cursor/open-world-endings-034a（基于 PR #4 的 74d8ea8）新增 docs/story/ 剧情框架文档集（README 与 01–08 共 9 个文件），删除被取代的 docs/design/世界观与开放结局方案.md，追加当天修改日志。代码零改动，没有试玩、部署或合并。停在这里是因为用户要求先把剧情框架整理成文档，待用户审阅后再开发。

本机 D 盘迁移的最后核验结论（见 修改日志/26-11-11.md）：Codex Store 本体已在 D 盘的 WindowsApps 目录，六个数据/WorkBuddy 源目录仍在 C 盘；云端代理无法访问本机，没有再核验。

### 建议下一步 / Recommended next action

请用户审阅 docs/story/（先读 README），确认 README“尚待用户确认”的三项；确认后按 docs/story/08-开发备忘.md 第 5 节的顺序开发，先做数据层与规则层的纯函数和测试。

### 完成标准 / Completion criteria

- 本阶段：用户确认剧情框架，或提出的修改已写回 docs/story/ 并同步日志与本文件。
- 开发阶段：08 第 6 节列出的测试意图全部有对应测试且通过；单人与联机都能从新开场连续游玩；TypeScript、生产构建与全量测试通过，跳过项写明原因。

## 不可丢失 / Keep

### 有效决定 / Active decisions

- 当前只写文档、不改代码（用户 2026-11-11）。
- 人名、地名偏西方大陆风格，命名规范见 docs/story/01-世界观圣经.md 第 2 节；预制角色改名但 id 不变（哈兰、芙蕾雅、基兰、洛森、梅格、达维娜）。
- 每名角色至少 31 次有效选择才能进入终局（R1）；在最低选择数时只开放第 0 档 2 个方向（2/20），最短路线只经历开场和至多 3 段支线（约 3/32）。这一解释写在 02 第 1、7 节，待用户确认。
- 终局：程序确定可用深度档，按“倾向分 + 1”加权随机抽 3 个候选，AI 选主方向（可加副方向）或凭 3 条证据提出新方向；数值与门槛归程序，AI 只提出变化。
- NPC 分 S/A/B/C/D 五个量级，共 38 位具名人物；态度 −3…+3、最多 3 条印象、涟漪规则和 9 条暗线见 docs/story/05。
- AI 调用次数与配置要调高；08 第 2 节只给建议值（全站 5000、用户 600、IP 1000、房间 1500），未改配置，费用待按真实用量核算后由用户确认。
- 旧存档可以不兼容：SAVE_VERSION 升到 5 并给出提示。
- 第二章《钟下空名》暂缓；其人物已并入新世界（塞拉芬·凯恩、罗兰·凯斯、阿佳莎·洛文），原始资料仍只在用户上传的文件里。
- 早先决定仍有效：本地执行，不买云电脑；Codex 调度和严格复核，WorkBuddy 执行，免费 hy4free 优先；公开链接的 AI 主持人用 DeepSeek，密钥在 Cloudflare 的 OPENAI_API_KEY 机密里。

### 约束与权限 / Constraints and authority

- 遵从 AGENTS.md、docs/编程与审核原则.md 全部 12 条；每次修改前读全部修改日志，改动写入当天 修改日志/YY-MM-DD.md；阶段结束按 Jiaojie EXPORT 更新本文件。
- 不合并 PR、不部署、不充值。合并到 main 会触发 Cloudflare 自动发布到公开网址，必须由用户决定。
- 不修改 feat/local-workbuddy-handoff 分支本身；云端代理在自己的 cursor/* 分支工作。
- 角色死亡、失去名字等永久后果只在玩家主动选择或明确接受风险后发生（docs/story/07 第 7 节）。
- 历史交接不转移发送、发布、付款、删除、安装、执行或外部写入权限；执行前按当前会话重新确认。

### 不要复活 / Do not revive

- 不恢复云电脑购买方案。
- 不在第一章定稿前推进第二章实现。
- 不把结局写回固定的几个按钮；不让 AI 自行决定何时终局或直接改数值。
- 不在用户确认剧情框架前开始改代码。
- 不使用现有作品（魔兽世界等）的专有名词。
- 不上传 .local、登录缓存、Token、私钥或 .env 值。

### 失败尝试 / Failed attempts

- Jiaojie 原始导出工具在 Windows 返回 NOFOLLOW_UNSUPPORTED；在云端 Linux 环境 receive/export 可以正常运行。
- 本机 Computer Use 浏览器验证因 Windows 沙箱错误失败，尚无桌面/手机实机证据。
- 首个 D 盘迁移助手停在 moving_store_package、completed 为空；终止原因未证实。

### 已回答问题 / Answered questions

- 仓库 https://github.com/Shiqi97118/dungeon ；公开游玩网址 https://echo-well.tintenfisch.workers.dev/ 。
- 第一章可以整体改，不限于矿洞；第二章等第一章优化完再推进（用户 2026-11-11）。
- 想要约 20 个发展方向、结局随机但可信、保留新分支（用户 2026-11-11）。
- 命名风格可接受且偏西方；调高 AI 次数与配置；旧存档可不兼容；最短路线每人超过 30 次选择且可达结局占比 ≤ 10%（用户 2026-11-11）。
- NPC 的量级、性格、特质、关系、明线暗线都要规划，一举一动影响走向（用户 2026-11-11）。
- 用户接受 Codex Store 本体放在 D 盘的 WindowsApps 目录 的目录例外，不再重复确认。

## 材料与缺口 / Materials and gaps

### 工作区与关键文件 / Workspace and important files

- docs/story/README.md：阅读顺序、要求与落实位置对照、待确认事项。
- docs/story/01–08：世界观、主线节奏、地区与冒险、势力、人物与关系网、分支与结局、AI 主持规范、开发备忘。
- 修改日志/26-11-11.md：当天记录，含云端代理两节和 12 条复核。
- src/game/{engine,ai,session,endings,types}.ts、src/game/data/{scenes,clues,characters}.ts：将来要改的主要位置。
- 分支 cursor/open-world-endings-034a，PR #5 https://github.com/Shiqi97118/dungeon/pull/5 （基于 feat/local-workbuddy-handoff）；PR #4 https://github.com/Shiqi97118/dungeon/pull/4 （草稿，未合并）。

### 随包附件 / Included attachments

- 无 / None.

### 未决问题 / Open questions

- docs/story/README.md“尚待用户确认”：AI 上限建议值与费用、结局是否用更强模型、人物/暗线/方向是否增删。
- 有效选择 31/40/50/60 的档位门槛、时钟每 4 轮 +1、倾向分阈值 3 都是初始值，需试玩校准。

### 已知缺失 / Known omissions

- 第二章原始资料只在用户上传的文件里，未进入仓库。
- 剧情框架没有经过试玩；节奏与时长估计未验证。
- 不含聊天逐字稿、隐藏推理、本机登录态和 WorkBuddy 会话身份。

### 需要重新验证 / Revalidate

- 本机 D 盘迁移助手的最新 state.json 与六个数据目录位置（只能在本机核验）。
- PR #4 是否已合并或有新提交；若有，本分支需要先同步。
- 公开网址的 AI 主持人和 DeepSeek 余额是否仍可用。
