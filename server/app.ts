import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.ts';
import transactionRoutes from './routes/transactionRoutes.ts';
import saldoRoutes from './routes/saldoRoutes.ts';
import sheetsRoutes from './routes/sheetsRoutes.ts';
import appRoutes from './routes/appRoutes.ts';
import userRoutes from './routes/userRoutes.ts';

dotenv.config();

const app = express();

// Middleware to handle both Node.js stream and pre-parsed Vercel serverless request bodies
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.body && typeof req.body === 'object') {
    return next();
  }
  express.json({ limit: '10mb' })(req, res, next);
});

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS headers for flexible deployment
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Keuangan Tim Petugas Haji Puskesmas',
    version: '2.0.0',
    deployment: process.env.VERCEL ? 'vercel' : 'node-server',
    timestamp: new Date().toISOString(),
  });
});

// REST API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/saldo', saldoRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/app', appRoutes);
app.use('/api/users', userRoutes);

export default app;
