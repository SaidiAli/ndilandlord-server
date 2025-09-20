import { Queue } from 'bullmq';
import { connection } from './connections';

export const leaseQueue = new Queue('lease-queue', { connection });

// You can add other queues here as your application grows
// export const notificationQueue = new Queue('notification-queue', { connection });