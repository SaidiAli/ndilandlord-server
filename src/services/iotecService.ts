import crypto from 'crypto';
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
  currency: 'UGX';
  walletId: string;
  externalId: string;
  payer: string; // Phone number
  amount: number;
  payerNote: string;
  payeeNote: string;
  channel?: string | null;
  transactionChargesCategory: 'ChargeWallet';
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
  currency: 'UGX';
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
  amount: z.number().min(1000, 'Minimum amount is UGX 1,000'),
  payer: z.string().regex(/^[0-9]{10,12}$/, 'Invalid phone number format'),
  payerNote: z.string().min(1, 'Payer note is required'),
  payeeNote: z.string().min(1, 'Payee note is required'),
  externalId: z.string().min(1, 'External ID is required'),
});

export class IoTecService {
  private static readonly CLIENT_ID = process.env.IOTEC_CLIENT_ID || 'mock_client_id';
  private static readonly CLIENT_SECRET = process.env.IOTEC_CLIENT_SECRET || 'mock_client_secret';
  private static readonly WALLET_ID = process.env.IOTEC_WALLET_ID || '5e83b187-801e-410e-b76e-f491928547e0';
  private static readonly BASE_URL = process.env.IOTEC_BASE_URL || 'https://pay.iotec.io';
  
  // In-memory storage for mock transactions (in production, use Redis or database)
  private static transactions: Map<string, IoTecCollectionResponse> = new Map();

  /**
   * Mock OAuth token generation
   */
  static async getAccessToken(): Promise<IoTecAuthResponse> {
    // Simulate API delay
    await this.delay(200);

    // Generate mock JWT token
    const mockToken = this.generateMockJWT();

    return {
      access_token: mockToken,
      expires_in: 3600, // 1 hour
      token_type: 'Bearer',
      scope: 'profile email',
    };
  }

  /**
   * Initiate mobile money collection
   */
  static async initiateCollection(request: IoTecCollectionRequest): Promise<IoTecCollectionResponse> {
    // Validate request
    const validation = collectionRequestSchema.safeParse(request);
    if (!validation.success) {
      throw new Error(`Invalid request: ${validation.error.errors.map(e => e.message).join(', ')}`);
    }

    // Simulate API delay
    await this.delay(500);

    // Generate transaction ID
    const transactionId = crypto.randomUUID();
    
    // Calculate transaction charges (mock calculation)
    const transactionCharge = Math.ceil(request.amount * 0.02); // 2% charge
    const vendorCharge = Math.ceil(request.amount * 0.015); // 1.5% vendor charge
    const totalTransactionCharge = transactionCharge + vendorCharge;

    // Generate mock payer name
    const payerName = this.generateMockPayerName(request.payer);

    const response: IoTecCollectionResponse = {
      id: transactionId,
      createdAt: new Date().toISOString(),
      category: 'MobileMoney',
      status: 'Pending',
      paymentChannel: 'Api',
      statusCode: 'pending',
      statusMessage: 'Request is being processed',
      externalId: request.externalId,
      amount: request.amount,
      payerNote: request.payerNote,
      payeeNote: request.payeeNote,
      currency: 'UGX',
      wallet: {
        id: this.WALLET_ID,
        name: 'Verit Wallet',
      },
      chargeModel: null,
      createdBy: 'system',
      transactionCharge,
      vendorCharge,
      totalTransactionCharge,
      vendor: 'MTN_Uganda',
      vendorTransactionId: null,
      lastUpdated: null,
      processedAt: null,
      payer: request.payer,
      payerName,
    };

    // Store transaction for status tracking
    this.transactions.set(transactionId, response);

    // Schedule automatic status update (simulate processing time)
    this.scheduleStatusUpdate(transactionId);

    return response;
  }

  /**
   * Get transaction status
   */
  static async getTransactionStatus(transactionId: string): Promise<IoTecCollectionResponse | null> {
    // Simulate API delay
    await this.delay(100);

    const transaction = this.transactions.get(transactionId);
    return transaction || null;
  }

  /**
   * Get transaction by external ID
   */
  static async getTransactionByExternalId(externalId: string): Promise<IoTecCollectionResponse | null> {
    // Simulate API delay
    await this.delay(100);

    // Find transaction by external ID
    for (const [, transaction] of this.transactions) {
      if (transaction.externalId === externalId) {
        return transaction;
      }
    }

    return null;
  }

  /**
   * Generate mock JWT token
   */
  private static generateMockJWT(): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    const payload = {
      sub: this.CLIENT_ID,
      name: 'Verit System',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      scope: 'collections disbursements',
    };

    // Mock JWT (not cryptographically secure, just for simulation)
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.CLIENT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  /**
   * Generate mock payer name based on phone number
   */
  private static generateMockPayerName(phoneNumber: string): string {
    const names = [
      'John Doe', 'Jane Smith', 'David Wilson', 'Sarah Johnson', 'Michael Brown',
      'Emily Davis', 'James Miller', 'Maria Garcia', 'Robert Taylor', 'Lisa Anderson',
      'Mukasa Joseph', 'Nakamura Sarah', 'Okello David', 'Namuli Grace', 'Kato James'
    ];
    
    // Use phone number to consistently generate same name
    const hash = crypto.createHash('sha256').update(phoneNumber).digest('hex');
    const index = parseInt(hash.slice(0, 8), 16) % names.length;
    return names[index];
  }

  /**
   * Schedule automatic status update for transaction
   */
  private static scheduleStatusUpdate(transactionId: string): void {
    // Simulate processing time (30-90 seconds)
    const processingTime = Math.random() * 60000 + 30000; // 30-90 seconds

    setTimeout(() => {
      const transaction = this.transactions.get(transactionId);
      if (!transaction) return;

      // 90% success rate, 10% failure rate
      const isSuccess = Math.random() > 0.1;
      
      const updatedTransaction: IoTecCollectionResponse = {
        ...transaction,
        status: isSuccess ? 'Success' : 'Failed',
        statusCode: isSuccess ? 'success' : 'failed',
        statusMessage: isSuccess 
          ? 'Payment completed successfully' 
          : 'Payment failed - insufficient funds or user cancelled',
        lastUpdated: new Date().toISOString(),
        processedAt: new Date().toISOString(),
        vendorTransactionId: isSuccess ? `MTN${Date.now()}${Math.random().toString(36).substr(2, 9)}` : null,
      };

      this.transactions.set(transactionId, updatedTransaction);
    }, processingTime);
  }

  /**
   * Utility method to simulate API delays
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear old transactions (cleanup method)
   */
  static clearOldTransactions(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    for (const [transactionId, transaction] of this.transactions) {
      const createdAt = new Date(transaction.createdAt).getTime();
      if (createdAt < oneHourAgo) {
        this.transactions.delete(transactionId);
      }
    }
  }

  /**
   * Get transaction statistics (for monitoring)
   */
  static getTransactionStats(): {
    total: number;
    pending: number;
    success: number;
    failed: number;
  } {
    let total = 0;
    let pending = 0;
    let success = 0;
    let failed = 0;

    for (const [, transaction] of this.transactions) {
      total++;
      switch (transaction.status) {
        case 'Pending':
          pending++;
          break;
        case 'Success':
          success++;
          break;
        case 'Failed':
          failed++;
          break;
      }
    }

    return { total, pending, success, failed };
  }
}

// Schedule cleanup every hour
setInterval(() => {
  IoTecService.clearOldTransactions();
}, 60 * 60 * 1000);