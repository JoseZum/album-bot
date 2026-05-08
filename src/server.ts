import app from './app';
import { loadEnv } from './config/env';

loadEnv();

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
