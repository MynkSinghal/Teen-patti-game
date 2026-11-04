import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

const g = globalThis as unknown as { __tpSql?: Sql };

/**
 * Bounded pool through the Supabase transaction pooler (port 6543).
 * Prepared statements are disabled because transaction pooling does not support them.
 */
export function getSql(): Sql {
  if (g.__tpSql) return g.__tpSql;
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URL is not configured');
  g.__tpSql = postgres(url, {
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 4),
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 20,
    onnotice: () => {},
  });
  return g.__tpSql;
}

export function setSqlForTests(sql: Sql) {
  g.__tpSql = sql;
}
