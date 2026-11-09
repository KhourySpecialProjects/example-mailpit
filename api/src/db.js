import pg from 'pg';

// Connection settings come from the standard libpq env vars
// (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
export const pool = new pg.Pool();
