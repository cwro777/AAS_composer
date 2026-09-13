<#
.SYNOPSIS
  개발 스택을 한 번에 올린다 — WSL · 컨테이너 · web · api.

.NOTES
  **이 파일은 UTF-8 BOM으로 저장한다.** Windows PowerShell 5.1은 BOM이 없는 .ps1을
  ANSI(이 PC에서는 CP949)로 읽어서 한글이 전부 깨진다. 편집기가 BOM을 떼면 재발한다.
  확인: 첫 3바이트가 EF BB BF 인지 본다.

.DESCRIPTION
  이 PC의 전제는 세 가지다. 하나라도 다르면 이 스크립트를 고쳐야 한다.

    - Docker Desktop이 없다. Docker 엔진은 WSL 배포판 안에서 돈다.
      그 배포판은 systemd=true이고 docker.service가 enabled라, 배포판이 부팅되면
      Docker가 따라 뜨고 restart 정책이 붙은 컨테이너가 스스로 돌아온다.
      **그러나 WSL은 스스로 부팅하지 않는다.** 그래서 한 번 깨워 주는 것이 1단계다.
    - PostgreSQL은 5433이다. 5432는 다른 스택이 쓰고 있다.
    - 저장소가 Dropbox 폴더 안에 있다. 강제 종료로 남은 .next를 Next.js가
      심볼릭 링크로 오인해 readlink EINVAL로 죽는다. 그 경우를 감지해 스스로 고친다.

  이미 떠 있는 것은 건드리지 않는다. 두 번 실행해도 안전하다.

.PARAMETER Full
  BaSyx(8081)와 Mosquitto(1883)까지 올린다. 없으면 postgres만.

.PARAMETER Clean
  시작 전에 apps/web/.next를 지운다. 증상이 없어도 강제로 지우고 싶을 때.

.PARAMETER Restart
  이미 떠 있는 web·api를 죽이고 다시 띄운다.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1
  powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Full
#>
[CmdletBinding()]
param(
  [switch]$Full,
  [switch]$Clean,
  [switch]$Restart,
  [int]$TimeoutSec = 180
)

$ErrorActionPreference = 'Continue'

$repo    = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logDir  = Join-Path $env:TEMP 'aas-dev'
$nextDir = Join-Path $repo 'apps\web\.next'
New-Item -ItemType Directory -Force $logDir | Out-Null

