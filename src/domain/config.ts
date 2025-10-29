// Improve configuration management
export const config = {
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/wakka',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
  },
  iotec: {
    baseUrl: process.env.IOTEC_BASE_URL!,
    clientId: process.env.IOTEC_CLIENT_ID!,
    clientSecret: process.env.IOTEC_CLIENT_SECRET!,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  }
};