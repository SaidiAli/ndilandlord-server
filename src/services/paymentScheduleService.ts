import { db } from '../db';
import { paymentSchedules, leases } from '../db/schema';
import { and, eq, lte } from 'drizzle-orm';

export class PaymentScheduleService {
    /**
     * Generate payment schedule for a lease
     */
    static async generatePaymentSchedule(leaseId: string) {
        try {
            // Get lease details
            const [lease] = await db
                .select()
                .from(leases)
                .where(eq(leases.id, leaseId))
                .limit(1);

            if (!lease) {
                throw new Error('Lease not found');
            }

            // Clear any existing schedule (in case of regeneration)
            await db
                .delete(paymentSchedules)
                .where(eq(paymentSchedules.leaseId, leaseId));

            // Calculate payment periods
            const scheduleEntries = this.calculatePaymentPeriods(
                new Date(lease.startDate),
                new Date(lease.endDate),
                parseFloat(lease.monthlyRent),
                lease.paymentDay
            );

            // Insert all schedule entries
            if (scheduleEntries.length > 0) {
                const scheduleRecords = scheduleEntries.map((entry, index) => ({
                    leaseId,
                    paymentNumber: index + 1,
                    dueDate: entry.dueDate,
                    amount: entry.amount.toFixed(2),
                    periodStart: entry.periodStart,
                    periodEnd: entry.periodEnd,
                    isPaid: false,
                }));

                await db.insert(paymentSchedules).values(scheduleRecords);
            }

            return scheduleEntries;
        } catch (error) {
            console.error('Error generating payment schedule:', error);
            throw error;
        }
    }

    /**
     * Calculate payment periods for a lease
     */
    private static calculatePaymentPeriods(
        leaseStart: Date,
        leaseEnd: Date,
        monthlyRent: number,
        paymentDay: number
    ): Array<{
        dueDate: Date;
        amount: number;
        periodStart: Date;
        periodEnd: Date;
    }> {
        const periods: Array<{
            dueDate: Date;
            amount: number;
            periodStart: Date;
            periodEnd: Date;
        }> = [];

        let currentDate = new Date(leaseStart);
        let paymentNumber = 1;

        while (currentDate <= leaseEnd) {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();

            // Calculate period start and end
            let periodStart: Date;
            let periodEnd: Date;
            let dueDate: Date;
            let amount = monthlyRent;

            // Handle first month
            if (paymentNumber === 1) {
                periodStart = new Date(leaseStart);

                // Set due date
                dueDate = new Date(year, month, Math.min(paymentDay, this.getDaysInMonth(year, month)));

                // If lease starts after payment day, due date is next month
                if (leaseStart.getDate() > paymentDay) {
                    const nextMonth = new Date(year, month + 1, 1);
                    dueDate = new Date(
                        nextMonth.getFullYear(),
                        nextMonth.getMonth(),
                        Math.min(paymentDay, this.getDaysInMonth(nextMonth.getFullYear(), nextMonth.getMonth()))
                    );
                }

                // Period ends at month end
                periodEnd = new Date(year, month + 1, 0); // Last day of month

                // Prorate if lease starts after 1st
                if (leaseStart.getDate() > 1) {
                    const daysInMonth = this.getDaysInMonth(year, month);
                    const daysInPeriod = daysInMonth - leaseStart.getDate() + 1;
                    amount = (monthlyRent / daysInMonth) * daysInPeriod;
                }
            } else {
                // Regular months
                periodStart = new Date(year, month, 1);
                periodEnd = new Date(year, month + 1, 0); // Last day of month
                dueDate = new Date(year, month, Math.min(paymentDay, this.getDaysInMonth(year, month)));

                // Check if this is the last month and needs proration
                const nextMonthStart = new Date(year, month + 1, 1);
                if (nextMonthStart > leaseEnd) {
                    periodEnd = new Date(leaseEnd);

                    // Prorate last month if lease ends before month end
                    if (leaseEnd.getDate() < this.getDaysInMonth(leaseEnd.getFullYear(), leaseEnd.getMonth())) {
                        const daysInMonth = this.getDaysInMonth(leaseEnd.getFullYear(), leaseEnd.getMonth());
                        const daysInPeriod = leaseEnd.getDate();
                        amount = (monthlyRent / daysInMonth) * daysInPeriod;
                    }
                }
            }

            periods.push({
                dueDate,
                amount: Math.round(amount * 100) / 100, // Round to 2 decimal places
                periodStart,
                periodEnd,
            });

            // Move to next month
            currentDate = new Date(year, month + 1, 1);
            paymentNumber++;

            // Stop if we've covered the lease period
            if (periodEnd >= leaseEnd) {
                break;
            }
        }

        return periods;
    }

