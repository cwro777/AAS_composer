# 실행 명령어

AAS Composer를 이 PC에서 띄우는 순서. 모든 명령은 저장소 루트
(`C:\Users\cwro7\Dropbox\work262\aas\aas-composer`)에서 실행합니다.

전체 배경은 [README.md](../README.md), 작업 규칙은 [CLAUDE.md](../CLAUDE.md)에 있습니다.

---

## 요약 — 매일 쓰는 것

```bash
wsl -e bash -lc "cd /mnt/c/Users/cwro7/Dropbox/work262/aas/aas-composer && docker compose up -d"
pnpm dev
```

http://localhost:3000/editor 로 들어갑니다.

---

## 0. 최초 1회

```bash
pnpm install
```

`.env`가 없으면 만듭니다. **없으면 API가 메모리 저장소로 뜨고 수집기도 켜지지 않습니다** —
대시보드에서 "수집기가 없습니다"만 보게 됩니다.

```bash
cp .env.example .env
```

Node는 20.11 이상, 패키지 매니저는 pnpm 10.28.0입니다(`packageManager` 필드로 고정).

## 1. 인프라 띄우기

PostgreSQL 16 · BaSyx V2 · Mosquitto를 한 번에 띄웁니다.

**Docker는 WSL 안에서만 돕니다** — Windows 셸에서 `docker`를 치면 잡히지 않습니다.

```bash
wsl -e bash -lc "cd /mnt/c/Users/cwro7/Dropbox/work262/aas/aas-composer && docker compose up -d"
```

| 서비스 | 주소 | 비고 |
| --- | --- | --- |
| PostgreSQL | `localhost:5433` | **5432가 아닙니다.** 이 PC의 5432는 다른 스택(TimescaleDB)이 씁니다 |
| BaSyx V2 | `http://localhost:8081/shells` | 태그 고정 `2.0.0-milestone-15` |
| MQTT (Mosquitto) | `localhost:1883` | 인증 없음. 값 수집 시험용 |

상태 보기 / 내리기:

```bash
wsl -e bash -lc "cd /mnt/c/Users/cwro7/Dropbox/work262/aas/aas-composer && docker compose ps"
```

```bash
wsl -e bash -lc "cd /mnt/c/Users/cwro7/Dropbox/work262/aas/aas-composer && docker compose down"
```

## 2. DB 스키마 (컨테이너를 처음 띄웠을 때 한 번)

```bash
pnpm --filter @aas/api db:migrate
```

스키마를 바꿨을 때 마이그레이션 파일 생성:

```bash
pnpm --filter @aas/api db:generate
```

## 3. Dev 서버

web(3000)과 api(8787)를 turbo가 동시에 띄웁니다.

```bash
pnpm dev
```

| 주소 | 화면 |
| --- | --- |
| http://localhost:3000/editor | 에디터 — 트리 · 캔버스 · 표 |
| http://localhost:3000/dashboard/operations | 설비 운전 모니터링 — 수집 상태 · 지연 · 시계열 |
| http://localhost:8787/health | API가 살아 있는지 |

따로 띄울 때:

```bash
pnpm --filter @aas/web dev
```

```bash
pnpm --filter @aas/api dev
```

프로덕션 빌드로 확인할 때:

```bash
pnpm build
```

```bash
pnpm --filter @aas/web start
```

## 4. 설비 없이 화면 움직여 보기

에디터는 **브라우저 안에만 저장합니다.** 운전 화면에 뜨게 하려면 먼저
파일 메뉴의 **서버에 보내기**를 눌러야 합니다.

그다음 값 발생기를 켜고, 화면에서 **수집 시작**을 누릅니다.

MQTT 값 발생기 (Ctrl+C로 멈춤):

```bash
pnpm --filter @aas/api exec tsx scripts/feed-demo.ts --period 900
```

OPC UA 시뮬레이터 — 실측 픽스처의 AID가 적어 둔 browsePath 그대로 주소공간을 만들어
`opc.tcp://<호스트>:4841`에 띄웁니다:

```bash
pnpm --filter @aas/api exec tsx scripts/opcua-sim.ts
```

Ctrl+C로 내리면 운전 화면에 "붙지 못했습니다"가 뜹니다 — **그것이 정상 동작입니다.**

