import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { env } from './config/env.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { errorMiddleware } from './middleware/errorMiddleware.js';
import { routes } from './routes/index.js';

const app = express();

app.use(helmet());
app.use(securityHeaders);
app.use(compression());
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

app.use((req, res, next) => {
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'NepZo Backend' });
});

app.use('/api', routes);

app.use(errorMiddleware);

export { app };

