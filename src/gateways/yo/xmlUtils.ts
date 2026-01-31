/**
 * XML Utilities
 *
 * Handles XML request building and response parsing.
 */

import { XMLParser, XMLBuilder } from 'fast-xml-parser';

/**
 * Parameters for building an XML request
 */
interface XmlRequestParams {
  apiUsername: string;
  apiPassword: string;
  method: string;
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Parsed Yo! API response
 */
export interface YoResponse {
  Status: string;
  StatusCode: number;
  StatusMessage?: string;
  ErrorMessage?: string;
  TransactionStatus?: string;
  TransactionReference?: string;
  MNOTransactionReferenceId?: string;
  Amount?: number;
  AmountFormatted?: string;
  CurrencyCode?: string;
  TransactionInitiationDate?: string;
  TransactionCompletionDate?: string;
  IssuedReceiptNumber?: string;
  Balance?: YoBalance;
  raw: unknown;
}

export interface YoBalance {
  Currency: YoCurrency | YoCurrency[];
}

export interface YoCurrency {
  Code: string;
  Balance: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: true,
  format: true,
  suppressEmptyNode: true,
});

/**
 * Build an XML request body
 */
export function buildXmlRequest(params: XmlRequestParams): string {
  const requestObj: Record<string, string | number | boolean> = {
    APIUsername: params.apiUsername,
    APIPassword: params.apiPassword,
    Method: params.method,
  };

  // Add method-specific parameters
  if (params.params) {
    for (const [key, value] of Object.entries(params.params)) {
      if (value !== undefined && value !== null && value !== '') {
        requestObj[key] = value;
      }
    }
  }

  const envelope = {
    AutoCreate: {
      Request: requestObj,
    },
  };

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlBuilder.build(envelope);
  return xml;
}

/**
 * Parse an XML response from Yo! API
 */
export function parseXmlResponse(xml: string): YoResponse {
  try {
    const parsed = xmlParser.parse(xml);

    if (!parsed.AutoCreate?.Response) {
      throw new Error('Invalid Yo! response: missing AutoCreate.Response');
    }

    const response = parsed.AutoCreate.Response;

    return {
      Status: response.Status || 'UNKNOWN',
      StatusCode: parseInt(response.StatusCode, 10) || -1,
      StatusMessage: response.StatusMessage,
      ErrorMessage: response.ErrorMessage,
      TransactionStatus: response.TransactionStatus,
      TransactionReference: response.TransactionReference,
      MNOTransactionReferenceId: response.MNOTransactionReferenceId,
      Amount: response.Amount ? parseFloat(response.Amount) : undefined,
      AmountFormatted: response.AmountFormatted,
      CurrencyCode: response.CurrencyCode,
      TransactionInitiationDate: response.TransactionInitiationDate,
      TransactionCompletionDate: response.TransactionCompletionDate,
      IssuedReceiptNumber: response.IssuedReceiptNumber,
      Balance: response.Balance,
      raw: response,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to parse Yo! XML response: ${message}`);
  }
}

/**
 * Check if response indicates success (StatusCode = 0)
 */
export function isSuccessResponse(response: YoResponse): boolean {
  return response.Status === 'OK' && response.StatusCode === 0;
}

/**
 * Check if response indicates pending (StatusCode = 1)
 */
export function isPendingResponse(response: YoResponse): boolean {
  return response.Status === 'OK' && response.StatusCode === 1;
}

/**
 * Check if response indicates an error
 */
export function isErrorResponse(response: YoResponse): boolean {
  return response.Status === 'ERROR' || response.StatusCode < 0;
}

/**
 * Get error message from response
 */
export function getErrorMessage(response: YoResponse): string {
  return response.ErrorMessage || response.StatusMessage || `Error code: ${response.StatusCode}`;
}
