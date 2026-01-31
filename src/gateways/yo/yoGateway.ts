/**
 * Yo! Payments Gateway Implementation
 *
 * Implements the PaymentGateway interface for Yo! Payments.
 */

import {
  PaymentGateway,
  GatewayName,
  DepositRequest,
  WithdrawRequest,
  TransactionResult,
  TransactionStatus,
  BalanceResult,
  WebhookPayload,
  GatewayError,
} from '../types';
import { YoConfig, getYoConfig } from './config';
import { YoApiClient } from './apiClient';
import { YoResponse, YoCurrency, isPendingResponse, isSuccessResponse } from './xmlUtils';
import {
  initWebhookVerifier,
  verifyIpnSignature,
  verifyFailureSignature,
  IpnPayload,
  FailurePayload,
} from './webhookVerifier';

/**
 * Map Yo! transaction status to normalized TransactionStatus
 */
function mapYoStatus(response: YoResponse): TransactionStatus {
  // Check StatusCode first for pending
  if (isPendingResponse(response)) {
    return 'pending';
  }

  // Check TransactionStatus field
  const txStatus = response.TransactionStatus?.toUpperCase();

  switch (txStatus) {
    case 'SUCCEEDED':
      return 'succeeded';
    case 'FAILED':
      return 'failed';
    case 'PENDING':
      return 'pending';
    case 'INDETERMINATE':
      return 'indeterminate';
    default:
      // If Status is OK and StatusCode is 0, treat as succeeded
      if (isSuccessResponse(response)) {
        return 'succeeded';
      }
      return 'indeterminate';
  }
}

/**
 * Map Yo! response to TransactionResult
 */
function mapYoResponse(response: YoResponse, externalRef?: string): TransactionResult {
  const status = mapYoStatus(response);

  return {
    success: status !== 'failed',
    status,
    gatewayReference: response.TransactionReference || '',
    externalReference: externalRef,
    mnoReference: response.MNOTransactionReferenceId,
    amount: response.Amount,
    currency: response.CurrencyCode || 'UGX',
    message: response.StatusMessage || `Status: ${response.TransactionStatus || response.Status}`,
    rawResponse: response.raw,
  };
}

export class YoGateway implements PaymentGateway {
  private config: YoConfig;
  private client: YoApiClient;

  constructor() {
    this.config = getYoConfig();
    this.client = new YoApiClient(this.config);

    // Initialize webhook verifier with public key
    initWebhookVerifier(this.config.publicKeyPath);
  }

  getProviderName(): GatewayName {
    return 'yo';
  }

  async deposit(request: DepositRequest): Promise<TransactionResult> {
    try {
      const phoneNumber = this.formatPhoneNumber(request.phoneNumber);

      const response = await this.client.depositFunds({
        amount: request.amount,
        account: phoneNumber,
        narrative: request.narrative,
        externalReference: request.externalReference,
        instantNotificationUrl: request.successCallbackUrl,
        failureNotificationUrl: request.failureCallbackUrl,
      });

      return mapYoResponse(response, request.externalReference);
    } catch (error) {
      if (error instanceof GatewayError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new GatewayError(
        `Yo! deposit failed: ${message}`,
        'yo',
        'DEPOSIT_FAILED',
        error
      );
    }
  }

  async withdraw(request: WithdrawRequest): Promise<TransactionResult> {
    try {
      const phoneNumber = this.formatPhoneNumber(request.phoneNumber);

      const response = await this.client.withdrawFunds({
        amount: request.amount,
        account: phoneNumber,
        narrative: request.narrative,
        externalReference: request.externalReference,
      });

      return mapYoResponse(response, request.externalReference);
    } catch (error) {
      if (error instanceof GatewayError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new GatewayError(
        `Yo! withdraw failed: ${message}`,
        'yo',
        'WITHDRAW_FAILED',
        error
      );
    }
  }

  async checkStatus(reference: string): Promise<TransactionResult> {
    try {
      const response = await this.client.checkTransactionStatus(reference);
      return mapYoResponse(response);
    } catch (error) {
      if (error instanceof GatewayError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new GatewayError(
        `Yo! status check failed: ${message}`,
        'yo',
        'STATUS_CHECK_FAILED',
        error
      );
    }
  }

  async getBalance(): Promise<BalanceResult[]> {
    try {
      const response = await this.client.getAccountBalance();

      if (!response.Balance?.Currency) {
        return [];
      }

      // Handle single or multiple currencies
      const currencies = Array.isArray(response.Balance.Currency)
        ? response.Balance.Currency
        : [response.Balance.Currency];

      return currencies.map((c: YoCurrency) => ({
        currency: c.Code,
        amount: parseFloat(c.Balance),
      }));
    } catch (error) {
      if (error instanceof GatewayError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new GatewayError(
        `Yo! balance check failed: ${message}`,
        'yo',
        'BALANCE_CHECK_FAILED',
        error
      );
    }
  }

  verifyWebhook(payload: unknown, _signature?: string): boolean {
    const data = payload as Record<string, string>;

    // Detect webhook type and verify accordingly
    if (data.signature && data.external_ref) {
      // IPN (success) webhook
      return verifyIpnSignature(data as unknown as IpnPayload);
    } else if (data.verification && data.failed_transaction_reference) {
      // Failure webhook
      return verifyFailureSignature(data as unknown as FailurePayload);
    }

    // Unknown payload format
    console.warn('[YoGateway] Unknown webhook payload format:', Object.keys(data));
    return false;
  }

  parseWebhook(payload: unknown): WebhookPayload {
    const data = payload as Record<string, string>;

    // IPN (success) webhook
    if (data.signature && data.external_ref) {
      const ipn = data as unknown as IpnPayload;
      return {
        type: 'success',
        externalReference: ipn.external_ref,
        mnoReference: ipn.network_ref,
        amount: parseFloat(ipn.amount),
        phoneNumber: ipn.msisdn,
        timestamp: ipn.date_time,
        raw: payload,
      };
    }

    // Failure webhook
    if (data.verification && data.failed_transaction_reference) {
      const failure = data as unknown as FailurePayload;
      return {
        type: 'failure',
        externalReference: failure.failed_transaction_reference,
        timestamp: failure.transaction_init_date,
        raw: payload,
      };
    }

    // Unknown format
    return {
      type: 'failure',
      raw: payload,
    };
  }

  /**
   * Format phone number for Yo! API
   * Yo! expects format: 256XXXXXXXXX (country code + 9 digits)
   */
  private formatPhoneNumber(phone: string): string {
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, '');

    // Handle different formats
    if (cleaned.startsWith('256') && cleaned.length === 12) {
      // Already correct format
      return cleaned;
    } else if (cleaned.startsWith('0') && cleaned.length === 10) {
      // Local format: 0770123456 -> 256770123456
      return '256' + cleaned.slice(1);
    } else if (cleaned.length === 9) {
      // Missing leading zero: 770123456 -> 256770123456
      return '256' + cleaned;
    }

    // Return as-is if format is unclear (API will validate)
    return cleaned;
  }
}
