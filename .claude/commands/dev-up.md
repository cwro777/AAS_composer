---
description: 개발 스택을 한 번에 살린다 (postgres · web · api). $ARGUMENTS 로 full 지정 가능
---

`scripts/dev-up.ps1`을 실행해 개발 스택을 살려줘. 손으로 명령을 나열하지 말고 이 스크립트를 쓴다 —
기동 순서와 사고 대처가 전부 거기 들어 있고, 두 곳에 적으면 갈라진다.

```
scripts\aas
```

$ARGUMENTS 를 그대로 넘긴다 — `full`(BaSyx 8081 · Mosquitto 1883까지) ·
`clean`(.next 먼저 삭제) · `restart`(떠 있는 것도 다시). 섞어 쓸 수 있다: `scripts\aas full restart`.

`scripts\aas`는 `scripts\dev-up.ps1`을 부르는 얇은 래퍼다. 실행 정책 때문에 직접 부를 일이
생기면 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-up.ps1 [-Full] [-Clean] [-Restart]`.

스크립트가 이미 하는 일이므로 **따로 하지 마라**:
- WSL 깨우기 → systemd가 docker를 띄우고 `restart: unless-stopped`인 컨테이너가 돌아온다
- 이미 떠 있는 것 건너뛰기 (두 번 실행해도 안전하다)
- 포트가 아니라 **실제 응답** 확인 — `/editor` 200 · `/dictionary/status`
- `.next`가 깨졌으면(readlink EINVAL) 지우고 한 번 더 시도
- 포트는 닫혔는데 남아 있는 `tsx watch`·`next dev` 감시자 정리

## 스크립트가 실패로 끝났을 때만 개입한다

로그는 `%TEMP%\aas-dev\{web,api}.log`다. 종료 코드가 1이면 거기부터 본다.

| 로그에 보이는 것 | 원인 | 조치 |
|---|---|---|
| `readlink EINVAL … .next\build-manifest.json` | Dropbox 폴더 + 강제 종료로 남은 `.next`. 스크립트가 한 번은 자동으로 고친다 | 두 번째도 실패하면 `.next`를 지우고 `-Clean`으로 다시 |
| `EADDRINUSE` | 다른 프로세스가 포트 점유 | `-Restart`로 다시 |
| 시작 로그만 찍고 8787이 닫힘 | 감시자와 새 서버가 싸운다 | `-Restart` (트리째 정리한다) |
| `저장소: 메모리` | `.env`의 `DATABASE_URL`을 못 읽었거나 postgres 미기동 | postgres 상태부터 확인 |
| `Docker 데몬이 뜨지 않았습니다` | WSL 안 docker.service | `wsl -e bash -lc "sudo service docker start"` |
| `cached: 0` | 사전 캐시가 비었다 | `docs/idta/*.json`으로 `apps/api/scripts/dict-seed.ts` 재실행 |

## 보고

스크립트 출력의 **응답 확인 부분을 그대로** 보여준다.
하나라도 `FAIL`이면 **"떴다"고 말하지 말고** 위 표의 어느 항목인지 짚어 보고한다.
