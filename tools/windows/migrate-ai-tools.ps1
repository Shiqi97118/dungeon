param(
  [ValidateSet('Plan', 'Execute', 'Verify')][string]$Mode = 'Plan',
  [ValidateRange(1, 720)][int]$WaitForExitMinutes = 60,
  [string]$ExpectedUserSid,
  [switch]$RestartApps
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$base = 'D:\AI Tools'
$userRoot = [Environment]::GetFolderPath('UserProfile')
$localRoot = [Environment]::GetFolderPath('LocalApplicationData')
$roamingRoot = [Environment]::GetFolderPath('ApplicationData')
$mappings = @(
  @{ Source = Join-Path $userRoot '.codex'; Target = "$base\Codex\State" },
  @{ Source = Join-Path $userRoot '.cache\codex-runtimes'; Target = "$base\Codex\Runtimes" },
  @{ Source = Join-Path $localRoot 'OpenAI\Codex'; Target = "$base\Codex\LocalApp" },
  @{ Source = Join-Path $roamingRoot 'Codex'; Target = "$base\Codex\UserData" },
  @{ Source = Join-Path $userRoot '.workbuddy'; Target = "$base\WorkBuddy\Data" },
  @{ Source = Join-Path $env:ProgramFiles 'WorkBuddy'; Target = "$base\WorkBuddy\App" }
)
function FullPath([string]$Path) { [IO.Path]::GetFullPath($Path).TrimEnd('\') }
function IsWithin([string]$Path, [string]$Root) {
  $p = FullPath $Path; $r = FullPath $Root
  $p.Equals($r, [StringComparison]::OrdinalIgnoreCase) -or $p.StartsWith($r + '\', [StringComparison]::OrdinalIgnoreCase)
}
function AssertMapping($Mapping) {
  if (-not ((FullPath $Mapping.Source).StartsWith('C:\', [StringComparison]::OrdinalIgnoreCase))) { throw 'Unexpected source drive.' }
  if (-not (IsWithin $Mapping.Target $base) -or (FullPath $Mapping.Target) -eq $base) { throw 'Unsafe target.' }
  $parent = Split-Path $Mapping.Target -Parent
  while ($parent) {
    if ((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Destination parent is a reparse point; inspect before migration.' }
    $parent = Split-Path $parent -Parent
  }
}
function AppProcesses {
  @(Get-Process -ErrorAction Stop | Where-Object {
    $_.ProcessName -eq 'ChatGPT' -or $_.ProcessName -eq 'WorkBuddy' -or
    ($_.ProcessName -like 'codex*' -and $_.ProcessName -ne 'codex-windows-sandbox-service')
  })
}
function WriteState([string]$Stage, [string]$Detail = '') {
  @{ stage = $Stage; time = (Get-Date).ToString('o'); helperPid = $PID; detail = $Detail; completed = @($script:completed) } |
    ConvertTo-Json -Depth 6 | Set-Content -LiteralPath "$script:runRoot\state.json" -Encoding UTF8
}
function PackageRootOnD([string]$PackageName, [string]$Location, [string]$LinkType, $Targets) {
  $expected = FullPath (Join-Path 'D:\WindowsApps' $PackageName)
  if ((FullPath $Location) -eq $expected) { return $true }
  return $LinkType -eq 'Junction' -and @($Targets).Count -eq 1 -and (FullPath ([string]@($Targets)[0])) -eq $expected
}
function PackageOnD($Package) {
  $root = Get-Item -LiteralPath $Package.InstallLocation -Force
  $physical = PackageRootOnD $Package.PackageFullName $Package.InstallLocation $root.LinkType @($root.Target)
  $volume = Get-AppxVolume | Where-Object { $_.PackageStorePath -eq 'D:\WindowsApps' }
  $registered = $volume -and @((Get-AppxPackage -Volume $volume -Name OpenAI.Codex) | Where-Object PackageFullName -eq $Package.PackageFullName).Count -gt 0
  return $physical -and $registered
}
function Inventory([string]$Root) {
  $items = @(Get-ChildItem -LiteralPath $Root -Recurse -Force -ErrorAction Stop)
  $files = @{}; $links = @{}; $directories = @{}
  foreach ($item in $items) {
    $relative = $item.FullName.Substring((FullPath $Root).Length + 1)
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
      if ($item.LinkType -ne 'Junction' -or @($item.Target).Count -ne 1) { throw "Unsupported link: $relative" }
      $linkTarget = FullPath ([string]@($item.Target)[0])
      if (-not @($mappings | Where-Object { IsWithin $linkTarget $_.Source }).Count) { throw "Link leaves approved source roots: $relative" }
      $links[$relative] = $linkTarget
    } elseif ($item.PSIsContainer) { $directories[$relative] = $true }
    else { $files[$relative] = "$($item.Length):$((Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash)" }
  }
  @{ Files = $files; Links = $links; Directories = $directories }
}
function AssertSame($Expected, $Actual) {
  foreach ($category in @('Files', 'Links', 'Directories')) {
    if ($Expected[$category].Count -ne $Actual[$category].Count) { throw "Inventory count differs: $category" }
    foreach ($key in $Expected[$category].Keys) {
      if (-not $Actual[$category].ContainsKey($key) -or $Expected[$category][$key] -ne $Actual[$category][$key]) { throw "Inventory mismatch: $category/$key" }
    }
  }
}
function CopyVerified([string]$Source, [string]$Target, $Expected) {
  if (Test-Path -LiteralPath $Target) { throw "Destination already exists; inspect before retry: $Target" }
  New-Item -ItemType Directory -Path $Target | Out-Null
  # Preserve source DACL, timestamps and contents. Never mirror/delete. Recreate reviewed junctions separately.
  & robocopy.exe $Source $Target /E /COPY:DATS /DCOPY:DAT /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Robocopy failed with code $LASTEXITCODE" }
  Set-Acl -LiteralPath $Target -AclObject (Get-Acl -LiteralPath $Source)
  foreach ($key in $Expected.Links.Keys) {
    New-Item -ItemType Junction -Path (Join-Path $Target $key) -Target $Expected.Links[$key] | Out-Null
  }
  AssertSame $Expected (Inventory $Target)
  # Detect writes during copying before switching the source path.
  AssertSame $Expected (Inventory $Source)
}
foreach ($mapping in $mappings) { AssertMapping $mapping }
if ((Get-Volume -DriveLetter D).FileSystem -ne 'NTFS') { throw 'D: must be NTFS.' }
$package = Get-AppxPackage -Name OpenAI.Codex
if (-not $package) { throw 'Codex Store package not found for this user.' }
if ($Mode -eq 'Plan') {
  [pscustomobject]@{ Mode = 'ReadOnly'; Package = $package.PackageFullName; PackageLocation = $package.InstallLocation; StoreOnD = (PackageOnD $package);
    Mappings = $mappings; RunningApps = @(AppProcesses | Select-Object ProcessName, Id);
    DFreeBytes = (Get-Volume -DriveLetter D).SizeRemaining } | ConvertTo-Json -Depth 5
  exit 0
}
if ($Mode -eq 'Verify') {
  $results = foreach ($mapping in $mappings) {
    $source = Get-Item -LiteralPath $mapping.Source -Force
    [pscustomobject]@{ Source = $mapping.Source; Target = $mapping.Target;
      Linked = ($source.LinkType -eq 'Junction' -and (FullPath ([string]@($source.Target)[0])) -eq (FullPath $mapping.Target));
      DestinationExists = Test-Path -LiteralPath $mapping.Target -PathType Container }
  }
  $results | ConvertTo-Json
  if (@($results | Where-Object { -not $_.Linked -or -not $_.DestinationExists }).Count -or -not (PackageOnD $package)) { exit 1 }
  exit 0
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $ExpectedUserSid -or $identity.User.Value -ne $ExpectedUserSid) { throw 'Run as the same Windows user that prepared this migration; an explicit matching ExpectedUserSid is required.' }
if (-not ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Execute requires an elevated PowerShell under the same Windows user.' }
if ((Get-Volume -DriveLetter D).SizeRemaining -lt 15GB) { throw 'Need at least 15 GiB free on D: for verified destinations and rollback copies.' }
foreach ($mapping in $mappings) {
  $source = Get-Item -LiteralPath $mapping.Source -Force
  if ($source.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Source already linked; inspect previous migration instead of replaying.' }
  if (Test-Path -LiteralPath $mapping.Target) { throw 'A destination already exists; inspect state before retrying.' }
}
$script:completed = [Collections.Generic.List[object]]::new()
$script:runRoot = Join-Path $base ('Shared\Migration\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $runRoot | Out-Null
# Local rollback copies can contain auth/state. Restrict this run directory to the current user, SYSTEM and administrators.
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($identity.User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))) {
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
}
Set-Acl -LiteralPath $runRoot -AclObject $acl
$service = $null
$serviceWasRunning = $false
try {
  WriteState 'waiting_for_normal_exit'
  $deadline = (Get-Date).AddMinutes($WaitForExitMinutes)
  while (@(AppProcesses).Count) {
    if (Test-Path -LiteralPath "$runRoot\cancel") { throw 'Cancelled before cutover.' }
    if ((Get-Date) -ge $deadline) { throw 'Timed out waiting for normal application exit. No processes were killed.' }
    Start-Sleep -Seconds 3
  }
  WriteState 'quiescent'
  $service = Get-Service -Name 'CodexSandboxService.OpenAI.Codex' -ErrorAction SilentlyContinue
  if ($service -and $service.Status -eq 'Running') { $serviceWasRunning = $true; Stop-Service -InputObject $service; $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30)) }
  if (-not (PackageOnD $package)) {
    WriteState 'moving_store_package'
    $volume = Get-AppxVolume | Where-Object { $_.PackageStorePath -eq 'D:\WindowsApps' }
    if (-not $volume) { $volume = Add-AppxVolume -Path 'D:\WindowsApps' }
    Move-AppxPackage -Package $package.PackageFullName -Volume $volume
  }
  $moved = Get-AppxPackage -Name OpenAI.Codex
  if (-not (PackageOnD $moved)) { throw 'Store package physical location and registered volume do not both point to D:.' }
  foreach ($mapping in $mappings) {
    if (@(AppProcesses).Count) { throw 'Application restarted during migration; stopped before next directory.' }
    WriteState 'copying_and_hashing' $mapping.Target
    $manifest = Inventory $mapping.Source
    CopyVerified $mapping.Source $mapping.Target $manifest
    $backup = Join-Path $runRoot ($mapping.Target.Substring($base.Length + 1))
    New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null
    CopyVerified $mapping.Source $backup $manifest
    $parked = $mapping.Source + '.migration-' + (Split-Path $runRoot -Leaf)
    if (Test-Path -LiteralPath $parked) { throw 'Unexpected parked source.' }
    # Exact source, destination and parked paths have been checked; do not compose destructive shell commands.
    if (-not (IsWithin $parked (Split-Path $mapping.Source -Parent))) { throw 'Unsafe parked path.' }
    Move-Item -LiteralPath $mapping.Source -Destination $parked
    try { New-Item -ItemType Junction -Path $mapping.Source -Target $mapping.Target | Out-Null }
    catch { Move-Item -LiteralPath $parked -Destination $mapping.Source; throw }
    $script:completed.Add(@{ source = $mapping.Source; target = $mapping.Target; rollback = $backup; parked = $parked; files = $manifest.Files.Count })
    WriteState 'directory_linked' $mapping.Target
    # Keep the C: original until the next session verifies real login/startup. Cleanup is a separate explicit action.
  }
  if ($serviceWasRunning) { Start-Service -Name $service.Name }
  $shell = New-Object -ComObject WScript.Shell
  $codexShortcut = $shell.CreateShortcut("$base\Codex\Codex.lnk")
  $codexShortcut.TargetPath = "$env:WINDIR\explorer.exe"
  $codexShortcut.Arguments = "shell:AppsFolder\$($moved.PackageFamilyName)!App"
  $codexShortcut.Save()
  $workbuddyShortcut = $shell.CreateShortcut("$base\WorkBuddy\WorkBuddy.lnk")
  $workbuddyShortcut.TargetPath = "$base\WorkBuddy\App\WorkBuddy.exe"
  $workbuddyShortcut.Save()
  WriteState 'migrated_pending_real_startup_verification' 'C: parked originals retained. Run Verify, inspect login/history and WorkBuddy connectivity before cleanup.'
  if ($RestartApps) {
    # Relaunch through the unelevated desktop shell; never run coding agents with the helper administrator token.
    $desktopShell = New-Object -ComObject Shell.Application
    $desktopShell.ShellExecute("$base\Codex\Codex.lnk", '', '', 'open', 1)
    $desktopShell.ShellExecute("$base\WorkBuddy\WorkBuddy.lnk", '', '', 'open', 1)
  }
} catch {
  WriteState 'needs_attention' $_.Exception.Message
  throw
} finally {
  if ($serviceWasRunning -and (Get-Service -Name $service.Name).Status -eq 'Stopped') { Start-Service -Name $service.Name }
}
