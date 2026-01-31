/**
 * Payment Gateway Abstraction Layer
 *
 * This module defines the interfaces and types for a multi-gateway payment system.
 * Supports Yo! Payments (primary) and IoTec (secondary) gateways.
 */

// Gateway identifiers
export type GatewayName = 'yo' | 'iotec';

/**
 * Transaction status normalized across all gateways
 */
export type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'indeterminate';

/**
 * Request to initiate a deposit
 */
export interface DepositRequest {
  externalReference: string;
  phoneNumber: string;
  amount: number;
  narrative: string;
  successCallbackUrl?: string;
  failureCallbackUrl?: string;
  metadata?: Record<string, string>;
}

/**
 * Request to initiate a withdrawal
 */
export interface WithdrawRequest {
  externalReference: string;
  phoneNumber: string;
  amount: number;
  narrative: string;
  metadata?: Record<string, string>;
}

/**
 * Standardized result from any gateway operation
 */
export interface TransactionResult {
  success: boolean;
  status: TransactionStatus;
  gatewayReference: string;
  externalReference?: string;
  mnoReference?: string;
  amount?: number;
  currency?: string;
  message?: string;
  error?: string;
  rawResponse?: unknown;
}

/**
 * Account balance information
 */
export interface BalanceResult {
  currency: string;
  amount: number;
}

/**
 * Base webhook payload structure
 */
export interface WebhookPayload {
  type: 'success' | 'failure';
  externalReference?: string;
  gatewayReference?: string;
  mnoReference?: string;
  amount?: number;
  phoneNumber?: string;
  timestamp?: string;
  raw: unknown;
}

/**
 * Gateway-specific configuration
 */
export interface GatewayConfig {
  name: GatewayName;
  enabled: boolean;
  useSandbox: boolean;
}

/**
 * Main Payment Gateway Interface
 *
 * All gateway implementations must implement this interface.
 */
export interface PaymentGateway {
  /**
   * Initiate a deposit/collection from a customer's mobile money account
   * @param request Deposit request details
   * @returns Transaction result with gateway reference
   */
  deposit(request: DepositRequest): Promise<TransactionResult>;

  /**
   * Initiate a withdrawal/disbursement to a customer's mobile money account
   * Note: Not all gateways support withdrawals
   * @param request Withdrawal request details
   * @returns Transaction result with gateway reference
   */
  withdraw(request: WithdrawRequest): Promise<TransactionResult>;

  /**
   * Check the status of a transaction
   * @param reference Gateway's transaction reference
   * @returns Current transaction status
   */
  checkStatus(reference: string): Promise<TransactionResult>;

  /**
   * Get the current account balance(s)
   * @returns Array of balances (may include multiple currencies)
   */
  getBalance(): Promise<BalanceResult[]>;

  /**
   * Verify a webhook/IPN payload is authentic
   * @param payload Raw webhook payload
   * @param signature Optional signature header
   * @returns Whether the webhook is valid
   */
  verifyWebhook(payload: unknown, signature?: string): boolean;

  /**
   * Parse a webhook payload into a standardized format
   * @param payload Raw webhook payload
   * @returns Parsed webhook data
   */
  parseWebhook(payload: unknown): WebhookPayload;

  /**
   * Get the gateway provider name
   * @returns Gateway identifier
   */
  getProviderName(): GatewayName;
}

/**
 * Error thrown when gateway operation fails
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly gateway: GatewayName,
    public readonly code?: string,
    public readonly rawResponse?: unknown
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

/**
 * Error thrown when gateway doesn't support an operation
 */
export class GatewayNotSupportedError extends GatewayError {
  constructor(operation: string, gateway: GatewayName) {
    super(`Operation '${operation}' is not supported by ${gateway} gateway`, gateway, 'NOT_SUPPORTED');
    this.name = 'GatewayNotSupportedError';
  }
}
