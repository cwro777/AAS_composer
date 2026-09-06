'use client';

/**
 * 사내 용어집 — 브라우저에 쌓이는 쪽.
 *
 * `@aas/semantic`의 `SAMPLE_TERMS`는 **샘플**이고 파일이라 손댈 수 없다. 그래서
 * 자체 발행한 개념(`…/cd/이름/1/0`)은 등록할 자리가 없어 CD-001이 영원히 남았다.
 * 지적만 하고 고칠 길이 없는 검증은 결국 무시된다.
 *
 * 여기 담긴 것이 샘플보다 **나중**이므로 같은 semanticId면 이쪽이 이긴다(`mergeBooks`).
 *
 * 최종 목적지는 여기가 아니다. 회사 용어집 파일이나 사전 프록시로 옮겨야 하고,
 * 그래서 내보내기를 함께 둔다 — 브라우저에 갇히면 한 사람의 것으로 끝난다.
 */

import { create } from 'zustand';

import { SAMPLE_TERMS, type TermBook, type TermEntry, mergeBooks } from '@aas/semantic';

const KEY = 'aas-composer/terms/v1';

/** 등록 창에 채워 넣을 초안 */
export interface ConceptDraft {
  semanticId: string;
  term: string;
  nameEn: string;
  definition: string;
  unit: string;
  dataType: string;
}

/** IEC 61360 자료형 — 규격이 정한 어휘다. 자유 입력이 아니다. */
export const DATA_TYPES = [
  'STRING',
  'STRING_TRANSLATABLE',
  'REAL_MEASURE',
  'REAL_COUNT',
  'INTEGER_MEASURE',
  'INTEGER_COUNT',
  'BOOLEAN',
  'DATE',
  'TIMESTAMP',
] as const;

/** Property의 valueType에서 자료형을 미리 골라 준다 */
export function dataTypeFor(valueType: string | undefined): string {
  if (!valueType) return 'STRING';
  if (/double|float|decimal/.test(valueType)) return 'REAL_MEASURE';
  if (/int|long|byte|unsigned/.test(valueType)) return 'INTEGER_COUNT';
  if (/boolean/.test(valueType)) return 'BOOLEAN';
  if (/dateTime/.test(valueType)) return 'TIMESTAMP';
  if (/date/.test(valueType)) return 'DATE';
  return 'STRING';
}

/** `https://cw.co.kr/ids/cd/MySubmodel/1/0` → `MySubmodel` */
export function nameFromIri(semanticId: string): string {
  const segs = semanticId.split(/[/#]/).filter(Boolean);
  /* 끝의 버전 마디(1/0)를 지나 이름까지 되돌아간다 */
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    if (!/^\d+$/.test(segs[i]!)) return segs[i]!;
  }
  return '';
}

/** `MySubmodel` → `My submodel` — 영문 표제어의 출발점 */
export function humanize(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return spaced ? spaced[0]!.toUpperCase() + spaced.slice(1).toLowerCase() : '';
}

/**
 * 서버 사전이 아는 것을 용어집 항목으로.
 *
 * **정의가 없으면 받지 않는다.** 규격이 영문 정의를 요구하므로(AASc-3a-008), 이름만
 * 있는 항목을 넣어 봐야 ConceptDescription이 만들어지지 않고 경고만 모양을 바꾼다.
 */
export function entryFromDict(d: {
  irdi: string;
  nameEn?: string | null;
  nameKo?: string | null;
  definition?: string | null;
  unit?: string | null;
  dataType?: string | null;
  origin?: string | null;
}): TermEntry | null {
  if (!d.nameEn?.trim() || !d.definition?.trim()) return null;
  return {
    term: d.nameKo?.trim() || d.nameEn.trim(),
    nameEn: d.nameEn.trim(),
    semanticId: d.irdi,
    definition: d.definition.trim(),
    ...(d.unit ? { unit: d.unit } : {}),
    ...(d.dataType ? { dataType: d.dataType } : {}),
    origin: 'idta',
    /**
     * `dict` — **사전이 답했다**는 뜻이지, 우리가 사양서를 대조했다는 뜻이 아니다.
     *
     * `none`으로 두면 배지가 "미확인"으로 남아, 사전이 이름·정의·단위까지 준 개념도
     * 아무 근거 없는 것과 같아 보인다. 그렇다고 `spec`으로 올리면 하지 않은 대조를
     * 했다고 말하는 것이다. 근거의 세기를 있는 그대로 적는 자리가 이 값이다.
     */
    verified: 'dict',
    provenance: `사전에서 받음${d.origin ? ` (${d.origin})` : ''}`,
  };
}

interface TermsState {
  entries: TermEntry[];
  draft: ConceptDraft | null;
  restored: boolean;
  /** 샘플 + 사내. 해석기에 넘길 책 */
  book: () => TermBook;
  openDraft: (d: ConceptDraft) => void;
  patchDraft: (p: Partial<ConceptDraft>) => void;
  closeDraft: () => void;
  /** 초안을 용어집에 넣는다. 규격이 요구하는 것이 비면 사유를 돌려준다. */
  commitDraft: () => { ok: true; entry: TermEntry } | { ok: false; reason: string };
  remove: (semanticId: string) => void;
  /** 여러 항목을 한 번에. 이미 있는 것은 덮어쓰지 않는다 — 사람이 쓴 것이 이긴다 */
  addMany: (list: TermEntry[]) => number;
  restore: () => void;
}

function persist(entries: TermEntry[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ schema: 1, terms: entries }));
  } catch {
    /* 저장하지 못해도 이번 세션에서는 쓰인다 */
  }
}