function Write-Step($m) { Write-Host ''; Write-Host "▸ $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "  OK   $m" -ForegroundColor Green }
function Write-Skip($m) { Write-Host "  --   $m" -ForegroundColor DarkGray }
function Write-Warn2($m){ Write-Host "  !    $m" -ForegroundColor Yellow }
function Write-Bad($m)  { Write-Host "  FAIL $m" -ForegroundColor Red }

# C:\a\b -> /mnt/c/a/b
function ConvertTo-WslPath([string]$p) {
  $x = $p -replace '\\', '/'
  if ($x -match '^([A-Za-z]):(.*)$') { return "/mnt/$($Matches[1].ToLower())$($Matches[2])" }
  return $x
}
$wslRepo = ConvertTo-WslPath $repo

function Test-Port([int]$Port) {
  $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$c
}

# 트리째 죽인다. `tsx watch`와 `next dev`는 **감시자 + 실제 서버** 두 프로세스이고
# 포트를 잡고 있는 것은 자식뿐이다. 포트 소유자만 죽이면 감시자가 살아남아
# 다음에 띄우는 서버와 싸운다 — 새 서버가 시작 로그만 찍고 조용히 죽는다.
function Stop-Tree([int]$Id) {
  & taskkill.exe /PID $Id /T /F > $null 2> $null
}

function Stop-Port([int]$Port) {
  $ids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
         Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($id in $ids) { Stop-Tree $id }
  if ($ids) { Start-Sleep -Seconds 2 }
}

# 포트는 닫혔는데 감시자만 남아 있는 경우를 치운다. 이것이 위 주석의 그 사고다.
function Stop-Stale([string]$Pattern) {
  $found = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='cmd.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($repo) -and $_.CommandLine -match $Pattern })
  foreach ($p in $found) { Stop-Tree $p.ProcessId }
  if ($found.Count -gt 0) {
    Write-Warn2 "남아 있던 $Pattern 프로세스 $($found.Count)개를 정리했습니다."
    Start-Sleep -Seconds 2
  }
}

# 200이면 $true. 연결 자체가 안 되면 $false — 예외를 밖으로 내지 않는다.
function Test-Url([string]$Url) {
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 15
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

# 세션·터미널에 묶이지 않는 프로세스로 띄운다. 창을 닫아도 살아 있고,
# 로그아웃·종료 때만 함께 내려간다.
function Start-Detached([string]$Filter, [string]$LogName) {
  $log = Join-Path $logDir $LogName
  Remove-Item $log -ErrorAction SilentlyContinue
  Start-Process cmd.exe "/c pnpm --filter $Filter dev > `"$log`" 2>&1" `
    -WorkingDirectory $repo -WindowStyle Hidden
  Write-Host "  ..   $Filter 기동 중 ($log)" -ForegroundColor DarkYellow
}

# .next 는 Dropbox 밖에 있다 — apps/web/scripts/dropbox-ignore.mjs 가 pnpm dev 앞에서
# LOCALAPPDATA\aas-composer\web-next 로 가는 junction 을 만든다(이유는 그 파일에).
# 여기서는 비우기만 한다. junction 자체를 Remove-Item -Recurse 하면 PowerShell 5.1이
# 대상 안까지 헤집는 경우가 있어, 대상 폴더의 내용을 직접 지운다.
$nextTarget = Join-Path $env:LOCALAPPDATA 'aas-composer\web-next'

function Clear-NextOutput {
  if (Test-Path $nextTarget) {
    Get-ChildItem $nextTarget -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ((Test-Path $nextDir) -and ((Get-Item $nextDir -Force).LinkType -ne 'Junction')) {
    Remove-Item -Recurse -Force $nextDir -ErrorAction SilentlyContinue
  }
}

# ── 1. WSL ─────────────────────────────────────────────────────────
Write-Step 'WSL · Docker'

if (Test-Port 5433) {
  Write-Skip 'PostgreSQL 5433 이미 떠 있음'
} else {
  wsl -d Ubuntu -e true | Out-Null
  $deadline = (Get-Date).AddSeconds(90)
  $ver = ''
  while ((Get-Date) -lt $deadline) {
    $ver = (wsl -e bash -lc 'docker info --format "{{.ServerVersion}}" 2>/dev/null' | Select-Object -First 1)
    if ($ver) { break }
    Start-Sleep -Seconds 3
  }
  if (-not $ver) {
    Write-Bad 'Docker 데몬이 뜨지 않았습니다. `wsl -e bash -lc "sudo service docker start"` 를 확인하십시오.'
    exit 1
  }
  Write-Ok "Docker $ver"
}

# ── 2. 컨테이너 ────────────────────────────────────────────────────
Write-Step '컨테이너'

if ($Full) { $svc = '' } else { $svc = 'postgres' }
wsl -e bash -lc "cd '$wslRepo' && docker compose up -d $svc" | Out-Null

$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  if (Test-Port 5433) { break }
  Start-Sleep -Seconds 2
}
if (Test-Port 5433) { Write-Ok 'PostgreSQL 5433' } else { Write-Bad 'PostgreSQL 5433 응답 없음' }

wsl -e bash -lc "docker ps --filter name=aas-composer --format '  {{.Names}}  {{.Status}}'"

# ── 3. web · api ───────────────────────────────────────────────────
Write-Step 'web · api'

if ($Restart) {
  Stop-Port 3000
  Stop-Port 8787
  Write-Warn2 '기존 web·api를 종료했습니다.'
}

if ($Clean) {
  Clear-NextOutput
  Write-Warn2 '.next 를 지웠습니다.'
}

if (Test-Port 8787) {
  Write-Skip 'api 8787 이미 떠 있음'
} else {
  Stop-Stale 'tsx'
  Start-Detached '@aas/api' 'api.log'
}

if (Test-Port 3000) {
  Write-Skip 'web 3000 이미 떠 있음'
} else {
  Stop-Stale 'next'
  Start-Detached '@aas/web' 'web.log'
}

# ── 4. 응답 확인 ───────────────────────────────────────────────────
# 포트가 열린 것으로 끝내지 않는다. 열려 있는데 답하지 않는 상태를 여러 번 봤다.
Write-Step '응답 확인'

$editorUrl = 'http://localhost:3000/editor'
$dictUrl   = 'http://localhost:8787/dictionary/status'

function Wait-Url([string]$Url, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Url $Url) { return $true }
    Start-Sleep -Seconds 3
  }
  return $false
}

$apiOk = Wait-Url $dictUrl $TimeoutSec
if ($apiOk) {
  $status = (Invoke-WebRequest -Uri $dictUrl -UseBasicParsing -TimeoutSec 15).Content
  Write-Ok "api      $status"
  if ($status -match '"cached":0\b') {
    Write-Warn2 '사전 캐시가 비었습니다. scripts/dict-seed.ts 를 docs/idta/*.json 으로 다시 돌리십시오.'
  }
} else {
  Write-Bad "api      응답 없음 — $logDir\api.log 를 보십시오."
}

$webOk = Wait-Url $editorUrl $TimeoutSec

# .next 가 깨진 경우는 스스로 고친다 — 이 저장소가 Dropbox 안에 있어 반복되는 사고다.
if (-not $webOk) {
  $webLog = Join-Path $logDir 'web.log'
  $einval = $false
  if (Test-Path $webLog) {
    $einval = [bool](Select-String -Path $webLog -Pattern 'EINVAL.*readlink|errno: -4094' -Quiet -ErrorAction SilentlyContinue)
  }
  if ($einval) {
    Write-Warn2 '.next 가 깨졌습니다(readlink EINVAL). 지우고 한 번 더 띄웁니다.'
    Stop-Port 3000
    Clear-NextOutput
    Start-Detached '@aas/web' 'web.log'
    $webOk = Wait-Url $editorUrl $TimeoutSec
  }
}

if ($webOk) {
  Write-Ok "web      $editorUrl"
} else {
  Write-Bad "web      응답 없음 — $logDir\web.log 를 보십시오."
}

if ($Full) {
  if (Wait-Url 'http://localhost:8081/shells' 90) {
    Write-Ok 'basyx    http://localhost:8081/shells'
  } else {
    Write-Warn2 'basyx    아직 응답 없음. 기동에 30초 이상 걸립니다.'
  }
  if (Test-Port 1883) { Write-Ok 'mqtt     1883' } else { Write-Warn2 'mqtt     1883 닫힘' }
}

Write-Host ''
if ($webOk -and $apiOk) {
  Write-Host "준비됐습니다 → $editorUrl" -ForegroundColor Green
  exit 0
} else {
  Write-Host "일부가 뜨지 않았습니다. 로그: $logDir" -ForegroundColor Red
  exit 1
}
