# Windows 本机迁移

先按根目录 Jiaojie 交接和全部修改日志接续。这里保存可复核的脚本，不保存本机认证、会话或回滚副本。

`migrate-ai-tools.ps1 -Mode Plan` 只读列出迁移源、目标、运行应用及磁盘条件。`-Mode Execute -ExpectedUserSid <准备迁移的用户SID>` 必须以**同一 Windows 用户**提升管理员权限运行；等待 Codex、WorkBuddy 和相关用户进程正常退出，不强杀。SID用 `[Security.Principal.WindowsIdentity]::GetCurrent().User.Value` 在原用户环境读取。可指定 `-WaitForExitMinutes 60`，超时停止。执行前保存所有聊天和本机任务。若本地脚本策略为 Restricted，仅本次 PowerShell 进程使用 `-ExecutionPolicy RemoteSigned`；不修改持久策略、不覆盖组策略。

目录映射：Codex 的 `.codex`、运行时缓存、LocalApp 和 Roaming 用户数据分别到 `D:\AI Tools\Codex\{State,Runtimes,LocalApp,UserData}`；WorkBuddy 数据和应用分别到 `D:\AI Tools\WorkBuddy\{Data,App}`。旧路径保留 Junction 兼容入口，避免改写存档中的绝对路径。没有更改全局 CODEX_HOME；不保证其他电脑凭据可复用。

本机已观察到的内部 Junction 单独保留并核对目标；未知链接或越界目标立即停止。复制保留 ACL，文件逐项 SHA-256 校验、目录与链接清单对比；源数据变化则停止。在 D 盘另存仅当前用户、SYSTEM 和管理员可访问的回滚副本。**初次切换保留 C 盘 `.migration-日期时间` 原目录，真正释放这部分空间须在重新启动核验后进行。**

Codex Store 本体使用微软 `Add-AppxVolume D:\WindowsApps` / `Move-AppxPackage`，不手动搬 WindowsApps。原沙箱服务在退出后正常停止，迁移完成恢复；不更改整个系统默认应用卷。WorkBuddy 采用搬移与旧安装路径兼容链接；没有冒称使用厂商重新安装流程，后续自动升级/卸载仍需验证。

执行状态与回滚副本位于 `D:\AI Tools\Shared\Migration\<时间>/`，包含私密应用数据，**禁止提交 GitHub**。失败不自动重试，不回滚覆盖更新后的工作；先检查 state.json 中每个已完成目录。中途失败可能是部分迁移，不代表原路径丢失。

完成后运行 `-Mode Verify`，再核对：Codex 登录、聊天历史、Skill、项目与 CLI；WorkBuddy 登录、历史、hy4free 与本机接入。WorkBuddy若从D盘入口启动，核对并将本机 `.local/workbuddy*/config.json` 中 executable 更新到D盘真实程序路径，再检查端口拥有进程和模型，不重发原任务。再清理已核验的 C 盘 parked 原目录，D 盘回滚副本仍保留。不能把路径检查当作真实启动验收。

手工回滚：先正常退出全部相关应用；核对 state.json 的 source/target/rollback/parked。若 C 盘 parked 原件仍在，先保留 D 盘切换后产生的新数据，再删除**仅 Junction 入口本身**并将原件恢复原名；不得对 Junction 使用递归删除。若仅剩 D 盘回滚副本，先复制到 C、逐文件核验后再切回。Store 本体只能用 Move-AppxPackage 迁回原 AppxVolume。不要直接运行未经核对的自动恢复命令。

`-RestartApps` 是可选项：在目录及 Store 迁移通过后请求正常桌面 Shell 打开应用，不以管理员运行编码代理；自动回到原聊天尚未验证。脚本不派发游戏任务、不推送部署。

官方依据：[Appx 卷路径要求](https://learn.microsoft.com/en-us/powershell/module/appx/add-appxvolume)、[Store 迁移](https://learn.microsoft.com/en-us/powershell/module/appx/move-appxpackage)、[Codex 数据位置](https://learn.chatgpt.com/docs/config-file/environment-variables)。
