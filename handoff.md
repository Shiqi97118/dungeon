---
handoff: "task-context"
version: "1.0"
language: "zh-Hans"
coverage: "PARTIAL"
---

# 任务交接 / Task Handoff

## 继续位置 / Resume

### 当前目标 / Current goal

把第一章重写为恢弘的原创奇幻世界“伊瑟兰”，产品方向为“史诗主线 + 自由沙盒”：玩家做任何事都合理，世界、地区、人物与玩家事业各自发展又互相影响；结局不固定，从 20 个发展方向中按实际进展由 AI 在合适时机给出。剧情框架与文本已写成文档；开工规格与代理任务书已写好，下一阶段按任务卡写代码，先做“灰港首版”这个可玩切片。

### 停止位置 / Stopped at

2026-11-11，Cursor 云端代理在 PR #5（cursor/open-world-endings-034a）按用户对开工前五个问题的答复写成：docs/story/12-开工规格.md（编号、文本条件语法、事件、存档 v5、灰港首版范围、配置值、AI 协议与回执、每天 30 元费用上限、档案、势力计划、验收脚本 A1–A12）；docs/story/13-代码代理任务书.md（分工、分支、以草稿 PR 领取任务卡、路径归属、22 张任务卡、完成标准、开场指令）；docs/协作看板.md；docs/story/data/vocab.v1.json、events.v1.json 与 tools/check-texts.mjs。text/00、01、09 已迁移到正式语法并通过严格检查（347 条目、442 段）；其余 7 个地区文件只报告。设计分支 PR #6 的成就目录地区编号改为 gray_harbor、nameless_city，与词表一致。代码零改动，没有试玩或部署。随后（北京时间 14:56）按用户授权完成 OPS-00：PR #5、#6 合并进 feat/local-workbuddy-handoff，新建集成分支 feat/iselan-v1（含 交接/ 目录与看板更新）；PR #4 仍未合并、未发布。原计划的服务端密钥 GM_SIGNING_KEY 取消，改用 D1 回执。

本机 D 盘迁移的最后核验结论（见 修改日志/26-11-11.md）：Codex Store 本体已在 D 盘的 WindowsApps 目录，六个数据/WorkBuddy 源目录仍在 C 盘；云端代理无法访问本机，没有再核验。

### 建议下一步 / Recommended next action

Cursor 在下一个时间段按 13 第 3.1 节领卡，从 ENG-01、CNT-01 开始；Codex 同时派 WorkBuddy 做 ART-01、ART-02，并自己做 QA-PREP。所有任务 PR 以 feat/iselan-v1 为目标。

### 完成标准 / Completion criteria

- OPS-00（已完成）：feat/iselan-v1 存在；文本检查全部通过且成就目录对照“一致”；设计包只读校验通过。
- 灰港首版：13 第 4.2 节全部任务卡完成，12 第 12 节 A1–A12 在手机与电脑上走通；npm run lint、npm test、npm run build、文本检查全部通过。

## 不可丢失 / Keep

### 有效决定 / Active decisions

