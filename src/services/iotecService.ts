import { z } from 'zod';

// IoTec API response types (based on documentation)
export interface IoTecAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface IoTecCollectionRequest {
  category: 'MobileMoney';
  currency: string;
  walletId: string;
  externalId: string;
  payer: string; // Phone number
  amount: number;
  payerNote: string;
  payeeNote: string;
  channel?: string | null;
  transactionChargesCategory: 'ChargeWallet' | 'ChargePayer' | 'ChargePayee';
}

export interface IoTecCollectionResponse {
  id: string;
  createdAt: string;
  category: 'MobileMoney';
  status: 'Pending' | 'Success' | 'Failed';
  paymentChannel: 'Api';
  statusCode: string;
  statusMessage: string;
  externalId: string;
  amount: number;
  payerNote: string;
  payeeNote: string;
  currency: string;
  wallet: {
    id: string | null;
    name: string | null;
  };
  chargeModel: string | null;
  createdBy: string;
  transactionCharge: number;
  vendorCharge: number;
  totalTransactionCharge: number;
  vendor: string;
  vendorTransactionId: string | null;
  lastUpdated: string | null;
  processedAt: string | null;
  payer: string;
  payerName: string;
}

// Validation schemas
export const collectionRequestSchema = z.object({
  amount: z.number().min(500, 'Minimum amount is 500'),
  payer: z.string().regex(/^[0-9]{10,12}$/, 'Invalid phone number format'),
  payerNote: z.string().min(1, 'Payer note is required'),
  payeeNote: z.string().min(1, 'Payee note is required'),
  externalId: z.string().min(1, 'External ID is required'),
});

export class IoTecService {
  private static readonly AUTH_URL = 'https://id.iotec.io/connect/token';
  private static readonly BASE_URL = 'https://pay.iotec.io/api';

  private static readonly CLIENT_ID = process.env.IOTEC_CLIENT_ID;
  private static readonly CLIENT_SECRET = process.env.IOTEC_CLIENT_SECRET;
  public static readonly WALLET_ID = process.env.IOTEC_WALLET_ID;

  private static checkCredentials() {
    if (!this.CLIENT_ID || !this.CLIENT_SECRET || !this.WALLET_ID) {
      throw new Error('IoTec credentials (IOTEC_CLIENT_ID, IOTEC_CLIENT_SECRET, IOTEC_WALLET_ID) are missing from environment variables');
    }
  }

  /**
   * Get OAuth access token
   * In a real app, you might want to cache this token until it expires
   */
  static async getAccessToken(): Promise<string> {
    this.checkCredentials();

    const params = new URLSearchParams();
    params.append('client_id', this.CLIENT_ID!);
    params.append('client_secret', this.CLIENT_SECRET!);
    params.append('grant_type', 'client_credentials');

    try {
      const response = await fetch(this.AUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get access token: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as IoTecAuthResponse;
      return data.access_token;
    } catch (error) {
      console.error('IoTec Auth Error:', error);
      throw error;
    }
  }

  /**
   * Initiate mobile money collection
   */
  static async initiateCollection(request: Omit<IoTecCollectionRequest, 'category' | 'currency' | 'walletId' | 'transactionChargesCategory'>): Promise<IoTecCollectionResponse> {
    this.checkCredentials();

    // Validate request
    const validation = collectionRequestSchema.safeParse(request);
    if (!validation.success) {
      throw new Error(`Invalid request: ${validation.error.errors.map(e => e.message).join(', ')}`);
    }

    const token = await this.getAccessToken();

    const payload = {
      ...request,
      category: 'MobileMoney',
      currency: 'UGX',
      walletId: this.WALLET_ID!,
      transactionChargesCategory: 'ChargeWallet',
    };

    try {
      const response = await fetch(`${this.BASE_URL}/collections/collect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to initiate collection: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as IoTecCollectionResponse;
      return data;
    } catch (error) {
      console.error('IoTec Collection Error:', error);
      throw error;
    }
  }

  /**
   * Get transaction status
   */
  static async getTransactionStatus(transactionId: string): Promise<IoTecCollectionResponse | null> {
    this.checkCredentials();
    const token = await this.getAccessToken();

    try {
      const response = await fetch(`${this.BASE_URL}/collections/status/${transactionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        const errorText = await response.text();
        throw new Error(`Failed to get transaction status: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as IoTecCollectionResponse;
      return data;
    } catch (error) {
      console.error('IoTec Status Error:', error);
      throw error;
    }
  }

  /**
   * Get transaction by external ID
   */
  static async getTransactionByExternalId(externalId: string): Promise<IoTecCollectionResponse | null> {
    this.checkCredentials();
    const token = await this.getAccessToken();

    try {
      // Assuming URL structure: api/collections/external-id/{externalId}
      const response = await fetch(`${this.BASE_URL}/collections/external-id/${externalId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        const errorText = await response.text();
        throw new Error(`Failed to get transaction by external ID: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as IoTecCollectionResponse;
      return data;
    } catch (error) {
      console.error('IoTec External ID Lookup Error:', error);
      throw error;
    }
  }
}