/**
 * 템플릿 자체 점검 — 갓 삽입한 템플릿이 무엇을 남기는가.
 *
 * 질문은 하나다. **템플릿이 만든 것이 그 템플릿 자신의 규칙을 지키는가.**
 * 지키지 못하면 그것은 사용자의 잘못이 아니라 템플릿의 결함이다.
 *
 * 이슈를 셋으로 나눈다.
 *   결함   템플릿을 고쳐야 사라진다 (T-002 · POL-* · 규격)
 *   입력   인스턴스 값을 넣어야 사라진다 (T-001의 autoInsert:false 등)
 *   사전   개념을 알아야 사라진다 (CD-001) — 템플릿 잘못이 아니다
 *
 *   pnpm --filter @aas/api exec tsx scripts/audit-templates.ts
 */

import process from 'node:process';

import {
  type AasDoc,
  type Cmd,
  type ConceptInfo,
  type ConceptResolver,
  type NodeId,
  apply,
  attachConceptDescriptions,
  buildConceptDescriptions,
  emptyDoc,
  newNode,
  serialize,
  usedSemanticIds,
  validate,
  verifyEnvironment,
} from '@aas/kernel';
import { SAMPLE_TERMS, conceptFromTerm, termsResolver } from '@aas/semantic';
import { type TemplateDef, checkAllConformance, instantiate, listTemplates } from '@aas/templates';

const API = process.env['API_BASE'] ?? 'http://localhost:8787';

/**
 * 서버 사전을 해석기로 쓴다 — 화면의 `사전에서 채우기`와 같은 자리다.
 *
 * 이것을 붙였을 때 CD-001이 몇 건 남는지가, 사용자가 실제로 겪을 숫자다.
 */
async function dictResolver(doc: AasDoc): Promise<ConceptResolver> {
  const ids = [...usedSemanticIds(doc).keys()];
  const res = await fetch(`${API}/dictionary/lookup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`사전 조회 실패 ${res.status}`);
  const r = (await res.json()) as {
    entries: Array<{ irdi: string; nameEn?: string | null; nameKo?: string | null; definition?: string | null; unit?: string | null; dataType?: string | null }>;
  };
  const map = new Map<string, ConceptInfo>();
  for (const e of r.entries) {
    if (!e.nameEn || !e.definition) continue;
    map.set(
      e.irdi,
      conceptFromTerm({
        term: e.nameKo ?? e.nameEn,
        nameEn: e.nameEn,
        definition: e.definition,
        ...(e.unit ? { unit: e.unit } : {}),
        ...(e.dataType ? { dataType: e.dataType } : {}),
      }),
    );
  }
  return { resolve: (id) => map.get(id) };
}

const NS = 'https://bnb.co.kr/ids';

function ap(doc: AasDoc, cmd: Cmd): AasDoc {
  const r = apply(doc, cmd);
  if (r.rejected) throw new Error(`거부됨: ${JSON.stringify(r.rejected)}`);
  return r.doc;
}

interface Row {
  bucket: '결함' | '입력' | '사전';
  severity: string;
  code: string;
  where: string;
}

async function auditOne(
  def: TemplateDef,
  useDict: boolean,
): Promise<{ name: string; rows: Row[]; nodes: number }> {
  let n = 0;
  const newId = (): NodeId => `n${(n += 1)}` as NodeId;

  let doc = emptyDoc();
  const shell = newId();
  doc = ap(doc, {
    t: 'insert',
    parent: null,
    index: 0,
    node: newNode(shell, 'shell', {
      idShort: 'Audit_AAS',
      identifier: `${NS}/aas/audit`,
      globalAssetId: `${NS}/asset/audit`,
    }),
  });
  doc = ap(doc, instantiate(def, { newId, namespace: NS, assetSlug: 'asset', shell, doc }));

  const rows: Row[] = [];

  for (const i of validate(doc, { iriPrefix: NS })) {
    rows.push({ bucket: '결함', severity: i.severity, code: i.code, where: i.path });
  }
  for (const c of checkAllConformance(doc)) {
    /* T-001은 인스턴스 값이 있어야 넣을 수 있는 요소(autoInsert:false)에서도 난다 */
    rows.push({
      bucket: c.code === 'T-001' ? '입력' : '결함',
      severity: 'warn',
      code: c.code,
      where: c.path,
    });
  }
  /* CD-001은 따로 센다 — 개념을 아는지는 템플릿의 책임이 아니다 */
  const resolver = useDict ? await dictResolver(doc) : termsResolver(SAMPLE_TERMS);
  const cd = buildConceptDescriptions(doc, resolver);
  for (const i of cd.unresolved) {
    rows.push({ bucket: '사전', severity: i.severity, code: i.code, where: i.path });
  }

  /**
   * **내보내는 것을 그대로 검증한다.**
   *
   * serialize(doc)만 보면 conceptDescriptions가 빠져 규격 위반을 놓친다 —
   * 예: AASc-3a-009(측정형 자료형인데 단위 없음)는 개념 쪽에서만 난다.
   * 화면의 buildExport와 같은 것을 봐야 한다.
   */
  const r = verifyEnvironment(attachConceptDescriptions(serialize(doc), cd.conceptDescriptions));
  if (r.deserializationError) {
    rows.push({ bucket: '결함', severity: 'error', code: 'AAS-CORE', where: r.deserializationError });
  }
  for (const i of r.issues) {
    rows.push({ bucket: '결함', severity: 'error', code: i.code, where: `${i.path} — ${i.message.ko}` });
  }

  return { name: def.name, rows, nodes: Object.keys(doc.nodes).length };
}

const args = process.argv.slice(2);
const useDict = args.includes('--dict');
const only = args.filter((a) => !a.startsWith('--'));
const targets = listTemplates().filter((t) => only.length === 0 || only.includes(t.id));

console.log(useDict ? `사전: 서버 (${API})` : '사전: 기본 용어집(SAMPLE_TERMS)만');

let defects = 0;
let dictLeft = 0;
for (const t of targets) {
  const { name, rows, nodes } = await auditOne(t, useDict);
  const by = (b: string): Row[] => rows.filter((r) => r.bucket === b);
  const d = by('결함');
  defects += d.length;
  dictLeft += by('사전').length;
  console.log(
    `\n── ${name}  (${t.id})  노드 ${nodes}개\n` +
      `   결함 ${d.length} · 입력 ${by('입력').length} · 사전 ${by('사전').length}`,
  );
  for (const r of d) {
    console.log(`   ✗ ${r.severity.toUpperCase().padEnd(5)} ${r.code.padEnd(12)} ${r.where}`);
  }
  for (const r of by('입력')) console.log(`   · 입력  ${r.code.padEnd(12)} ${r.where}`);
  if (useDict) for (const r of by('사전')) console.log(`   · 사전  ${r.where}`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(defects === 0 ? '템플릿 결함 없음.' : `템플릿 결함 ${defects}건 — 고쳐야 한다.`);
console.log(`남은 CD-001 ${dictLeft}건 — 템플릿이 아니라 사전의 몫이다.`);