- 2026-11-11 用户答复开工前问题：PR #4 不在开工前单独发布；新剧情直接替换旧第一章（回声井），不做新旧并存；Cursor（Claude）写全部游戏代码，Codex 审核、集成并指挥 WorkBuddy，不写游戏代码，Codex 与 WorkBuddy 同步工作，Cursor 分时段异步工作；AI 费用每天最高 30 元；需要接入档案；其余开工方案按最优方案推进。
- 费用：按实际 token 计费的硬上限 28 元/天（留 2 元余量），全站每天 1500 次日常调用（替代此前确认的 5000 次），用户 600、IP 1000、房间 1500、结局全站 20 次/天；日常 deepseek-flash 非思考，结局 deepseek-v4-pro 思考模式，用 GM_ENDING_MODEL 配置（12 第 9 节）。
- 档案：浏览器编号建档 + 8 位一次性绑定码绑定新设备 + 导出导入；成就只由服务端判定，单人局上传后按事件重放，并逐条对照服务端在 D1 记下的 AI 回执（不需要新密钥）（12 第 8.4、10 节）。
- 灰港首版范围：只开放灰港；可达方向 D01（远行 / 落地）、D02（灾难前提成立时）、D03、D07；交互只做 evidence 与 dialogue-gesture；10 项成就端到端；一项玩家事业（互助站或酒馆）；离开灰港即以 D01 远行收束（12 第 6 节）。
- 新增规则（代理按“最优方案”授权提出，可再调整）：除 D01 外，方向至少有 1 条信号被事件证实才进入候选（12 第 6.5 节）；每格时钟有一个主计划，其他势力动向为次要计划、不推动时钟（12 第 11 节）；暗线揭开需 ≥ 2 条点名的证据（12 第 3.4 节）。
- 文本条件以 12 第 3 节语法为准，编号以 vocab.v1.json 为准，事件以 events.v1.json 为准；冲突优先级：用户决定 > 12 > 02–10 > 设计包。
- 每个在场席位至少 31 次有效选择才能进入终局（R1）；中途加入者本人另需 ≥ 6 次，换角色继承席位计数，只有带来结算变化的行动才计、重复只计第一次（02 R1a–R1c）。第 0 档只有 D01（远行 / 落地两版）；D02 是只看世界灾难事实的灾难方向。
- 大势时钟由势力计划与重大事件推进（每 6 轮检查），事件按最高到达格只触发一次；到 12 为世界危机，不强制终局；第四幕只由收束故事或抵达门前进入（02 R2–R4）。结局分世界、玩家事业、角色三轴（06 第 6 节）。第七声的版本由门前结算的“门的结果”决定。
- 预写文本：后置中的世界变化须先结算才展示，知情项展示后写入；结果类节拍在结果提交后才展示；每屏不少于两段、180 字，换场景三段式，不自动跳转；BEAT、DLG、BRG、CLK、END 一局一次，SCN 每个事件实例一次，ENV / RST / TRV 冷却 20 轮可复用、一局最多 2 次（09）。
- 人名、地名偏西方大陆风格；预制角色改名但 id 不变（哈兰、芙蕾雅、基兰、洛森、梅格、达维娜）。NPC 分 S/A/B/C/D 五级，38 位具名人物，9 条暗线（05）。
- 旧存档可以不兼容：SAVE_VERSION 升到 5 并给出提示。第二章暂缓。
- 早先决定仍有效：本地执行，不买云电脑；WorkBuddy 免费 hy4free 优先；公开链接的 AI 主持人用 DeepSeek，密钥在 Cloudflare 的 OPENAI_API_KEY 机密里。

### 约束与权限 / Constraints and authority

