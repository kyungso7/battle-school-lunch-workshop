[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$apiDirectory = Join-Path $root "src\api"
$webDirectory = Join-Path $root "src\web"
$envFile = Join-Path $root ".env"

function Import-DotEnv {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return
  }

  foreach ($line in Get-Content $Path) {
    if ($line -match "^\s*(?:#|$)") {
      continue
    }
    if ($line -notmatch "^\s*([^#=\s]+)\s*=(.*)\s*$") {
      throw "Invalid .env entry: $line"
    }

    $name = $matches[1]
    $value = $matches[2].Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Assert-Command {
  param([string]$Name, [string]$InstallHint)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "'$Name' was not found. $InstallHint"
  }
}

Import-DotEnv $envFile

if (-not (Get-Command "npm" -ErrorAction SilentlyContinue) -and $env:ProgramFiles) {
  $nodeDirectory = Join-Path $env:ProgramFiles "nodejs"
  if (Test-Path (Join-Path $nodeDirectory "npm.cmd")) {
    $env:Path = "$nodeDirectory;$env:Path"
  }
}

Assert-Command "uv" "Install uv from https://docs.astral.sh/uv/."
Assert-Command "npm" "Install Node.js 24 or newer from https://nodejs.org/."

$apiKey = [Environment]::GetEnvironmentVariable("NEIS_API_KEY", "Process")
if (-not $apiKey -or $apiKey -eq "replace-with-your-neis-api-key") {
  throw "Set NEIS_API_KEY in the root .env file or in the current environment."
}

Write-Host "Preparing API dependencies..."
Push-Location $apiDirectory
try {
  & uv sync --all-groups --frozen --quiet
  if ($LASTEXITCODE -ne 0) {
    throw "API dependency installation failed."
  }
} finally {
  Pop-Location
}

if (-not (Test-Path (Join-Path $webDirectory "node_modules"))) {
  Write-Host "Preparing web dependencies..."
  Push-Location $webDirectory
  try {
    & npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
      throw "Web dependency installation failed."
    }
  } finally {
    Pop-Location
  }
}

$apiProcess = $null
$webProcess = $null

try {
  $nodeCommand = (Get-Command "node").Source
  $viteScript = Join-Path $webDirectory "node_modules\vite\bin\vite.js"
  $pythonCommand = @(
    (Join-Path $apiDirectory ".venv\Scripts\python.exe"),
    (Join-Path $apiDirectory ".venv/bin/python")
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $pythonCommand) {
    throw "The API virtual environment was not created."
  }

  $apiProcess = Start-Process `
    -FilePath $pythonCommand `
    -ArgumentList @("-m", "uvicorn", "app.main:app", "--reload", "--reload-dir", "app", "--host", "127.0.0.1", "--port", "8000") `
    -WorkingDirectory $apiDirectory `
    -NoNewWindow `
    -PassThru
  $webProcess = Start-Process `
    -FilePath $nodeCommand `
    -ArgumentList @($viteScript, "--host", "127.0.0.1") `
    -WorkingDirectory $webDirectory `
    -NoNewWindow `
    -PassThru

  Write-Host ""
  Write-Host "School Lunch app is starting:"
  Write-Host "  Web: http://localhost:5173"
  Write-Host "  API: http://localhost:8000/api/health"
  Write-Host "Press Ctrl+C to stop both servers."

  while (-not $apiProcess.HasExited -and -not $webProcess.HasExited) {
    Start-Sleep -Milliseconds 250
  }

  $stoppedProcess = if ($apiProcess.HasExited) { "API" } else { "Web" }
  throw "$stoppedProcess development server stopped unexpectedly."
} finally {
  foreach ($process in @($apiProcess, $webProcess)) {
    if ($null -ne $process -and -not $process.HasExited) {
      $process.Kill($true)
      $process.WaitForExit()
    }
  }
}
