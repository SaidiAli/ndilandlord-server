/**
 * Gateway Factory
 *
 * Creates and manages payment gateway instances based on configuration.
 * Uses singleton pattern to ensure only one instance per gateway type.
 */

import { GatewayName, PaymentGateway, GatewayError } from './types';
import { IoTecGateway } from './iotec';
import { YoGateway } from './yo';

// Singleton instances
let iotecInstance: IoTecGateway | null = null;
let yoInstance: YoGateway | null = null;

/**
 * Get the configured payment gateway name from environment
 */
export function getConfiguredGateway(): GatewayName {
  const gateway = process.env.PAYMENT_GATEWAY?.toLowerCase() as GatewayName | undefined;

  if (!gateway) {
    return 'yo';
  }

  if (gateway !== 'yo' && gateway !== 'iotec') {
    throw new GatewayError(
      `Invalid PAYMENT_GATEWAY value: '${gateway}'. Must be 'yo' or 'iotec'.`,
      gateway as GatewayName,
      'INVALID_CONFIG'
    );
  }

  return gateway;
}

/**
 * Get the payment gateway instance for a specific gateway type
 */
export function getGatewayByName(name: GatewayName): PaymentGateway {
  switch (name) {
    case 'iotec':
      if (!iotecInstance) {
        iotecInstance = new IoTecGateway();
      }
      return iotecInstance;

    case 'yo':
      if (!yoInstance) {
        yoInstance = new YoGateway();
      }
      return yoInstance;

    default:
      throw new GatewayError(
        `Unknown gateway: ${name}`,
        name,
        'UNKNOWN_GATEWAY'
      );
  }
}

/**
 * Get the currently configured payment gateway instance
 *
 * This is the main function to use for normal operations.
 * It reads PAYMENT_GATEWAY env variable and returns the appropriate gateway.
 *
 * @example
 * ```typescript
 * const gateway = getPaymentGateway();
 * const result = await gateway.deposit({
 *   externalReference: 'TXN-123',
 *   phoneNumber: '256770000000',
 *   amount: 50000,
 *   narrative: 'Rent payment'
 * });
 * ```
 */
export function getPaymentGateway(): PaymentGateway {
  const gatewayName = getConfiguredGateway();
  return getGatewayByName(gatewayName);
}

/**
 * Validate that the configured gateway has all required environment variables
 */
export function validateGatewayConfig(): void {
  const gatewayName = getConfiguredGateway();

  console.log(`[Gateway] Validating configuration for: ${gatewayName}`);

  // Get the gateway instance - this will throw if config is invalid
  const gateway = getGatewayByName(gatewayName);

  console.log(`[Gateway] Configuration valid. Active gateway: ${gateway.getProviderName()}`);
}

/**
 * Reset gateway instances (useful for testing)
 */
export function resetGatewayInstances(): void {
  iotecInstance = null;
  yoInstance = null;
}
