import { DatabaseSync } from 'node:sqlite'
import type { SqlDatabase, SqlStatement } from './profileStore.js'

/** Test helper: node:sqlite in the slice of the D1 API that SqlProfileStore uses, so the real SQL runs in tests. */
export function sqliteD1(): SqlDatabase {
  const db = new DatabaseSync(':memory:')
  const stmt = (sql: string, values: unknown[] = []): SqlStatement & { exec(): void } => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T,>() => (db.prepare(sql).get(...(values as never[])) as T | undefined) ?? null,
    all: async <T,>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(values as never[])).changes) } }),
    exec: () => void db.prepare(sql).run(...(values as never[])),
  })
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec('begin')
      try {
        for (const s of list) (s as ReturnType<typeof stmt>).exec()
        db.exec('commit')
      } catch (e) {
        db.exec('rollback')
        throw e
      }
      return []
    },
  }
}
