/**
 * Payment Gateway Module
 *
 * Multi-gateway abstraction layer supporting Yo! Payments and IoTec.
 *
 * @example
 * ```typescript
 * import { getPaymentGateway } from './gateways';
 *
 * const gateway = getPaymentGateway();
 * const result = await gateway.deposit({
 *   externalReference: 'PAY-123',
 *   phoneNumber: '256770000000',
 *   amount: 50000,
 *   narrative: 'Rent payment'
 * });
 * ```
 */

// Core types and interfaces
export type {
  GatewayName,
  PaymentGateway,
  DepositRequest,
  WithdrawRequest,
  TransactionResult,
  TransactionStatus,
  BalanceResult,
  WebhookPayload,
  GatewayConfig,
} from './types';

export { GatewayError, GatewayNotSupportedError } from './types';

// Gateway factory
export {
  getPaymentGateway,
  getGatewayByName,
  getConfiguredGateway,
  validateGatewayConfig,
  resetGatewayInstances,
} from './gatewayFactory';

// Individual gateways (for direct access if needed)
export { IoTecGateway } from './iotec';
export { YoGateway } from './yo';
