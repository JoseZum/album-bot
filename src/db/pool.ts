import { Pool } from 'pg';
import { activeDbConnections, dbQueryDurationMicroseconds } from '../config/metrics';

import { loadEnv } from '../config/env';

loadEnv();

const originalPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com') ? { rejectUnauthorized: false } : false,
});

originalPool.on('connect', () => {
    activeDbConnections.inc();
});

originalPool.on('remove', () => {
    activeDbConnections.dec();
});

export const pool = new Proxy(originalPool, {
    get(target, prop) {
        if (prop === 'query') {
            return (...args: [string, ...unknown[]]) => {
                const end = dbQueryDurationMicroseconds.startTimer({ query: args[0] });
                const result = (target.query as (...args: unknown[]) => unknown)(...args);
                if (result instanceof Promise) {
                    result.finally(end);
                } else {
                    end();
                }
                return result;
            };
        }
        return (target as unknown as Record<string | symbol, unknown>)[prop];
    }
});
