import { db } from '../db';
import { paymentSchedules, leases } from '../db/schema';
import { and, eq, lte, asc } from 'drizzle-orm';

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
     * Calculate payment periods for a lease, including proration for the first and last months.
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

        let current = new Date(leaseStart);

        while (current < leaseEnd) {
            const year = current.getFullYear();
            const month = current.getMonth();

            const periodStart = new Date(current);
            let periodEnd = new Date(year, month + 1, 0);
            periodEnd.setHours(23, 59, 59, 999); // End of day

            if (periodEnd > leaseEnd) {
                periodEnd = new Date(leaseEnd);
            }

            let amount = monthlyRent;

            // Proration for the first month
            if (current.getTime() === leaseStart.getTime() && leaseStart.getDate() !== 1) {
                const daysInMonth = this.getDaysInMonth(year, month);
                const daysInPeriod = daysInMonth - leaseStart.getDate() + 1;
                amount = (monthlyRent / daysInMonth) * daysInPeriod;
            }
            
            // Proration for the last month
            const nextMonthStart = new Date(year, month + 1, 1);
            if (nextMonthStart > leaseEnd) {
                const daysInMonth = this.getDaysInMonth(year, month);
                const daysInPeriod = leaseEnd.getDate();
                if (daysInPeriod < daysInMonth) {
                    amount = (monthlyRent / daysInMonth) * daysInPeriod;
                }
            }

            let dueDate = new Date(year, month, paymentDay);
            if (dueDate < periodStart) {
                dueDate.setMonth(dueDate.getMonth() + 1);
            }


            periods.push({
                dueDate,
                amount: Math.round(amount * 100) / 100, // Round to 2 decimal places
                periodStart,
                periodEnd,
            });

            current = new Date(year, month + 1, 1);
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
                .orderBy(asc(paymentSchedules.paymentNumber))
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
            fiveDaysAgo.setDate(now.getDate() - 5);

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
                .orderBy(asc(paymentSchedules.paymentNumber));

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