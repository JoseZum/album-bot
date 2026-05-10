import express, { NextFunction, Request, Response } from 'express';

import { register, httpRequestCounter, httpRequestDurationMicroseconds } from './config/metrics';
import { pool } from './db/pool';
import routes from './routes';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const end = httpRequestDurationMicroseconds.startTimer({ method: req.method, route: req.path });
  res.on('finish', () => {
    httpRequestCounter.inc({ method: req.method, route: req.path, status_code: res.statusCode });
    end({ code: res.statusCode });
  });
  next();
});

app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

app.use('/api', routes);

app.use((req: Request, res: Response) => {
	res.status(404).json({
		success: false,
		message: 'Route not found',
	});
});

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
	const error = err as { statusCode?: number; message?: string };

	res.status(error.statusCode || 500).json({
		success: false,
		message: error.message || 'Internal server error',
	});
});

export default app;