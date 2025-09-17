import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import propertyRoutes from './routes/properties';
import unitRoutes from './routes/units';
import leaseRoutes from './routes/leases';
import paymentRoutes from './routes/payments';
import landlordRoutes from './routes/landlords';
import tenantRoutes from './routes/tenant';
// import maintenanceRoutes from './routes/maintenance';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000', // Admin dashboard
    'http://localhost:3001', // Admin dashboard alternative
    'http://localhost:8081', // Expo dev server  
    'http://192.168.100.30:8081', // Expo dev server with IP
    'http://10.0.2.2:4000', // Android emulator
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// HTTP logging
app.use(morgan('tiny'));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});


// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/leases', leaseRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/landlords', landlordRoutes);
app.use('/api/tenant', tenantRoutes);
// app.use('/api/maintenance', maintenanceRoutes); // Post-MVP

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

export default app;