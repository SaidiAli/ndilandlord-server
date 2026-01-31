import dotenv from 'dotenv';

dotenv.config();

export const config = {
  database: {
    url: process.env.DATABASE_URL,
    poolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
  },
  // Payment gateway selection: 'yo' or 'iotec'
  paymentGateway: (process.env.PAYMENT_GATEWAY || 'yo') as 'yo' | 'iotec',
  // IoTec gateway configuration
  iotec: {
    baseUrl: process.env.IOTEC_BASE_URL,
    authUrl: process.env.IOTEC_AUTH_URL,
    clientId: process.env.IOTEC_CLIENT_ID,
    clientSecret: process.env.IOTEC_CLIENT_SECRET,
    walletId: process.env.IOTEC_WALLET_ID,
  },
  // Yo! Payments gateway configuration
  yo: {
    apiUsername: process.env.YO_API_USERNAME,
    apiPassword: process.env.YO_API_PASSWORD,
    apiUrl: process.env.YO_API_URL,
    sandboxUrl: process.env.YO_SANDBOX_URL,
    useSandbox: process.env.YO_USE_SANDBOX === 'true',
    ipnUrl: process.env.YO_IPN_URL,
    failureUrl: process.env.YO_FAILURE_URL,
    publicKeyPath: process.env.YO_PUBLIC_KEY_PATH,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN,
  }
};

export const getString = () => {

}

export const getStringOrThrow = () => {
  
}