- 遵从 AGENTS.md、docs/编程与审核原则.md 全部 12 条；每次修改前读全部修改日志，改动写入当天 修改日志/YY-MM-DD.md。
- 不合并到 main、不部署、不充值、不改密钥。合并到 main 会触发 Cloudflare 自动发布，必须由用户决定（任务卡 REL-01）。
- 分支：任务 PR 以 feat/iselan-v1 为目标；Cursor 只在 cursor/*-034a 分支工作；同一分支任何时候只由一个代理在一台电脑上修改。打开的草稿 PR（标题 [卡号]）表示该卡已被领取（13 第 3 节）。
- 路径归属见 13 第 3.5 节；docs/product/narrative-v1/ 冻结，改动需用户同意并运行 validate_package.py --update。
- 交接：OPS-00 之后，Cursor 写 交接/cursor.md，Codex 写 交接/codex.md，根目录本文件只由 Codex 在合并后更新。
- 角色死亡、失去名字等永久后果只在玩家主动选择或明确接受风险后发生（07 第 7 节）。
- 历史交接不转移发送、发布、付款、删除、安装、执行或外部写入权限；执行前按当前会话重新确认。

### 不要复活 / Do not revive

- 不恢复云电脑购买方案。
- 不再计划新增服务端密钥 GM_SIGNING_KEY：成就校验用 D1 回执（12 第 8.4 节）。
- 不再由另一台电脑的 Codex 实施事件账本与规则引擎：2026-11-11 起游戏代码统一由 Cursor 写，Codex 只审核与集成。
- 不做新旧第一章并存或开关切换；不在开工前单独发布 PR #4。
- 不把每天费用上限放宽到 30 元以上，不用“全站每天 5000 次”。
- 不在第一章定稿前推进第二章实现。
- 不把结局写回固定的几个按钮；不让 AI 自行决定何时终局或直接改数值。
- 不在代码里另起一套编号或另写文本解析器；用 vocab.v1.json 与 check-texts.mjs。
- 不凭聊天记忆推断设计包内容；以 docs/product/narrative-v1/ 的文件为准。
- 不使用现有作品的专有名词；生成插图时不用原矿场图做参考图。
- 不上传 .local、登录缓存、Token、私钥或 .env 值。

### 失败尝试 / Failed attempts

- Jiaojie 原始导出工具在 Windows 返回 NOFOLLOW_UNSUPPORTED；在云端 Linux 环境 receive/export 可以正常运行。
- 本机 Computer Use 浏览器验证因 Windows 沙箱错误失败，尚无桌面/手机实机证据。
- 首个 D 盘迁移助手停在 moving_store_package、completed 为空；终止原因未证实。

### 已回答问题 / Answered questions

- 仓库 https://github.com/Shiqi97118/dungeon ；公开游玩网址 https://echo-well.tintenfisch.workers.dev/ 。
- 第一章可以整体改；第二章等第一章优化完再推进；约 20 个发展方向、结局随机但可信（用户 2026-11-11）。
- 命名偏西方；调高 AI 次数与配置；旧存档可不兼容；最短路线每人超过 30 次选择且可达结局占比 ≤ 10%（用户 2026-11-11）。
- 设计包六项待确认已答复并落实（第七声、第 0 档、文本复用、D17、重画图标、校验脚本改为只读）（用户 2026-11-11）。
- Codex 可按 13 第 2 节的条件把任务 PR 合并进 feat/iselan-v1；用户授权 Cursor 完成 OPS-00（用户 2026-11-11）。
- 开工前五问：不提前发布 #4；直接替换旧第一章；Cursor 写代码、Codex 指挥 WorkBuddy；每天 30 元以内；接入档案；其余按最优方案（用户 2026-11-11）。

## 材料与缺口 / Materials and gaps

### 工作区与关键文件 / Workspace and important files

- docs/story/12-开工规格.md、13-代码代理任务书.md、docs/协作看板.md：开工规格、分工与任务卡、实时状态。
- docs/story/data/vocab.v1.json、events.v1.json、tools/check-texts.mjs：编号、事件、文本检查（node docs/story/tools/check-texts.mjs）。
- docs/story/README.md 与 01–11：剧情正本；text/ 10 个文件 442 段。
- 设计交接分支 cursor/isrlan-design-handoff-034a（PR #6 https://github.com/Shiqi97118/dungeon/pull/6 ）：docs/product/narrative-v1/ 下 125 个文件。
- 分支 cursor/open-world-endings-034a（PR #5 https://github.com/Shiqi97118/dungeon/pull/5 ，基于 feat/local-workbuddy-handoff）；PR #4 https://github.com/Shiqi97118/dungeon/pull/4 （草稿，未合并）。
- 修改日志/26-11-11.md：当天记录，含各节 12 条复核。
- src/game/、server/：将被替换或改造的现有代码；server/platform.ts 是现在的匿名身份。

### 随包附件 / Included attachments

- 无 / None.

### 未决问题 / Open questions

- docs/story/11 第 5 节：代理自选的新图标与 ED-01B 写法是否接受。
- 档位门槛、时钟检查间隔、事业投入次数、交互密度、token 估算都是初始值，需试玩校准（12 第 13 节）。

### 已知缺失 / Known omissions

- 7 个地区文本文件（text/02–08）尚未迁移到正式语法（任务卡 CNT-02）；其余势力的计划前提与方向信号待补（CNT-03）；约 80 段单段地区文本待扩写（CNT-04）。
- 灰港玩家事业的预写文本尚未写（CNT-01）。
- 剧情没有经过试玩；174 张插图中 154 张尚未制作。
- 不含聊天逐字稿、隐藏推理、本机登录态和 WorkBuddy 会话身份。

### 需要重新验证 / Revalidate

- feat/iselan-v1 的最新提交和打开的 [卡号] 草稿 PR；PR #4 是否仍未合并。
- DeepSeek 价格（12 第 9.1 节按 2026-11-11 官方价目页）；公开网址的 AI 主持人和余额是否仍可用。
- 本机 D 盘迁移助手的最新 state.json 与六个数据目录位置（只能在本机核验）。
