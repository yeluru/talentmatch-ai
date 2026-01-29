export type SortDir = 'asc' | 'desc';

export type SortState<K extends string = string> = {
  key: K;
  dir: SortDir;
};

function isNil(v: unknown) {
  return v === null || v === undefined;
}

function normalize(v: unknown): string | number | boolean | Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    // If it looks like a date, treat as date for better sorting.
    const t = Date.parse(v);
    if (!Number.isNaN(t) && /\d{4}-\d{2}-\d{2}/.test(v)) return new Date(t);
    return v;
  }
  return String(v ?? '');
}

function compareNormalized(a: unknown, b: unknown): number {
  const av = normalize(a);
  const bv = normalize(b);

  // Dates
  if (av instanceof Date && bv instanceof Date) return av.getTime() - bv.getTime();

  // Numbers
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;

  // Booleans
  if (typeof av === 'boolean' && typeof bv === 'boolean') return Number(av) - Number(bv);

  // Strings (fallback)
  return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
}

export function sortBy<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K>,
  getValue: (row: T, key: K) => unknown,
): T[] {
  const dirMul = sort.dir === 'asc' ? 1 : -1;

  // Stable sort: decorate with index, then sort, then undecorate.
  return rows
    .map((row, idx) => ({ row, idx }))
    .sort((a, b) => {
      const av = getValue(a.row, sort.key);
      const bv = getValue(b.row, sort.key);

      const aNil = isNil(av) || av === '';
      const bNil = isNil(bv) || bv === '';
      if (aNil && bNil) return a.idx - b.idx;
      if (aNil) return 1; // nils last
      if (bNil) return -1;

      const c = compareNormalized(av, bv);
      if (c !== 0) return c * dirMul;
      return a.idx - b.idx;
    })
    .map((x) => x.row);
}

