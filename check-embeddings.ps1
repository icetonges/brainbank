# Probes the agent-server for a working embeddings endpoint.
#
# Run from the repo root:   .\check-embeddings.ps1
#
# Reads LOCAL_LLM_FUNNEL_URL / LOCAL_LLM_SHARED_SECRET straight out of
# .env.local (they're read by Next.js at runtime, so they are NOT in your
# PowerShell session — which is why $LOCAL_LLM_FUNNEL_URL was empty).

$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot ".env.local"
if (-not (Test-Path $envFile)) { $envFile = Join-Path $PSScriptRoot ".env" }
if (-not (Test-Path $envFile)) { Write-Host "No .env.local or .env found" -ForegroundColor Red; exit 1 }

$vars = @{}
Get-Content $envFile | ForEach-Object {
  $line = $_.TrimStart([char]0xFEFF)          # strip a UTF-8 BOM on line 1
  if ($line -match '^\s*#') { return }        # comment
  if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    # Capture BOTH groups into locals immediately. Any later -match (like
    # the quote-stripping below) clobbers $Matches, so reading $Matches[1]
    # after that point gives you the wrong capture entirely.
    $name = $Matches[1]
    $val  = $Matches[2].Trim().TrimEnd("`r")

    if ($val.Length -ge 2) {
      if ($val.StartsWith('"') -and $val.EndsWith('"')) {
        $val = $val.Substring(1, $val.Length - 2)
      } elseif ($val.StartsWith("'") -and $val.EndsWith("'")) {
        $val = $val.Substring(1, $val.Length - 2)
      }
    }
    $vars[$name] = $val
  }
}

$base = $vars['LOCAL_LLM_FUNNEL_URL']
$key  = $vars['LOCAL_LLM_SHARED_SECRET']

if (-not $base -or -not $key) {
  Write-Host "LOCAL_LLM_FUNNEL_URL / LOCAL_LLM_SHARED_SECRET missing from $envFile" -ForegroundColor Red
  Write-Host ""
  Write-Host "Keys that DID parse out of that file (values hidden):" -ForegroundColor Yellow
  $vars.Keys | Sort-Object | ForEach-Object {
    $len = $vars[$_].Length
    Write-Host ("  {0,-34} [{1} chars]" -f $_, $len)
  }
  exit 1
}
$base = $base.TrimEnd('/')
Write-Host "agent-server: $base" -ForegroundColor Cyan
Write-Host ""

$headers = @{ Authorization = "Bearer $key" }
$model = "nomic-embed-text"

# The three shapes worth trying, in the order lib/ai/embeddings.ts tries them:
#   1. OpenAI-compatible  (what agent-server exposes for chat)
#   2. Ollama /api/embed      — newer, batch, {embeddings:[[...]]}
#   3. Ollama /api/embeddings — older, single, {embedding:[...]}
$candidates = @(
  @{ Name = "OpenAI-compatible";  Path = "/v1/embeddings";   Body = @{ model = $model; input  = @("hello") } },
  @{ Name = "Ollama /api/embed";  Path = "/api/embed";       Body = @{ model = $model; input  = @("hello") } },
  @{ Name = "Ollama /api/embeddings"; Path = "/api/embeddings"; Body = @{ model = $model; prompt = "hello" } }
)

$worked = $null

foreach ($c in $candidates) {
  $url = "$base$($c.Path)"
  Write-Host "-> POST $($c.Path)" -NoNewline
  try {
    $res = Invoke-RestMethod -Method Post -Uri $url -Headers $headers `
             -ContentType "application/json" `
             -Body ($c.Body | ConvertTo-Json -Depth 5) `
             -TimeoutSec 30

    # Pull the vector out of whichever shape came back.
    $vec = $null
    if     ($res.data      -and $res.data[0].embedding) { $vec = $res.data[0].embedding }
    elseif ($res.embeddings -and $res.embeddings[0])    { $vec = $res.embeddings[0] }
    elseif ($res.embedding)                             { $vec = $res.embedding }

    if ($vec) {
      Write-Host "  OK - $($vec.Count) dimensions" -ForegroundColor Green
      if (-not $worked) { $worked = @{ Name = $c.Name; Path = $c.Path; Dims = $vec.Count } }
    } else {
      Write-Host "  responded, but no embedding in the body" -ForegroundColor Yellow
      Write-Host ("     " + (($res | ConvertTo-Json -Depth 3) -replace "`n", " ").Substring(0, [Math]::Min(200, ($res | ConvertTo-Json -Depth 3).Length)))
    }
  } catch {
    $code = ""
    if ($_.Exception.Response) { $code = " (HTTP $([int]$_.Exception.Response.StatusCode))" }
    Write-Host "  FAILED$code - $($_.Exception.Message.Split("`n")[0])" -ForegroundColor DarkGray
  }
}

Write-Host ""
if ($worked) {
  Write-Host "Working endpoint: $($worked.Name) -> $($worked.Path), $($worked.Dims) dims" -ForegroundColor Green
  if ($worked.Dims -ne 768) {
    Write-Host "WARNING: schema.ts declares EMBEDDING_DIMENSIONS = 768 but this model returns $($worked.Dims)." -ForegroundColor Yellow
    Write-Host "         Update EMBEDDING_DIMENSIONS in src/lib/db/schema.ts and re-run db:push." -ForegroundColor Yellow
  }
} else {
  Write-Host "No embedding endpoint responded." -ForegroundColor Red
  Write-Host ""
  Write-Host "On the agent-server Mac, check the model is pulled:" -ForegroundColor Cyan
  Write-Host "    ollama list | grep nomic"
  Write-Host "    ollama pull nomic-embed-text"
  Write-Host ""
  Write-Host "Then check agent-server actually proxies an embeddings route." -ForegroundColor Cyan
  Write-Host "If it only forwards /v1/chat/completions, it needs a route added"
  Write-Host "for embeddings (or expose Ollama's /api/embed through the Funnel)."
}
