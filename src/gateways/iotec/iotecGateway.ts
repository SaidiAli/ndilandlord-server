/**
 * IoTec Payment Gateway Implementation
 *
 * Wraps the existing IoTecService to implement the PaymentGateway interface.
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
  GatewayNotSupportedError,
} from '../types';
import { IoTecService, IoTecCollectionResponse } from '../../services/iotecService';
import { getIoTecConfig } from './config';

/**
 * IoTec webhook payload structure
 */
interface IoTecWebhookPayload {
  transactionId: string;
  status: 'Success' | 'Failed' | 'Pending';
  statusMessage?: string;
  vendorTransactionId?: string;
  amount?: number;
  externalId?: string;
}

/**
 * Map IoTec status to normalized TransactionStatus
 */
function mapIoTecStatus(status: string): TransactionStatus {
  switch (status.toLowerCase()) {
    case 'success':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'pending':
      return 'pending';
    default:
      return 'indeterminate';
  }
}

/**
 * Map IoTec collection response to TransactionResult
 */
function mapCollectionResponse(response: IoTecCollectionResponse): TransactionResult {
  return {
    success: response.status !== 'Failed',
    status: mapIoTecStatus(response.status),
    gatewayReference: response.id,
    externalReference: response.externalId,
    mnoReference: response.vendorTransactionId || undefined,
    amount: response.amount,
    currency: response.currency,
    message: response.statusMessage,
    rawResponse: response,
  };
}

export class IoTecGateway implements PaymentGateway {
  private config: ReturnType<typeof getIoTecConfig>;

  constructor() {
    // Validate config on instantiation
    this.config = getIoTecConfig();
    console.log('[IoTecGateway] Initialized with wallet:', this.config.walletId);
  }

  getProviderName(): GatewayName {
    return 'iotec';
  }

  async deposit(request: DepositRequest): Promise<TransactionResult> {
    try {
      // Format phone number for IoTec (expects local format without country code prefix)
      const phoneNumber = this.formatPhoneNumber(request.phoneNumber);

      const response = await IoTecService.initiateCollection({
        externalId: request.externalReference,
        payer: phoneNumber,
        amount: request.amount,
        payerNote: request.narrative,
        payeeNote: request.narrative,
      });

      return mapCollectionResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new GatewayError(
        `IoTec deposit failed: ${message}`,
        'iotec',
        'DEPOSIT_FAILED',
        error
      );
    }
  }

  async withdraw(_request: WithdrawRequest): Promise<TransactionResult> {
    // IoTec does support disbursements, but we're not implementing it
    // per the decision to keep IoTec as deposit-only
    throw new GatewayNotSupportedError('withdraw', 'iotec');
  }

  async checkStatus(reference: string): Promise<TransactionResult> {
    try {
      const response = await IoTecService.getTransactionStatus(reference);

      if (!response) {
        return {
          success: false,
          status: 'indeterminate',
          gatewayReference: reference,
          message: 'Transaction not found',
        };
      }

      return mapCollectionResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new GatewayError(
        `IoTec status check failed: ${message}`,
        'iotec',
        'STATUS_CHECK_FAILED',
        error
      );
    }
  }

  async getBalance(): Promise<BalanceResult[]> {
    // IoTec may not expose balance API directly
    // For now, throw not supported
    throw new GatewayNotSupportedError('getBalance', 'iotec');
  }

  verifyWebhook(_payload: unknown, _signature?: string): boolean {
    // IoTec webhook verification would ideally check a signature
    // For now, we accept all webhooks (should be secured by endpoint obscurity or IP whitelist)
    // TODO: Implement proper verification if IoTec provides a mechanism
    return true;
  }

  parseWebhook(payload: unknown): WebhookPayload {
    const data = payload as IoTecWebhookPayload;

    return {
      type: data.status === 'Success' ? 'success' : 'failure',
      externalReference: data.externalId,
      gatewayReference: data.transactionId,
      mnoReference: data.vendorTransactionId,
      amount: data.amount,
      raw: payload,
    };
  }

  /**
   * Format phone number for IoTec API
   * Converts various formats to 10-digit local format
   */
  private formatPhoneNumber(phone: string): string {
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, '');

    // Handle different formats
    if (cleaned.startsWith('256')) {
      // Remove country code: 256770123456 -> 0770123456
      cleaned = '0' + cleaned.slice(3);
    } else if (cleaned.startsWith('0')) {
      // Already in correct format: 0770123456
    } else if (cleaned.length === 9) {
      // Missing leading zero: 770123456 -> 0770123456
      cleaned = '0' + cleaned;
    }

    return cleaned;
  }
}
