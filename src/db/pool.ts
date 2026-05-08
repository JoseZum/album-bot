import { Pool } from 'pg';

import { loadEnv } from '../config/env';

loadEnv();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com') ? { rejectUnauthorized: false } : false,
});
