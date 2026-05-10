import express, { NextFunction, Request, Response } from 'express';

import { register } from './config/metrics';
import routes from './routes';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
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