import { db } from '../db';
import { paymentSchedules, leases, payments, paymentSchedulePayments } from '../db/schema';
import { and, eq, lte, asc, sum, sql } from 'drizzle-orm';

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
            // If lease has no end date (open lease), generate schedule for 1 year initially
            const startDate = new Date(lease.startDate);
            let endDate: Date;

            if (lease.endDate) {
                endDate = new Date(lease.endDate);
            } else {
                endDate = new Date(startDate);
                endDate.setFullYear(endDate.getFullYear() + 1);
            }

            const scheduleEntries = this.calculatePaymentPeriods(
                startDate,
                endDate,
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
     * Link a payment to its schedule with amount applied
     */
    static async linkPaymentToSchedule(paymentId: string, scheduleId: string, amountApplied?: number) {
        try {
            // Get schedule and payment info to determine amount
            const [schedule] = await db
                .select()
                .from(paymentSchedules)
                .where(eq(paymentSchedules.id, scheduleId))
                .limit(1);

            if (!schedule) {
                throw new Error('Payment schedule not found');
            }

            const [payment] = await db
                .select()
                .from(payments)
                .where(eq(payments.id, paymentId))
                .limit(1);

            if (!payment) {
                throw new Error('Payment not found');
            }

            // Determine amount to apply
            const scheduleAmount = parseFloat(schedule.amount);
            const paymentAmount = parseFloat(payment.amount);
            const amountToApply = amountApplied || Math.min(paymentAmount, scheduleAmount);

            // Insert into junction table
            await db.insert(paymentSchedulePayments).values({
                paymentId,
                scheduleId,
                amountApplied: amountToApply.toString(),
            });

            // Calculate total paid amount for this schedule
            const paidAmountResult = await db
                .select({ total: sum(paymentSchedulePayments.amountApplied) })
                .from(paymentSchedulePayments)
                .where(eq(paymentSchedulePayments.scheduleId, scheduleId));

            const totalPaid = parseFloat(paidAmountResult[0]?.total || '0');

            // Update isPaid flag if fully paid
            const isPaid = totalPaid >= scheduleAmount - 0.01;
            await db
                .update(paymentSchedules)
                .set({
                    isPaid,
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

            // Get total paid amount for each schedule
            const scheduleIds = schedule.map(s => s.id);
            let paidAmounts: Record<string, number> = {};

            if (scheduleIds.length > 0) {
                // Fetch all payments applied to these schedules
                const junctionRecords = await db
                    .select({
                        scheduleId: paymentSchedulePayments.scheduleId,
                        amountApplied: paymentSchedulePayments.amountApplied,
                    })
                    .from(paymentSchedulePayments)
                    .innerJoin(payments, eq(paymentSchedulePayments.paymentId, payments.id))
                    .where(
                        and(
                            sql`${paymentSchedulePayments.scheduleId} IN (${sql.join(scheduleIds.map(id => sql`${id}`), sql`, `)})`,
                            eq(payments.status, 'completed')
                        )
                    );

                // Aggregate amounts by schedule
                junctionRecords.forEach(record => {
                    if (!paidAmounts[record.scheduleId]) {
                        paidAmounts[record.scheduleId] = 0;
                    }
                    paidAmounts[record.scheduleId] += parseFloat(record.amountApplied);
                });
            }

            const now = new Date();

            // Add status to each schedule entry
            const scheduleWithStatus = schedule.map(entry => {
                const amount = parseFloat(entry.amount);
                const paid = paidAmounts[entry.id] || 0;

                return {
                    ...entry,
                    amount,
                    paidAmount: paid,
                    status: this.getPaymentStatus(entry, now, paid, amount),
                };
            });

            return scheduleWithStatus;
        } catch (error) {
            console.error('Error fetching payment schedule:', error);
            throw error;
        }
    }

    static getPaymentLinkedSchedules = async (paymentId: string) => {
        const schedules = await db
            .select({
                scheduleId: paymentSchedulePayments.scheduleId,
                amountApplied: paymentSchedulePayments.amountApplied,
                paymentNumber: paymentSchedules.paymentNumber,
                periodStart: paymentSchedules.periodStart,
                periodEnd: paymentSchedules.periodEnd,
                scheduledAmount: paymentSchedules.amount,
            })
            .from(paymentSchedulePayments)
            .innerJoin(paymentSchedules, eq(paymentSchedulePayments.scheduleId, paymentSchedules.id))
            .where(eq(paymentSchedulePayments.paymentId, paymentId));

        return schedules.map(s => ({
            scheduleId: s.scheduleId,
            paymentNumber: s.paymentNumber,
            amountApplied: parseFloat(s.amountApplied),
            scheduledAmount: parseFloat(s.scheduledAmount),
            period: `${new Date(s.periodStart).toLocaleDateString()} - ${new Date(s.periodEnd).toLocaleDateString()}`,
        }));
    }

    /**
     * Determine payment status
     */
    private static getPaymentStatus(
        schedule: any,
        currentDate: Date,
        paidAmount: number,
        totalAmount: number
    ): 'paid' | 'pending' | 'overdue' | 'upcoming' | 'partial' {

        // If explicitly marked as paid or paid amount covers total
        if (schedule.isPaid || paidAmount >= totalAmount - 0.01) {
            return 'paid';
        }

        if (paidAmount > 0) {
            return 'partial';
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
     * Apply a partial payment to a schedule
     */
    static async applyPartialPayment(paymentId: string, scheduleId: string, amount: number) {
        try {
            const [schedule] = await db
                .select()
                .from(paymentSchedules)
                .where(eq(paymentSchedules.id, scheduleId))
                .limit(1);

            if (!schedule) {
                throw new Error('Payment schedule not found');
            }

            // Get current paid amount for this schedule
            const paidAmountResult = await db
                .select({ total: sum(paymentSchedulePayments.amountApplied) })
                .from(paymentSchedulePayments)
                .where(eq(paymentSchedulePayments.scheduleId, scheduleId));

            const currentPaid = parseFloat(paidAmountResult[0]?.total || '0');
            const scheduleAmount = parseFloat(schedule.amount);
            const remaining = scheduleAmount - currentPaid;

            if (remaining <= 0.01) {
                throw new Error('Payment schedule is already fully paid');
            }

            const amountToApply = Math.min(amount, remaining);

            // Insert junction record
            await db.insert(paymentSchedulePayments).values({
                paymentId,
                scheduleId,
                amountApplied: amountToApply.toString(),
            });

            // Update isPaid flag if now fully paid
            const newTotal = currentPaid + amountToApply;
            if (newTotal >= scheduleAmount - 0.01) {
                await db
                    .update(paymentSchedules)
                    .set({
                        isPaid: true,
                        updatedAt: new Date(),
                    })
                    .where(eq(paymentSchedules.id, scheduleId));
            }

            return {
                amountApplied: amountToApply,
                remainingOnSchedule: scheduleAmount - newTotal,
            };
        } catch (error) {
            console.error('Error applying partial payment:', error);
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