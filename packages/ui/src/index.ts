/**
 * @aas/ui — 디자인 토큰과 공용 컴포넌트.
 *
 * 토큰은 `@aas/ui/tokens.css`. 컴포넌트에서 색상 리터럴(#hex)을 쓰지 않는다.
 *
 * 만들 컴포넌트 (docs/plan.html 05장 · 08장):
 *   NodeCard          캔버스 노드 — 타입 색은 좌측 스트라이프로만
 *   IssuePill         검증 이슈 — 색 + 텍스트 라벨을 항상 함께
 *   SemanticIdField   IRDI/IRI 자동 판별, 버전 접미사 강조, 확인 상태 배지
 *   StatTile          대시보드 KPI — tabular-nums, 스파크라인
 *   TimeSeriesChart   uPlot 래퍼 — 임계선과 이상 구간 음영
 *   EmptyState        모든 목록·차트. 다음 행동 버튼을 반드시 포함
 */
export const TOKENS_CSS_PATH = '@aas/ui/tokens.css';
