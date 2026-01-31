/**
 * Yo! Payments API Client
 *
 * Low-level HTTP client for Yo! Payments XML API.
 */

import { YoConfig, getApiUrl } from './config';
import {
  buildXmlRequest,
  parseXmlResponse,
  YoResponse,
  isErrorResponse,
  getErrorMessage,
} from './xmlUtils';
import { GatewayError } from '../types';

const HTTP_TIMEOUT = 30000;

/**
 * Deposit funds request parameters
 */
export interface DepositFundsParams {
  amount: number;
  account: string;
  narrative: string;
  externalReference?: string;
  providerReferenceText?: string;
  instantNotificationUrl?: string;
  failureNotificationUrl?: string;
}

/**
 * Withdraw funds request parameters
 */
export interface WithdrawFundsParams {
  amount: number;
  account: string;
  narrative: string;
  externalReference?: string;
  providerReferenceText?: string;
  nonBlocking?: boolean;
}

/**
 * Yo! API Client
 */
export class YoApiClient {
  private config: YoConfig;
  private apiUrl: string;

  constructor(config: YoConfig) {
    this.config = config;
    this.apiUrl = getApiUrl(config);
  }

  /**
   * Make an API request
   */
  private async makeRequest(method: string, params?: Record<string, string | number | boolean | undefined>): Promise<YoResponse> {
    const xml = buildXmlRequest({
      apiUsername: this.config.apiUsername,
      apiPassword: this.config.apiPassword,
      method,
      params,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          'Content-transfer-encoding': 'text',
        },
        body: xml,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new GatewayError(
          `Yo! API HTTP error: ${response.status} ${response.statusText}`,
          'yo',
          'HTTP_ERROR'
        );
      }

      const responseText = await response.text();

      const parsed = parseXmlResponse(responseText);

      if (isErrorResponse(parsed)) {
        throw new GatewayError(
          `Yo! API error: ${getErrorMessage(parsed)}`,
          'yo',
          `YO_${parsed.StatusCode}`,
          parsed.raw
        );
      }

      return parsed;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof GatewayError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayError(
          'Yo! API request timeout',
          'yo',
          'TIMEOUT'
        );
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new GatewayError(
        `Yo! API request failed: ${message}`,
        'yo',
        'REQUEST_FAILED',
        error
      );
    }
  }

  /**
   * Initiate a deposit
   * Uses NonBlocking=TRUE for async processing with IPN callback
   */
  async depositFunds(params: DepositFundsParams): Promise<YoResponse> {
    return this.makeRequest('acdepositfunds', {
      NonBlocking: 'TRUE',
      Amount: params.amount,
      Account: params.account,
      Narrative: params.narrative,
      ExternalReference: params.externalReference,
      ProviderReferenceText: params.providerReferenceText,
      InstantNotificationUrl: params.instantNotificationUrl || this.config.ipnUrl,
      FailureNotificationUrl: params.failureNotificationUrl || this.config.failureUrl,
    });
  }

  /**
   * Initiate a withdrawal
   */
  async withdrawFunds(params: WithdrawFundsParams): Promise<YoResponse> {
    return this.makeRequest('acwithdrawfunds', {
      Amount: params.amount,
      Account: params.account,
      Narrative: params.narrative,
      ExternalReference: params.externalReference,
      ProviderReferenceText: params.providerReferenceText,
      NonBlocking: params.nonBlocking ? 'TRUE' : undefined,
    });
  }

  /**
   * Check transaction status by Yo! reference
   */
  async checkTransactionStatus(transactionReference: string): Promise<YoResponse> {
    return this.makeRequest('actransactioncheckstatus', {
      TransactionReference: transactionReference,
    });
  }

  /**
   * Check transaction status by external (private) reference
   */
  async checkTransactionStatusByExternalRef(externalReference: string): Promise<YoResponse> {
    return this.makeRequest('actransactioncheckstatus', {
      PrivateTransactionReference: externalReference,
    });
  }

  /**
   * Get account balance
   */
  async getAccountBalance(): Promise<YoResponse> {
    return this.makeRequest('acacctbalance');
  }
}
