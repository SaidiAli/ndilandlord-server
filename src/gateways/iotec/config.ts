/**
 * IoTec Gateway Configuration
 */

import { config } from "../../domain/config";

export interface IoTecConfig {
  clientId: string;
  clientSecret: string;
  walletId: string;
  authUrl: string;
  baseUrl: string;
}

/**
 * Load and validate IoTec configuration from environment
 */
export function getIoTecConfig(): IoTecConfig {
  const clientId = config.iotec.clientId;
  const clientSecret = config.iotec.clientSecret;
  const walletId = config.iotec.walletId;

  if (!clientId || !clientSecret || !walletId) {
    const missing: string[] = [];
    if (!clientId) missing.push('IOTEC_CLIENT_ID');
    if (!clientSecret) missing.push('IOTEC_CLIENT_SECRET');
    if (!walletId) missing.push('IOTEC_WALLET_ID');

    throw new Error(
      `IoTec gateway configuration missing: ${missing.join(', ')}`
    );
  }

  return {
    clientId,
    clientSecret,
    walletId,
    authUrl: config.iotec.authUrl!,
    baseUrl: config.iotec.baseUrl!,
  };
}
