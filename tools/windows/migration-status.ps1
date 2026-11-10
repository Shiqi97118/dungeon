$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
try {
  $stateFile = Get-ChildItem -LiteralPath 'D:\AI Tools\Shared\Migration' -Filter state.json -Recurse -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $stateFile) { throw '没有找到迁移状态记录。' }
  $state = Get-Content -LiteralPath $stateFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  $message = switch ($state.stage) {
    'waiting_for_normal_exit' { '正在等待 Codex 和 WorkBuddy 正常退出。请先保存其他工作，再从两个应用的菜单退出。' }
    'migrated_pending_real_startup_verification' { '迁移步骤已完成。请从 D:\AI Tools\Codex\Codex.lnk 打开 Codex，发送“继续核验迁移”。C盘原副本仍保留，核验后再清理。' }
    'needs_attention' { "迁移已停止，需要检查；请重新打开 Codex 并发送：检查迁移失败。错误：`n$($state.detail)" }
    default { '正在迁移或校验文件，请勿提前启动 Codex 或 WorkBuddy。稍后可再次打开本窗口查看。' }
  }
  [void][Windows.Forms.MessageBox]::Show($message, 'AI Tools 迁移状态')
} catch {
  [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'AI Tools 迁移状态')
}