export const useTerms = create<TermsState>()((set, get) => ({
  entries: [],
  draft: null,
  restored: false,

  book: () => mergeBooks(SAMPLE_TERMS, { terms: get().entries }),

  openDraft: (draft) => set({ draft }),
  patchDraft: (p) => set((s) => (s.draft ? { draft: { ...s.draft, ...p } } : s)),
  closeDraft: () => set({ draft: null }),

  commitDraft: () => {
    const d = get().draft;
    if (!d) return { ok: false as const, reason: '등록할 개념이 없습니다.' };
    if (!d.term.trim()) return { ok: false as const, reason: '사내 용어(한글)를 채우십시오.' };
    /* 규격이 영문 표제어와 정의를 요구한다 — 없으면 ConceptDescription을 만들 수 없다 */
    if (!d.nameEn.trim()) {
      return { ok: false as const, reason: '영문 이름이 있어야 합니다 (AASc-3a-002).' };
    }
    if (!d.definition.trim()) {
      return { ok: false as const, reason: '영문 정의가 있어야 합니다 (AASc-3a-008).' };
    }

    const entry: TermEntry = {
      term: d.term.trim(),
      nameEn: d.nameEn.trim(),
      semanticId: d.semanticId,
      definition: d.definition.trim(),
      ...(d.unit.trim() ? { unit: d.unit.trim() } : {}),
      ...(d.dataType ? { dataType: d.dataType } : {}),
      origin: 'local',
      verified: 'none',
      provenance: '에디터에서 등록 — 표준 사전에서 대조하지 않았습니다.',
    };

    const entries = [...get().entries.filter((e) => e.semanticId !== entry.semanticId), entry];
    set({ entries, draft: null });
    persist(entries);
    return { ok: true as const, entry };
  },

  addMany: (list) => {
    const have = new Set(get().entries.map((e) => e.semanticId));
    const fresh = list.filter((e) => !have.has(e.semanticId));
    if (fresh.length === 0) return 0;
    const entries = [...get().entries, ...fresh];
    set({ entries });
    persist(entries);
    return fresh.length;
  },

  remove: (semanticId) => {
    const entries = get().entries.filter((e) => e.semanticId !== semanticId);
    set({ entries });
    persist(entries);
  },

  restore: () => {
    try {
      const raw = window.localStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as { terms?: unknown }) : null;
      if (Array.isArray(saved?.terms)) set({ entries: saved.terms as TermEntry[] });
    } catch {
      /* 읽지 못하면 샘플만 쓴다 */
    }
    set({ restored: true });
  },
}));
