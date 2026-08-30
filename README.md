# AAS Composer

IEC 63278(AAS) V3.0 자산 관리 셸을 저작·검증·게시하는 웹 플랫폼.

- **작업 규칙은 [CLAUDE.md](CLAUDE.md)에 있습니다.** 코드를 건드리기 전에 먼저 읽으십시오.
- 설계 근거: [docs/plan.html](docs/plan.html) — 고도화 구현 계획 11단계
- 출발점: [docs/prototype.html](docs/prototype.html), 델타: [docs/prototype-delta.md](docs/prototype-delta.md)

## 시작하기

```bash
pnpm install
cp .env.example .env
pnpm verify
```

`.env`가 없으면 API가 **메모리 저장소**로 뜨고 수집기도 켜지지 않습니다 —
대시보드에서 "수집기가 없습니다"만 보게 됩니다.

### 스택 띄우기

```bash
docker compose up -d
```

PostgreSQL 16 · Mosquitto · BaSyx V2를 띄웁니다.
**PostgreSQL은 5432가 아니라 5433입니다** — 이 PC의 5432는 다른 스택이 쓰고 있습니다.

| 서비스 | 주소 | 확인 |
| --- | --- | --- |
| PostgreSQL | `localhost:5433` | `pnpm --filter @aas/api db:migrate` |
| MQTT (Mosquitto) | `localhost:1883` | `scripts/collect-check.ts` |
| BaSyx V2 | `http://localhost:8081/shells` | `scripts/live-check.ts` |

Docker가 WSL 안에 있으면:

```bash
wsl -e bash -lc "cd /mnt/c/Users/<사용자>/…/aas-composer && docker compose up -d"
```

### 화면 열기

```bash
pnpm dev
```

| 주소 | 화면 |
| --- | --- |
| http://localhost:3000/editor | 에디터 — 트리 · 캔버스 · 표 |
| http://localhost:3000/dashboard/operations | **설비 운전 모니터링** — 수집 상태 · 지연 · 시계열 |
| http://localhost:8787/health | API 살아 있는지 |

에디터는 브라우저 안에만 저장합니다. 운전 화면에 뜨게 하려면 파일 메뉴의
**서버에 보내기**를 눌러야 합니다.

설비가 없는 자리에서 화면을 움직여 보려면:

```bash
pnpm --filter @aas/api exec tsx scripts/feed-demo.ts --period 900
```

### Windows + Dropbox에서 dev 서버가 죽을 때

`UNKNOWN: unknown error, open ... .next\server\vendor-chunks\...` 가 뜨면
Dropbox가 `.next`를 동기화하며 파일을 잠근 것입니다. `pnpm build`가 `.next`를 새로
만들면 제외 표시가 함께 사라지므로 다시 걸어야 합니다.

```powershell
Remove-Item -Recurse -Force apps\web\.next
New-Item -ItemType Directory -Force apps\web\.next
Set-Content -Path apps\web\.next -Stream com.dropbox.ignored -Value 1
```

`node_modules`에도 같은 표시가 걸려 있습니다. 저장소를 Dropbox 밖으로 옮기면 이 문제는 사라집니다.

## 명령어

### 개발

| 명령 | 하는 일 |
| --- | --- |
| `pnpm dev` | web(3000) + api(8787) |
| `pnpm verify` | check:kernel + typecheck + test + lint — **커밋 전 필수** |
| `pnpm check:kernel` | 커널 의존성 경계 검사 |
| `pnpm test --filter @aas/kernel` | 커널 왕복·속성·픽스처 테스트 |
| `pnpm e2e` | Playwright (dev 서버는 설정이 직접 띄움) |
| `pnpm golden:update` | 골든 스냅샷 갱신 — 의도한 변경일 때만 |

### 살아 있는 스택에 대고 확인 (`pnpm --filter @aas/api exec tsx …`)

전부 실제 서버·브로커에 붙습니다. 흉내가 아닙니다.

| 스크립트 | 확인하는 것 |
| --- | --- |
| `scripts/live-check.ts` | PostgreSQL 저장·재적재 · BaSyx 등록 |
| `scripts/collect-check.ts` | MQTT 발행 → 시계열 → AAS 마지막 값 |
| `scripts/opcua-check.ts` | 실측 픽스처의 browsePath로 OPC UA 구독 (틀린 주소까지) |
| `scripts/feed-demo.ts` | 화면을 움직일 값을 계속 발행 (Ctrl+C로 멈춤) |
| `scripts/dict-seed.ts` | 사전 캐시 채우기 — IDTA 템플릿과 사내 용어집에서만 |
| `pnpm --filter @aas/api db:generate` / `db:migrate` | 스키마 마이그레이션 |

### 수집 API (화면 없이 확인할 때)

```bash
curl http://localhost:8787/models
curl http://localhost:8787/collect/<모델id>/plan      # AID에서 읽은 접점
curl -X POST http://localhost:8787/collect/<모델id>/start
curl http://localhost:8787/collect/status
curl http://localhost:8787/models/<모델id>/signals    # 신호별 마지막 값과 지연
curl -X POST http://localhost:8787/collect/<모델id>/stop
```

## 워크스페이스

| 패키지 | 상태 | 역할 |
| --- | --- | --- |
| `packages/kernel` | **P1 완료** | 문서 모델 · 명령 · 직렬화 · 파싱 · 검증. 유일한 진실 |
| `packages/templates` | **P3 완료** | IDTA 템플릿 9종 + 적합성 검사 + 개정 마이그레이션 |
| `packages/semantic` | **P6 완료** | IRDI/IRI 파서(순수) + 사내 용어집(**샘플**) |
| `packages/aasx` | **P7 완료** | OPC 패키징. 브라우저·서버 공용 |
| `packages/ui` | 토큰만 | 디자인 토큰과 공용 컴포넌트 |
| `apps/web` | **P4·P5 완료 · P9 절반** | `/editor` 3뷰 · `/dashboard/operations` 운전 모니터링 |
| `apps/api` | **P7·P8 완료** | 저장소 · 버전 · AASX · BaSyx · 사전 프록시 · 값 수집(MQTT·OPC UA) |
| `e2e` | 스모크 | Playwright |

### 아직 없는 것

- **`/dashboard/models`** (모델 자산 관리) — P9의 나머지 한 화면
- **시계열 팬·줌** — 지금은 최근 500건 창만 봅니다
- **CSV 일괄 생성**(`POST /batch`) — 501을 돌려줍니다
- **IEC CDD 상류** — 사전은 캐시가 답합니다. cdd.iec.ch가 자동 접근을 막습니다
- **신호 → AAS 요소 되쓰기** — IDTA 02027(AIMC)의 몫이라 짐작으로 잇지 않았습니다
- **HTTP·Modbus 어댑터** — 어댑터가 없는 프로토콜은 없다고 말합니다

## 확정된 전제

사전은 **IEC CDD 단독**(eCl@ss 라이선스 없음) · **단일 사용자** · 게시 대상 **BaSyx V2** ·
대상 규모 **설비 10~50대** · **인터넷 접근 가능**(폐쇄망 이미지 만들지 않음).
근거와 파급은 계획서 12장에 있습니다.
