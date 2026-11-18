/** Tiny helper for building parameterised WHERE clauses safely. */
export class Where {
  private parts: string[] = [];
  readonly params: unknown[] = [];

  /** Each `?` in the fragment is replaced by the next positional parameter. */
  add(fragment: string, ...values: unknown[]) {
    let sql = fragment;
    for (const v of values) {
      this.params.push(v);
      sql = sql.replace('?', `$${this.params.length}`);
    }
    this.parts.push(sql);
    return this;
  }

  param(v: unknown) {
    this.params.push(v);
    return `$${this.params.length}`;
  }

  toString() {
    return this.parts.length ? `where ${this.parts.join(' and ')}` : '';
  }
}

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/**
 * Run queries one after another on the same transaction client
 * (a pg client cannot execute queries concurrently).
 */
export async function sequential<T extends readonly (() => Promise<any>)[]>(
  fns: T,
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const out: any[] = [];
  for (const fn of fns) out.push(await fn());
  return out as any;
}
