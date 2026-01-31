/**
 * Yo! Payments Webhook Verification
 *
 * Verifies IPN and failure notification signatures using RSA-SHA1.
 */

import crypto from 'crypto';
import fs from 'fs';

let publicKey: string | null = null;

/**
 * Load Yo! public key from file
 */
function loadPublicKey(keyPath?: string): string | null {
  if (!keyPath) {
    console.warn('[YoWebhook] No public key path configured, signature verification disabled');
    return null;
  }

  try {
    if (!fs.existsSync(keyPath)) {
      console.warn(`[YoWebhook] Public key file not found: ${keyPath}`);
      return null;
    }

    publicKey = fs.readFileSync(keyPath, 'utf8');
    console.log('[YoWebhook] Public key loaded successfully');
    return publicKey;
  } catch (error) {
    console.error('[YoWebhook] Failed to load public key:', error);
    return null;
  }
}

/**
 * Initialize webhook verifier with public key
 */
export function initWebhookVerifier(keyPath?: string): void {
  publicKey = loadPublicKey(keyPath);
}

/**
 * Verify an RSA-SHA1 signature
 */
function verifySignature(data: string, signatureBase64: string): boolean {
  if (!publicKey) {
    console.warn('[YoWebhook] No public key available, skipping verification');
    return true; // Allow if no key configured (dev mode)
  }

  try {
    const signature = Buffer.from(signatureBase64, 'base64');
    const verify = crypto.createVerify('RSA-SHA1');
    verify.update(data);
    verify.end();

    return verify.verify(publicKey, signature);
  } catch (error) {
    console.error('[YoWebhook] Signature verification error:', error);
    return false;
  }
}

/**
 * IPN (Instant Payment Notification) payload structure
 */
export interface IpnPayload {
  date_time: string;
  amount: string;
  narrative: string;
  network_ref: string;
  external_ref: string;
  msisdn: string;
  payer_names?: string;
  payer_email?: string;
  signature: string;
}

/**
 * Verify IPN (success notification) signature
 *
 * Concatenation order: date_time + amount + narrative + network_ref + external_ref + msisdn
 */
export function verifyIpnSignature(payload: IpnPayload): boolean {
  const dataToVerify = [
    payload.date_time || '',
    payload.amount || '',
    payload.narrative || '',
    payload.network_ref || '',
    payload.external_ref || '',
    payload.msisdn || '',
  ].join('');

  console.log('[YoWebhook] IPN verification data:', dataToVerify);

  return verifySignature(dataToVerify, payload.signature);
}

/**
 * Failure notification payload structure
 */
export interface FailurePayload {
  failed_transaction_reference: string;
  transaction_init_date: string;
  verification: string;
}

/**
 * Verify failure notification signature
 *
 * Concatenation order: failed_transaction_reference + transaction_init_date
 */
export function verifyFailureSignature(payload: FailurePayload): boolean {
  const dataToVerify = [
    payload.failed_transaction_reference || '',
    payload.transaction_init_date || '',
  ].join('');

  console.log('[YoWebhook] Failure verification data:', dataToVerify);

  return verifySignature(dataToVerify, payload.verification);
}

/**
 * Check if the verifier has a public key loaded
 */
export function hasPublicKey(): boolean {
  return publicKey !== null;
}
