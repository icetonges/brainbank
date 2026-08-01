# Discovers what agent-server actually exposes, so we know exactly what an
# embeddings route needs to look like.
#
# Run from the repo root:   .\discover-agent-server.ps1
#
# Nothing here is destructive — every probe is a GET.

$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot ".env.local"
if (-not (Test-Path $envFile)) { $envFile = Join-Path $PSScriptRoot ".env" }

$vars = @{}
Get-Content $envFile | ForEach-Object {
  $line = $_.TrimStart([char]0xFEFF)
  if ($line -match '^\s*#') { return }
  if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    $name = $Matches[1]
    $val  = $Matches[2].Trim().TrimEnd("`r")
    if ($val.Length -ge 2) {
      if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
      elseif ($val.StartsWith("'") -and $val.EndsWith("'")) { $val = $val.Substring(1, $val.Length - 2) }
    }
    $vars[$name] = $val
  }
}

$base = $vars['LOCAL_LLM_FUNNEL_URL'].TrimEnd('/')
$key  = $vars['LOCAL_LLM_SHARED_SECRET']
$headers = @{ Authorization = "Bearer $key" }

Write-Host "agent-server: $base" -ForegroundColor Cyan
Write-Host ""

# 1. Does it publish an OpenAPI schema? FastAPI does by default, and that
#    gives us the complete route list plus the framework in one shot.
Write-Host "== Looking for an OpenAPI schema ==" -ForegroundColor Cyan
$schemaFound = $false
foreach ($p in @("/openapi.json", "/docs", "/redoc")) {
  try {
    $r = Invoke-WebRequest -Uri "$base$p" -Headers $headers -TimeoutSec 15 -UseBasicParsing
    Write-Host "  $p -> HTTP $($r.StatusCode)" -ForegroundColor Green
    if ($p -eq "/openapi.json") {
      $schemaFound = $true
      $schema = $r.Content | ConvertFrom-Json
      Write-Host ""
      Write-Host "  Framework: $($schema.info.title) $($schema.info.version)" -ForegroundColor Green
      Write-Host "  Routes:" -ForegroundColor Green
      $schema.paths.PSObject.Properties | ForEach-Object {
        $methods = ($_.Value.PSObject.Properties.Name | ForEach-Object { $_.ToUpper() }) -join ","
        Write-Host ("    {0,-8} {1}" -f $methods, $_.Name)
      }
    }
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "err" }
    Write-Host "  $p -> $code" -ForegroundColor DarkGray
  }
}

Write-Host ""
Write-Host "== Probing known/likely routes ==" -ForegroundColor Cyan
$probes = @("/health", "/v1/models", "/models", "/api/tags", "/api/version", "/v1", "/")
foreach ($p in $probes) {
  try {
    $r = Invoke-WebRequest -Uri "$base$p" -Headers $headers -TimeoutSec 15 -UseBasicParsing
    $body = $r.Content
    if ($body.Length -gt 220) { $body = $body.Substring(0, 220) + "…" }
    Write-Host "  $p -> HTTP $($r.StatusCode)" -ForegroundColor Green
    Write-Host "     $($body -replace "`r?`n", ' ')" -ForegroundColor DarkGray
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "err" }
    Write-Host "  $p -> $code" -ForegroundColor DarkGray
  }
}

Write-Host ""
if (-not $schemaFound) {
  Write-Host "No /openapi.json. If agent-server is FastAPI it may have docs disabled;" -ForegroundColor Yellow
  Write-Host "if it's Flask/aiohttp/a hand-rolled http.server there won't be one." -ForegroundColor Yellow
  Write-Host "Either way, /api/tags responding above means Ollama itself is proxied." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Paste this whole output back and I'll write the exact route patch." -ForegroundColor Cyan
