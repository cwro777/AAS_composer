---
description: 개발 스택을 살리고 실제로 응답하는지 확인한다 (postgres · web · api)
---

개발 스택을 순서대로 살려줘. **떴다고 말하기 전에 실제 응답을 받아 확인할 것.**

이 PC의 전제:
- PostgreSQL은 **5433**이다. 5432는 다른 스택(TimescaleDB)이 쓰고 있다.
- Docker는 **WSL 안에서** 돈다.
- 저장소가 **Dropbox 폴더** 안에 있다. 이게 `.next` 문제의 원인이다.

## 1. 지금 무엇이 떠 있는지 먼저 본다

3000(web) · 8787(api) · 5433(postgres)를 확인한다. 이미 다 떠 있으면 4번으로 건너뛴다.

```
netstat -ano | grep -i listening | grep -E ":(3000|8787|5433)\b"
```

## 2. PostgreSQL

`restart: unless-stopped`가 붙어 있어 보통은 살아 있다. `Exited`면 WSL이 재시작된 것이다.

```
wsl -e bash -lc "cd /mnt/c/Users/cwro7/Dropbox/work262/aas/aas-composer && docker compose up -d postgres"
```

`docker ps`로 `healthy`를 확인하고 넘어간다. `pgdata`가 named volume이라
컨테이너를 다시 만들어도 데이터는 남는다.

## 3. web · api — **따로, 세션 밖에서 띄운다**

두 가지를 지킨다. 둘 다 실제로 겪은 사고다.

- **`pnpm dev`(turbo)를 쓰지 마라.** API가 시작 로그도 없이 멈춰 있던 적이 있다.
  같은 명령을 `--filter`로 따로 돌리면 즉시 뜬다. 두 개를 따로 띄운다.
- **백그라운드 작업으로 띄우지 마라.** 세션에 묶인 프로세스는 세션이 내려갈 때
  함께 죽는다. 이 세션에서 세 번 반복됐다. `Start-Process`로 독립 프로세스로 띄운다.

```powershell
$repo = 'C:\Users\cwro7\Dropbox\work262\aas\aas-composer'
$log  = "$env:TEMP\aas-dev"; New-Item -ItemType Directory -Force $log | Out-Null
Start-Process cmd.exe "/c pnpm --filter @aas/web dev > `"$log\web.log`" 2>&1" -WorkingDirectory $repo -WindowStyle Hidden
Start-Process cmd.exe "/c pnpm --filter @aas/api dev > `"$log\api.log`" 2>&1" -WorkingDirectory $repo -WindowStyle Hidden
```

## 4. 확인 — 포트가 열린 것으로 끝내지 않는다

```
curl -s -o /dev/null -w "editor HTTP %{http_code}\n" http://localhost:3000/editor
curl -s http://localhost:8787/dictionary/status
```

기대값:
- `editor HTTP 200`
- `{"cached":<0보다 큰 수>,"upstream":null}`

API 시작 로그가 **`저장소: PostgreSQL`** 인지 본다. `저장소: 메모리`면 DB에 못 붙은 것이고,
그대로 두면 껐다 켤 때 모델이 사라진다.

## 5. 증상별 진단

| 증상 | 원인 | 조치 |
|---|---|---|
| 3000 연결 거부, `web.log`에 `readlink EINVAL … .next\build-manifest.json` | 강제 종료로 남은 `.next`를 Dropbox 폴더에서 심볼릭 링크로 오인한다 | `rm -rf apps/web/.next` 후 3번 재실행 |
| `EADDRINUSE :::3000` | 이전 프로세스가 포트를 잡고 있다 | 그 포트의 PID를 찾아 죽이고 다시 띄운다 |
| 8787 닫힘, 로그가 `tsx watch`에서 멈춤 | turbo가 출력을 물고 있다 | `pnpm dev` 대신 `--filter`로 따로 띄운다 |
| API가 `저장소: 메모리`로 뜸 | `.env`의 `DATABASE_URL`을 못 읽었거나 postgres가 안 떠 있다 | 2번을 먼저 확인한다 |
| 컨테이너 `Exited (255)` | WSL·Docker 재시작 | 2번. 정책이 붙은 뒤로는 대개 스스로 돌아온다 |
| `/dictionary/status`가 `cached: 0` | 캐시가 비었다 | `docs/idta/*.json`으로 `scripts/dict-seed.ts`를 다시 돌린다 |

BaSyx(8081)·Mosquitto(1883)는 **필요할 때만** 띄운다. 기본 기동에 넣지 마라.

```
wsl -e bash -lc "cd /mnt/c/Users/cwro7/Dropbox/work262/aas/aas-composer && docker compose up -d basyx mosquitto"
```

## 보고

무엇이 이미 떠 있었고 무엇을 새로 띄웠는지, 그리고 4번의 **실제 응답**을 그대로 보여준다.
하나라도 응답을 못 받았으면 **"떴다"고 말하지 말고** 5번의 어느 항목인지 짚어 보고한다.
