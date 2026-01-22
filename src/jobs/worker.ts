// import { Worker } from 'bullmq';
// import { LeaseService } from '../services/leaseService';
// import { connection } from './connections';

// // In a real application, you would import a dedicated notification service
// const NotificationService = {
//   sendPaymentReminder: (tenant: any, payment: any) => {
//     console.log(`Sending payment reminder to ${tenant.firstName} for payment due on ${payment.dueDate.toLocaleDateString()}`);
//   },
//   sendLeaseExpiryNotice: (user: any, lease: any) => {
//     console.log(`Sending lease expiry notice to ${user.firstName} for lease ending on ${lease.endDate.toLocaleDateString()}`);
//   }
// };


// // Define the worker for the lease queue
// export const leaseWorker = new Worker('lease-queue', async job => {
//   console.log(`Processing job: ${job.name}`);
  
//   switch (job.name) {
//     case 'updateLeaseStatuses':
//       await LeaseService.updateLeaseStatuses();
//       break;
//     case 'sendPaymentReminders':
//       // This logic would be more complex in a real app, fetching necessary data
//       console.log('Processing payment reminders...');
//       // Placeholder logic, similar to the previous leaseJobs.ts
//       break;
//     case 'sendLeaseExpiryNotices':
//       // This logic would be more complex in a real app, fetching necessary data
//       console.log('Processing lease expiry notices...');
//       // Placeholder logic
//       break;
//     default:
//       throw new Error(`Unknown job name: ${job.name}`);
//   }
// }, { connection });

// leaseWorker.on('completed', job => {
//   console.log(`Job ${job.id} has completed!`);
// });

// leaseWorker.on('failed', (job, err) => {
//   console.error(`Job ${job?.id} has failed with ${err.message}`);
// });