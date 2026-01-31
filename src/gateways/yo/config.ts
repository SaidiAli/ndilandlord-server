/**
 * Yo! Payments Gateway Configuration
 */

import { config } from "../../domain/config";

export interface YoConfig {
  apiUsername: string;
  apiPassword: string;
  productionUrl: string;
  sandboxUrl: string;
  useSandbox: boolean;
  ipnUrl?: string;
  failureUrl?: string;
  publicKeyPath?: string;
}

/**
 * Load and validate Yo! configuration from environment
 */
export function getYoConfig(): YoConfig {
  const apiUsername = config.yo.apiUsername;
  const apiPassword = config.yo.apiPassword;

  if (!apiUsername || !apiPassword) {
    const missing: string[] = [];
    if (!apiUsername) missing.push('YO_API_USERNAME');
    if (!apiPassword) missing.push('YO_API_PASSWORD');

    throw new Error(
      `Yo! gateway configuration missing: ${missing.join(', ')}`
    );
  }

  return {
    apiUsername,
    apiPassword,
    productionUrl: config.yo.apiUrl!,
    sandboxUrl: config.yo.sandboxUrl!,
    useSandbox: process.env.YO_USE_SANDBOX === 'true',
    ipnUrl: config.yo.ipnUrl,
    failureUrl: config.yo.failureUrl,
    publicKeyPath: config.yo.publicKeyPath,
  };
}

/**
 * Get the API URL based on sandbox setting
 */
export function getApiUrl(config: YoConfig): string {
  return config.useSandbox ? config.sandboxUrl : config.productionUrl;
}
