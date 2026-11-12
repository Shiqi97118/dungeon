$ErrorActionPreference = 'Stop'
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'migrate-ai-tools.ps1'), [ref]$null, [ref]$null)
foreach ($definition in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in @('FullPath','PackageRootOnD') }, $false)) {
  Invoke-Expression $definition.Extent.Text
}
$name = 'OpenAI.Codex_test'
if (-not (PackageRootOnD $name "D:\WindowsApps\$name" '' @())) { throw 'Direct D location rejected.' }
if (-not (PackageRootOnD $name "C:\Program Files\WindowsApps\$name" 'Junction' @("D:\WindowsApps\$name"))) { throw 'Official compatibility junction rejected.' }
if (PackageRootOnD $name "C:\Program Files\WindowsApps\$name" '' @()) { throw 'Unmoved C location accepted.' }
if (PackageRootOnD $name "C:\Program Files\WindowsApps\$name" 'Junction' @('D:\Elsewhere')) { throw 'Unrelated target accepted.' }
Write-Output '4 package-location regression checks passed.'
