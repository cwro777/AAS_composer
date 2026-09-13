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

import { lookupConcepts } from './api';

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

const VERIFIED = new Set(['spec', 'dict', 'none']);

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * 용어집 파일을 읽는다 — `용어집 내보내기`가 만든 것, 또는 회사 용어집.
 *
 * `{ terms: [...] }`와 맨 배열 둘 다 받는다. 내보내기가 앞의 모양으로 쓰고,
 * 사람이 손으로 만든 파일은 뒤가 되기 쉽다.
 *
 * **받는 기준은 `entryFromDict`와 같다** — 영문 이름과 정의가 있어야 한다. 규격이
 * 요구하므로(AASc-3a-002 · AASc-3a-008) 없는 항목을 넣어 봐야 ConceptDescription이
 * 만들어지지 않고 경고만 모양을 바꾼다. 못 쓴 것은 세어서 돌려준다 — 조용히 버리면
 * 넣었다고 생각한 것이 왜 안 나오는지 알 수 없다.
 *
 * `verified`는 파일이 적은 값을 그대로 둔다. 회사 용어집이 사양서와 대조한 항목을
 * 가져올 수 있어야 하기 때문이다. 대신 어디서 왔는지를 `provenance`에 남긴다.
 */
export function entriesFromFile(
  raw: string,
  origin: string,
): { entries: TermEntry[]; unusable: number } {
  const parsed: unknown = JSON.parse(raw);
  const list: unknown = Array.isArray(parsed) ? parsed : (parsed as { terms?: unknown })?.terms;
  if (!Array.isArray(list)) throw new Error('terms 배열을 찾지 못했습니다.');

  const entries: TermEntry[] = [];
  let unusable = 0;

  for (const item of list) {
    const t = item as Record<string, unknown>;
    const semanticId = text(t['semanticId']);
    const nameEn = text(t['nameEn']);
    const definition = text(t['definition']);
    const term = text(t['term']) || nameEn;

    if (!semanticId || !nameEn || !definition) {
      unusable += 1;
      continue;
    }

    const verified = text(t['verified']);
    const aliases = Array.isArray(t['aliases'])
      ? (t['aliases'] as unknown[]).map(text).filter(Boolean)
      : [];

    entries.push({
      term,
      nameEn,
      semanticId,
      definition,
      ...(aliases.length ? { aliases } : {}),
      ...(text(t['unit']) ? { unit: text(t['unit']) } : {}),
      ...(text(t['dataType']) ? { dataType: text(t['dataType']) } : {}),
      origin: t['origin'] === 'idta' ? 'idta' : 'local',
      verified: (VERIFIED.has(verified) ? verified : 'none') as TermEntry['verified'],
      provenance: text(t['provenance']) || `파일에서 가져옴 (${origin})`,
    });
  }

  return { entries, unusable };
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

/** 이 목록에 있는 id는 이번 세션에 이미 물어봤다 — 답이 없던 것도 다시 묻지 않는다 */
const asked = new Set<string>();
/** 서버에 닿지 못했으면 잠시 쉰다. 검증은 타이핑마다 돌므로 그대로 두면 요청이 쏟아진다 */
let retryAt = 0;

interface TermsState {
  entries: TermEntry[];
  /**
   * 서버 사전이 답한 개념 — **이 세션의 메모리에만** 둔다.
   *
   * 사내 용어집(`entries`)에 넣지 않는 이유: 그것은 사람이 쓰는 장부다. 자동으로 쌓으면
   * 지운 항목이 되살아나고, 사전이 고쳐져도 옛 값이 브라우저에 남는다.
   * 붙잡아 두고 싶으면 검증 탭의 `사전에서 채우기`가 여전히 용어집으로 옮긴다.
   */
  dict: TermEntry[];
  draft: ConceptDraft | null;
  restored: boolean;
  /** 샘플 → 사전 → 사내. 뒤가 이긴다. 해석기에 넘길 책 */
  book: () => TermBook;
  /**
   * 책이 모르는 개념을 서버 사전에 묻는다.
   *
   * 누르지 않아도 된다. 검증이 CD-001을 낼 때마다 부르고, 물어본 적 없는 것만 보낸다.
   * 경고 수십 건이 "버튼 하나 안 눌러서"라면 경고가 할 일을 못 한다.
   */
  lookupMissing: (ids: string[]) => void;
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
  dict: [],
  draft: null,
  restored: false,

  book: () => mergeBooks(SAMPLE_TERMS, { terms: get().dict }, { terms: get().entries }),

  lookupMissing: (ids) => {
    if (Date.now() < retryAt) return;
    const fresh = [...new Set(ids)].filter((id) => !asked.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) asked.add(id);

    lookupConcepts(fresh)
      .then((r) => {
        const sample = new Map(SAMPLE_TERMS.terms.map((t) => [t.semanticId, t]));
        const got = r.entries
          .map(entryFromDict)
          .filter((e): e is TermEntry => !!e)
          /* 샘플이 한글 용어·별칭을 갖고 있으면 살린다 — 사전에는 한글이 없어 검색이 끊긴다 */
          .map((e) => {
            const s = sample.get(e.semanticId);
            return s ? { ...e, term: s.term, ...(s.aliases ? { aliases: s.aliases } : {}) } : e;
          });
        if (got.length) set((s) => ({ dict: [...s.dict, ...got] }));
      })
      .catch(() => {
        /* 못 물어본 것은 물어본 것이 아니다 — 서버가 돌아오면 다시 묻는다 */
        for (const id of fresh) asked.delete(id);
        retryAt = Date.now() + 30_000;
      });
  },

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
