# AAS Composer

IEC 63278(AAS) V3.0 자산 관리 셸을 저작·검증·게시하는 웹 플랫폼.

- **작업 규칙은 [CLAUDE.md](CLAUDE.md)에 있습니다.** 코드를 건드리기 전에 먼저 읽으십시오.
- 설계 근거: [docs/plan.html](docs/plan.html) — 고도화 구현 계획 11단계
- 출발점: [docs/prototype.html](docs/prototype.html), 델타: [docs/prototype-delta.md](docs/prototype-delta.md)

## 시작하기

```bash
pnpm install
pnpm verify
```

`docker compose up -d` 로 PostgreSQL 16과 BaSyx V2를 띄웁니다.
BaSyx는 `http://localhost:8081/shells`, PostgreSQL은 `5432`입니다.

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

| 명령 | 하는 일 |
| --- | --- |
| `pnpm dev` | web(3000) + api(8787) |
| `pnpm verify` | check:kernel + typecheck + test + lint — **커밋 전 필수** |
| `pnpm check:kernel` | 커널 의존성 경계 검사 |
| `pnpm test --filter @aas/kernel` | 커널 왕복·속성·픽스처 테스트 |
| `pnpm e2e` | Playwright (dev 서버는 설정이 직접 띄움) |
| `pnpm golden:update` | 골든 스냅샷 갱신 — 의도한 변경일 때만 |

## 워크스페이스

| 패키지 | 상태 | 역할 |
| --- | --- | --- |
| `packages/kernel` | **P1 완료** | 문서 모델 · 명령 · 직렬화 · 파싱 · 검증. 유일한 진실 |
| `packages/templates` | **P1 완료** | IDTA 템플릿 6종 + 레지스트리 + 적합성 검사 |
| `packages/semantic` | 스텁 (P6) | IRDI/IRI 파서(순수) + 사전 어댑터(주입식) |
| `packages/aasx` | 스텁 (P7) | OPC 패키징. 브라우저·서버 공용 |
| `packages/ui` | 토큰만 | 디자인 토큰과 공용 컴포넌트 |
| `apps/web` | **P4 완료 · P5 진행** | `/editor` — 트리 · 캔버스 · 표 3뷰, 실행취소, 검증 패널 |
| `apps/api` | 골격 (P7) | Hono — 저장소 · 사전 프록시 · BaSyx 게이트웨이 |
| `e2e` | 스모크 | Playwright |

## 확정된 전제

사전은 **IEC CDD 단독**(eCl@ss 라이선스 없음) · **단일 사용자** · 게시 대상 **BaSyx V2** ·
대상 규모 **설비 10~50대** · **인터넷 접근 가능**(폐쇄망 이미지 만들지 않음).
근거와 파급은 계획서 12장에 있습니다.
