import {
  getCountFromServer, getDocs, limit, query, startAfter, Timestamp,
  type DocumentData, type Query, type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore';

export type Cursor = QueryDocumentSnapshot<DocumentData>;

export interface Page<T> {
  items: T[];
  total: number;
  last: Cursor | null;
}

/** Cursor-based page + total count (counts are cheap aggregation queries). */
export async function fetchPage<T>(
  base: Query<DocumentData>,
  order: QueryConstraint[],
  map: (d: QueryDocumentSnapshot<DocumentData>) => T,
  pageSize: number,
  after: Cursor | null,
): Promise<Page<T>> {
  const q = query(base, ...order, ...(after ? [startAfter(after)] : []), limit(pageSize));
  const [snap, count] = await Promise.all([getDocs(q), getCountFromServer(base)]);
  return { items: snap.docs.map(map), total: count.data().count, last: snap.docs.at(-1) ?? null };
}

export const count = async (q: Query<DocumentData>) => (await getCountFromServer(q)).data().count;

/** Firestore Timestamp → ISO string (null while a server timestamp is pending). */
export const iso = (v: unknown): string | null => (v instanceof Timestamp ? v.toDate().toISOString() : null);

/** Normalised search term matching the server-side `searchKeywords`. */
export const searchTerm = (s?: string) => (s ?? '').trim().toLowerCase().slice(0, 30);

export const startOfDay = (d: string) => Timestamp.fromDate(new Date(`${d}T00:00:00`));
export const endOfDay = (d: string) => Timestamp.fromDate(new Date(new Date(`${d}T00:00:00`).getTime() + 86400000));
