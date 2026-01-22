import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Create a new Redis connection.
// The connection is lazy, so it will only connect when needed.
// export const connection = new IORedis(process.env.REDIS_URL!, {
//     maxRetriesPerRequest: null, // This is important for BullMQ
//     password: '1Iacln9Ip9ELiSQgBPKslW7wOoPD0mqL'
// });