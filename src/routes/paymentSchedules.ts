import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { PaymentScheduleController } from '../controllers/paymentScheduleController';

const router = Router();

// Get payment schedules (filtered by leaseId)
// Accessible by landlords and tenants (with ownership checks in controller)
router.get('/', authenticate, PaymentScheduleController.getSchedules);

export default router;