    /**
     * Get number of days in a month
     */
    private static getDaysInMonth(year: number, month: number): number {
        return new Date(year, month + 1, 0).getDate();
    }

    /**
     * Link a payment to its schedule
     */
    static async linkPaymentToSchedule(paymentId: string, scheduleId: string) {
        try {
            await db
                .update(paymentSchedules)
                .set({
                    isPaid: true,
                    paidPaymentId: paymentId,
                    updatedAt: new Date(),
                })
                .where(eq(paymentSchedules.id, scheduleId));

            return true;
        } catch (error) {
            console.error('Error linking payment to schedule:', error);
            throw error;
        }
    }

    /**
     * Get payment schedule for a lease
     */
    static async getLeasePaymentSchedule(leaseId: string) {
        try {
            const schedule = await db
                .select()
                .from(paymentSchedules)
                .where(eq(paymentSchedules.leaseId, leaseId))
                .orderBy(paymentSchedules.paymentNumber);

            const now = new Date();

            // Add status to each schedule entry
            const scheduleWithStatus = schedule.map(entry => ({
                ...entry,
                status: this.getPaymentStatus(entry, now),
                amount: parseFloat(entry.amount),
            }));

            return scheduleWithStatus;
        } catch (error) {
            console.error('Error fetching payment schedule:', error);
            throw error;
        }
    }

    /**
     * Determine payment status
     */
    private static getPaymentStatus(
        schedule: any,
        currentDate: Date
    ): 'paid' | 'pending' | 'overdue' | 'upcoming' {
        if (schedule.isPaid) {
            return 'paid';
        }

        const dueDate = new Date(schedule.dueDate);

        if (dueDate > currentDate) {
            return 'upcoming';
        }

        // Give 5 days grace period before marking as overdue
        const gracePeriodEnd = new Date(dueDate);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 5);

        if (currentDate <= gracePeriodEnd) {
            return 'pending';
        }

        return 'overdue';
    }

    /**
     * Get next payment due for a lease
     */
    static async getNextPaymentDue(leaseId: string) {
        try {
            const [nextPayment] = await db
                .select()
                .from(paymentSchedules)
                .where(
                    and(
                        eq(paymentSchedules.leaseId, leaseId),
                        eq(paymentSchedules.isPaid, false)
                    )
                )
                .orderBy(paymentSchedules.paymentNumber)
                .limit(1);

            return nextPayment || null;
        } catch (error) {
            console.error('Error fetching next payment:', error);
            throw error;
        }
    }

    /**
     * Get overdue payments for a lease
     */
    static async getOverduePayments(leaseId: string) {
        try {
            const now = new Date();
            const fiveDaysAgo = new Date();
            fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

            const overduePayments = await db
                .select()
                .from(paymentSchedules)
                .where(
                    and(
                        eq(paymentSchedules.leaseId, leaseId),
                        eq(paymentSchedules.isPaid, false),
                        lte(paymentSchedules.dueDate, fiveDaysAgo)
                    )
                )
                .orderBy(paymentSchedules.paymentNumber);

            return overduePayments.map(p => ({
                ...p,
                amount: parseFloat(p.amount),
                daysOverdue: Math.floor(
                    (now.getTime() - new Date(p.dueDate).getTime()) / (1000 * 60 * 60 * 24)
                ),
            }));
        } catch (error) {
            console.error('Error fetching overdue payments:', error);
            throw error;
        }
    }
}