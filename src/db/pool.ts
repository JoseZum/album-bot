// Backwards-compat shim. Prefer importing `db` from `./index` (or '../db').
// This re-export keeps existing call sites (`pool.query(...)`) working.
export { db as pool } from './index';
