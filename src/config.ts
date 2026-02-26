/**
 * Configuration for the QPay client.
 */
export interface QPayConfig {
  baseUrl: string;
  username: string;
  password: string;
  invoiceCode: string;
  callbackUrl: string;
}

/**
 * Load QPay configuration from environment variables.
 *
 * Required environment variables:
 * - QPAY_BASE_URL
 * - QPAY_USERNAME
 * - QPAY_PASSWORD
 * - QPAY_INVOICE_CODE
 * - QPAY_CALLBACK_URL
 *
 * @throws Error if any required environment variable is not set.
 */
export function loadConfigFromEnv(): QPayConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  const env: Record<string, string | undefined> =
    typeof g.process !== 'undefined' && g.process.env ? g.process.env : {};

  const config: QPayConfig = {
    baseUrl: env.QPAY_BASE_URL ?? '',
    username: env.QPAY_USERNAME ?? '',
    password: env.QPAY_PASSWORD ?? '',
    invoiceCode: env.QPAY_INVOICE_CODE ?? '',
    callbackUrl: env.QPAY_CALLBACK_URL ?? '',
  };

  const required: Record<string, string> = {
    QPAY_BASE_URL: config.baseUrl,
    QPAY_USERNAME: config.username,
    QPAY_PASSWORD: config.password,
    QPAY_INVOICE_CODE: config.invoiceCode,
    QPAY_CALLBACK_URL: config.callbackUrl,
  };

  for (const [name, val] of Object.entries(required)) {
    if (!val) {
      throw new Error(`required environment variable ${name} is not set`);
    }
  }

  return config;
}
