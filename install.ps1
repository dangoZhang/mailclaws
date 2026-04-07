param(
  [string]$Local = ""
)

$ErrorActionPreference = "Stop"
$packageSpec = if ($env:MAILCLAW_INSTALL_SOURCE) { $env:MAILCLAW_INSTALL_SOURCE } else { "mailclaws" }

if ($Local) {
  $packageSpec = $Local
} elseif ($packageSpec -eq "mailclaws") {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $localTarball = Get-ChildItem -Path (Join-Path $scriptDir "output/release/npm") -Filter "mailclaws-*.tgz" -ErrorAction SilentlyContinue |
    Sort-Object FullName |
    Select-Object -Last 1
  if ($localTarball) {
    $packageSpec = $localTarball.FullName
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "MailClaws requires Node.js 22+. Install Node first, then rerun this installer."
}

$nodeMajor = [int](node -p "Number(process.versions.node.split('.')[0])")
if ($nodeMajor -lt 22) {
  throw "MailClaws requires Node.js 22+. Current runtime: $(node -p 'process.version')"
}

$installer = if ($env:MAILCLAW_INSTALLER) { $env:MAILCLAW_INSTALLER } else { "npm" }

switch ($installer) {
  "npm" {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
      throw "npm is required for the default MailClaws installer path."
    }
    npm install -g $packageSpec
  }
  "pnpm" {
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
      throw "pnpm is required for the pnpm MailClaws installer path."
    }
    try { pnpm setup | Out-Null } catch {}
    if (Test-Path $packageSpec) {
      pnpm add -g ("file:///" + $packageSpec.Replace("\", "/"))
    } else {
      pnpm add -g $packageSpec
    }
  }
  default {
    throw "Unsupported MAILCLAW_INSTALLER: $installer"
  }
}

Write-Host ""
Write-Host "MailClaws installed."
Write-Host ""
Write-Host "Quick start:"
Write-Host "  mailclaws"
Write-Host "  mailclaws onboard you@example.com"
Write-Host "  mailclaws login"
Write-Host "  mailclaws gateway"
Write-Host "  mailclaws dashboard"
Write-Host ""
Write-Host "Workbench:"
Write-Host "  OpenClaw/Gateway first via `mailclaws gateway`"
Write-Host "  Direct Mail tab fallback: http://127.0.0.1:3000/workbench/mail"