## 5. 살아 있는 스택에 대고 확인

전부 실제 서버·브로커에 붙습니다. 흉내가 아닙니다.
**만든 모델은 끝나면서 스스로 지웁니다** — 화면에 남기려면 `KEEP=1`을 앞에 붙입니다.

| 명령 | 확인하는 것 |
| --- | --- |
| `pnpm --filter @aas/api exec tsx scripts/live-check.ts` | PostgreSQL 저장·재적재 · BaSyx 등록 |
| `pnpm --filter @aas/api exec tsx scripts/collect-check.ts` | MQTT 발행 → 시계열 → AAS 마지막 값 |
| `pnpm --filter @aas/api exec tsx scripts/opcua-check.ts` | 픽스처 browsePath로 OPC UA 구독 (틀린 주소까지) |
| `pnpm --filter @aas/api exec tsx scripts/dict-seed.ts` | 사전 캐시 채우기 — IDTA 템플릿과 사내 용어집에서만 |

## 6. 화면 없이 수집 API 두드리기

```bash
curl http://localhost:8787/models
curl http://localhost:8787/collect/<모델id>/plan      # AID에서 읽은 접점
curl -X POST http://localhost:8787/collect/<모델id>/start
curl http://localhost:8787/collect/status
curl http://localhost:8787/models/<모델id>/signals    # 신호별 마지막 값과 지연
curl -X POST http://localhost:8787/collect/<모델id>/stop
```

## 7. 검증 — 커밋 전

```bash
pnpm verify
```

`check:kernel` + `typecheck` + `test` + `lint`. **통과 전에는 커밋하지 않습니다.**

| 명령 | 하는 일 |
| --- | --- |
| `pnpm check:kernel` | 커널 의존성 경계 검사 (금지된 import 탐지) |
| `pnpm test --filter @aas/kernel` | 커널 왕복·속성·픽스처 테스트 |
| `pnpm golden:update` | 골든 스냅샷 갱신 — **의도한 변경일 때만**, 커밋 메시지에 이유를 적습니다 |
| `pnpm format` | prettier |

E2E는 `verify`에 들어 있지 않습니다. Playwright 설정이 dev 서버를 직접 띄우므로
`pnpm dev`를 먼저 돌릴 필요가 없습니다.

```bash
pnpm e2e
```

## 8. 막혔을 때

### dev 서버가 UNKNOWN 오류로 죽는다

```
UNKNOWN: unknown error, open ... .next\static\chunks\app\editor\page.js
```

저장소가 Dropbox 안에 있어서 납니다. **서버를 멈추고 `.next`를 지운 뒤 다시 띄웁니다** —
이것은 항상 통합니다.

```bash
Remove-Item -Recurse -Force apps\web\.next
```

(PowerShell 기준. `apps/web/scripts/dropbox-ignore.mjs`가 `dev`·`build` 앞에서 동기화
제외 표시를 걸어 빈도를 줄이지만 **없애지는 못합니다.** 배경은 README에 있습니다.)

### 포트가 이미 쓰이고 있다

```bash
netstat -ano | findstr ":3000 :8787 :5433 :8081 :1883"
```

5432가 아니라 **5433**인지 다시 확인합니다. 이 PC의 5432는 다른 스택 것입니다.

### 대시보드에 "수집기가 없습니다"만 뜬다

`.env`의 `DATABASE_URL`이 비었거나 PostgreSQL이 안 떠 있는 것입니다.
`DATABASE_URL`이 없으면 API는 메모리 저장소로 뜨고, **시작 로그가 그렇게 말합니다.**
로그를 먼저 봅니다.

### 에디터와 서버의 검증 결과가 다르다

루트 `.env`의 `IRI_PREFIX`(서버)와 `NEXT_PUBLIC_IRI_PREFIX`(웹)가 **같아야 합니다.**
두 앱 모두 루트 `.env`를 읽고, 바꾼 뒤에는 web·api를 다시 띄워야 반영됩니다.
API 시작 로그의 `사내 네임스페이스:` 줄로 서버 값을 확인합니다.
에디터에서 바꾼 값이 브라우저에 남아 있을 수도 있습니다 — 검증 탭의 `기본값`으로 되돌립니다.
