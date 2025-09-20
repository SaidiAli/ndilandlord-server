import { leaseQueue } from './queues';

export class LeaseJobs {
    /**
     * Initializes the repeatable jobs for the lease queue.
     * This should be called once when the application starts.
     */
    static async scheduleRepeatableJobs() {
        console.log('Scheduling repeatable lease jobs...');

        // Remove any existing repeatable jobs to avoid duplicates on restart
        const repeatableJobs = await leaseQueue.getRepeatableJobs();
        for (const job of repeatableJobs) {
            await leaseQueue.removeRepeatableByKey(job.key);
        }

        // Schedule 'updateLeaseStatuses' to run daily at 1 AM
        await leaseQueue.add('updateLeaseStatuses', {}, {
            repeat: {
                pattern: '0 1 * * *', // Every day at 1:00 AM
            },
            jobId: 'daily-lease-status-update', // Optional: prevents duplicate jobs with the same ID
        });

        // Schedule 'sendPaymentReminders' to run daily at 8 AM
        await leaseQueue.add('sendPaymentReminders', {}, {
            repeat: {
                pattern: '0 8 * * *', // Every day at 8:00 AM
            },
            jobId: 'daily-payment-reminders',
        });

        // Schedule 'sendLeaseExpiryNotices' to run on the 25th of each month at 8 AM
        await leaseQueue.add('sendLeaseExpiryNotices', {}, {
            repeat: {
                pattern: '0 8 25 * *', // At 8:00 AM on the 25th day of every month
            },
            jobId: 'monthly-lease-expiry-notices',
        });

        console.log('Repeatable lease jobs scheduled successfully.');
    }
}