import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Create a new Redis connection.
// The connection is lazy, so it will only connect when needed.
export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // This is important for BullMQ
});