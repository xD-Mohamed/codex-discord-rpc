param([Parameter(Mandatory=$true)][string]$Package)
$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) ('rpc-distribution-' + [guid]::NewGuid())
$previous = @{}
foreach ($key in @('APPDATA', 'LOCALAPPDATA', 'CODEX_HOME', 'npm_config_cache')) {
  $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
New-Item -ItemType Directory -Path $root | Out-Null
$env:APPDATA = Join-Path $root 'Roaming'
$env:LOCALAPPDATA = Join-Path $root 'Local'
$env:CODEX_HOME = Join-Path $root 'codex'
$env:npm_config_cache = Join-Path $root 'npm-cache'
$installed = Join-Path $env:LOCALAPPDATA 'CodexDiscordRPC\src\cli.js'
Push-Location $root
try {
  # Use the public npx entry point, including download, extraction and bin linking.
  & npx.cmd --yes $Package install --hide-project
  if ($LASTEXITCODE -ne 0) { throw 'Fresh GitHub installation failed' }
  if (!(Test-Path -LiteralPath $installed)) { throw 'Installed CLI is missing' }
  $cached = @(Get-ChildItem (Join-Path $env:npm_config_cache '_npx') -Filter cli.js -Recurse |
    Where-Object { $_.FullName -match 'node_modules[\\/]codex-discord-rpc[\\/]src[\\/]cli.js$' })
  if ($cached.Count -ne 1) { throw 'Expected one complete npx package' }
  # Repeat using the same cache, as a user updating an existing installation does.
  & npx.cmd --yes $Package install
  if ($LASTEXITCODE -ne 0) { throw 'Repeated GitHub installation failed' }
  $record = Get-Content (Join-Path $env:LOCALAPPDATA 'CodexDiscordRPC\install-record.json') -Raw | ConvertFrom-Json
  if ($record.args -notcontains '--hide-project') { throw 'Update lost saved options' }
  & npx.cmd --yes $Package stop
  if ($LASTEXITCODE -ne 0) { throw 'Stop from npx failed' }
  & npx.cmd --yes $Package start
  if ($LASTEXITCODE -ne 0) { throw 'Start from npx failed' }
  & npx.cmd --yes $Package uninstall
  if ($LASTEXITCODE -ne 0) { throw 'Uninstall from npx failed' }
  if (Test-Path -LiteralPath $installed) { throw 'Uninstall left the runtime behind' }
  Write-Output 'GitHub download, extraction, bin linking, install, repeat update, stop/start and uninstall passed.'
} finally {
  if (Test-Path -LiteralPath $installed) { & node $installed uninstall }
  Pop-Location
  foreach ($key in $previous.Keys) {
    [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
  }
  Remove-Item -LiteralPath $root -Recurse -Force
}
