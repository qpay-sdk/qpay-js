import { QPayConfig } from './config.js';
import { QPayError } from './errors.js';
import type {
  TokenResponse,
  CreateInvoiceRequest,
  CreateSimpleInvoiceRequest,
  CreateEbarimtInvoiceRequest,
  InvoiceResponse,
  PaymentDetail,
  PaymentCheckRequest,
  PaymentCheckResponse,
  PaymentListRequest,
  PaymentListResponse,
  PaymentCancelRequest,
  PaymentRefundRequest,
  CreateEbarimtRequest,
  EbarimtResponse,
} from './types.js';

const TOKEN_BUFFER_SECONDS = 30;

// ============================================================================
// camelCase <-> snake_case conversion utilities
// ============================================================================

function camelToSnake(str: string): string {
  // Special handling for known abbreviations and edge cases
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function snakeToCamel(str: string): string {
  // Special case: "not-before-policy" uses hyphens
  if (str.includes('-')) {
    return str.replace(/[-]([a-z])/g, (_, c: string) => c.toUpperCase());
  }
  return str.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function convertKeysToSnakeCase(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToSnakeCase);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Special mappings for known fields
      let snakeKey: string;
      if (key === 'callbackUrl') {
        snakeKey = 'callback_url';
      } else if (key === 'qPayShortUrl') {
        snakeKey = 'qPay_shortUrl';
      } else if (key === 'ibanNumber') {
        snakeKey = 'iban_number';
      } else {
        snakeKey = camelToSnake(key);
      }
      result[snakeKey] = convertKeysToSnakeCase(value);
    }
    return result;
  }
  return obj;
}

function convertKeysToCamelCase(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToCamelCase);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Special mappings for known fields
      let camelKey: string;
      if (key === 'qPay_shortUrl') {
        camelKey = 'qPayShortUrl';
      } else if (key === 'not-before-policy') {
        camelKey = 'notBeforePolicy';
      } else if (key === 'iban_number') {
        camelKey = 'ibanNumber';
      } else {
        camelKey = snakeToCamel(key);
      }
      result[camelKey] = convertKeysToCamelCase(value);
    }
    return result;
  }
  return obj;
}

// ============================================================================
// QPayClient
// ============================================================================

/**
 * QPay V2 API client with automatic token management.
 *
 * Uses the native `fetch` API (Node.js 18+ / browsers).
 */
export class QPayClient {
  private config: QPayConfig;
  private accessToken = '';
  private _refreshToken = '';
  private expiresAt = 0;
  private refreshExpiresAt = 0;

  // Simple mutex using promise chaining for token refresh serialization
  private tokenPromise: Promise<void> | null = null;

  constructor(config: QPayConfig) {
    this.config = config;
  }

  // --------------------------------------------------------------------------
  // Auth
  // --------------------------------------------------------------------------

  /**
   * Authenticate with QPay using Basic Auth and return a new token pair.
   * Stores the tokens internally for subsequent requests.
   */
  async getToken(): Promise<TokenResponse> {
    const token = await this.getTokenRequest();
    this.storeToken(token);
    return token;
  }

  /**
   * Use the current refresh token to obtain a new access token.
   * Stores the tokens internally for subsequent requests.
   */
  async refreshToken(): Promise<TokenResponse> {
    const token = await this.doRefreshTokenHTTP(this._refreshToken);
    this.storeToken(token);
    return token;
  }

  // --------------------------------------------------------------------------
  // Invoice
  // --------------------------------------------------------------------------

  /**
   * Create a detailed invoice with full options.
   * POST /v2/invoice
   */
  async createInvoice(req: CreateInvoiceRequest): Promise<InvoiceResponse> {
    return this.doRequest<InvoiceResponse>('POST', '/v2/invoice', req);
  }

  /**
   * Create a simple invoice with minimal fields.
   * POST /v2/invoice
   */
  async createSimpleInvoice(req: CreateSimpleInvoiceRequest): Promise<InvoiceResponse> {
    return this.doRequest<InvoiceResponse>('POST', '/v2/invoice', req);
  }

  /**
   * Create an invoice with ebarimt (tax) information.
   * POST /v2/invoice
   */
  async createEbarimtInvoice(req: CreateEbarimtInvoiceRequest): Promise<InvoiceResponse> {
    return this.doRequest<InvoiceResponse>('POST', '/v2/invoice', req);
  }

  /**
   * Cancel an existing invoice by ID.
   * DELETE /v2/invoice/{id}
   */
  async cancelInvoice(invoiceId: string): Promise<void> {
    await this.doRequest('DELETE', `/v2/invoice/${invoiceId}`);
  }

  // --------------------------------------------------------------------------
  // Payment
  // --------------------------------------------------------------------------

  /**
   * Retrieve payment details by payment ID.
   * GET /v2/payment/{id}
   */
  async getPayment(paymentId: string): Promise<PaymentDetail> {
    return this.doRequest<PaymentDetail>('GET', `/v2/payment/${paymentId}`);
  }

  /**
   * Check if a payment has been made for an invoice.
   * POST /v2/payment/check
   */
  async checkPayment(req: PaymentCheckRequest): Promise<PaymentCheckResponse> {
    return this.doRequest<PaymentCheckResponse>('POST', '/v2/payment/check', req);
  }

  /**
   * Return a list of payments matching the given criteria.
   * POST /v2/payment/list
   */
  async listPayments(req: PaymentListRequest): Promise<PaymentListResponse> {
    return this.doRequest<PaymentListResponse>('POST', '/v2/payment/list', req);
  }

  /**
   * Cancel a payment (card transactions only).
   * DELETE /v2/payment/cancel/{id}
   */
  async cancelPayment(paymentId: string, req?: PaymentCancelRequest): Promise<void> {
    await this.doRequest('DELETE', `/v2/payment/cancel/${paymentId}`, req);
  }

  /**
   * Refund a payment (card transactions only).
   * DELETE /v2/payment/refund/{id}
   */
  async refundPayment(paymentId: string, req?: PaymentRefundRequest): Promise<void> {
    await this.doRequest('DELETE', `/v2/payment/refund/${paymentId}`, req);
  }

  // --------------------------------------------------------------------------
  // Ebarimt
  // --------------------------------------------------------------------------

  /**
   * Create an ebarimt (electronic tax receipt) for a payment.
   * POST /v2/ebarimt_v3/create
   */
  async createEbarimt(req: CreateEbarimtRequest): Promise<EbarimtResponse> {
    return this.doRequest<EbarimtResponse>('POST', '/v2/ebarimt_v3/create', req);
  }

  /**
   * Cancel an ebarimt by payment ID.
   * DELETE /v2/ebarimt_v3/{id}
   */
  async cancelEbarimt(paymentId: string): Promise<EbarimtResponse> {
    return this.doRequest<EbarimtResponse>('DELETE', `/v2/ebarimt_v3/${paymentId}`);
  }

  // --------------------------------------------------------------------------
  // Internal: Token management
  // --------------------------------------------------------------------------

  private async ensureToken(): Promise<void> {
    // Serialize token refresh to avoid concurrent refreshes
    if (this.tokenPromise) {
      await this.tokenPromise;
      // After waiting, check if the token is now valid
      const now = Math.floor(Date.now() / 1000);
      if (this.accessToken && now < this.expiresAt - TOKEN_BUFFER_SECONDS) {
        return;
      }
    }

    const now = Math.floor(Date.now() / 1000);

    // Access token still valid
    if (this.accessToken && now < this.expiresAt - TOKEN_BUFFER_SECONDS) {
      return;
    }

    // Determine strategy: refresh or full auth
    const canRefresh = this._refreshToken && now < this.refreshExpiresAt - TOKEN_BUFFER_SECONDS;

    const refreshWork = async (): Promise<void> => {
      if (canRefresh) {
        try {
          const token = await this.doRefreshTokenHTTP(this._refreshToken);
          this.storeToken(token);
          return;
        } catch {
          // Refresh failed, fall through to get new token
        }
      }

      // Both expired or no tokens, get new token
      try {
        const token = await this.getTokenRequest();
        this.storeToken(token);
      } catch (err) {
        throw new Error(`failed to get token: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    this.tokenPromise = refreshWork();
    try {
      await this.tokenPromise;
    } finally {
      this.tokenPromise = null;
    }
  }

  private storeToken(token: TokenResponse): void {
    this.accessToken = token.accessToken;
    this._refreshToken = token.refreshToken;
    this.expiresAt = token.expiresIn;
    this.refreshExpiresAt = token.refreshExpiresIn;
  }

  // --------------------------------------------------------------------------
  // Internal: HTTP helpers
  // --------------------------------------------------------------------------

  private async getTokenRequest(): Promise<TokenResponse> {
    return this.doBasicAuthRequest<TokenResponse>('POST', '/v2/auth/token');
  }

  private async doRefreshTokenHTTP(refreshTok: string): Promise<TokenResponse> {
    const url = `${this.config.baseUrl}/v2/auth/refresh`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${refreshTok}`,
      },
    });

    const respBody = await resp.text();

    if (!resp.ok) {
      let code = '';
      let message = '';
      try {
        const parsed = JSON.parse(respBody) as Record<string, unknown>;
        code = (parsed.error as string) ?? '';
        message = (parsed.message as string) ?? '';
      } catch {
        // ignore parse errors
      }
      throw new QPayError(resp.status, code || resp.statusText, message || respBody, respBody);
    }

    const raw = JSON.parse(respBody) as unknown;
    return convertKeysToCamelCase(raw) as TokenResponse;
  }

  private async doRequest<T = void>(method: string, path: string, body?: unknown): Promise<T> {
    await this.ensureToken();

    const url = `${this.config.baseUrl}${path}`;

    const init: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
    };

    if (body !== undefined && body !== null) {
      init.body = JSON.stringify(convertKeysToSnakeCase(body));
    }

    const resp = await fetch(url, init);
    const respBody = await resp.text();

    if (!resp.ok) {
      let code = '';
      let message = '';
      try {
        const parsed = JSON.parse(respBody) as Record<string, unknown>;
        code = (parsed.error as string) ?? '';
        message = (parsed.message as string) ?? '';
      } catch {
        // ignore parse errors
      }
      if (!code) code = resp.statusText;
      if (!message) message = respBody;
      throw new QPayError(resp.status, code, message, respBody);
    }

    if (!respBody) {
      return undefined as T;
    }

    const raw = JSON.parse(respBody) as unknown;
    return convertKeysToCamelCase(raw) as T;
  }

  private async doBasicAuthRequest<T>(method: string, path: string): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;

    const credentials = btoa(`${this.config.username}:${this.config.password}`);

    const resp = await fetch(url, {
      method,
      headers: {
        'Authorization': `Basic ${credentials}`,
      },
    });

    const respBody = await resp.text();

    if (!resp.ok) {
      let code = '';
      let message = '';
      try {
        const parsed = JSON.parse(respBody) as Record<string, unknown>;
        code = (parsed.error as string) ?? '';
        message = (parsed.message as string) ?? '';
      } catch {
        // ignore parse errors
      }
      if (!code) code = resp.statusText;
      if (!message) message = respBody;
      throw new QPayError(resp.status, code, message, respBody);
    }

    const raw = JSON.parse(respBody) as unknown;
    return convertKeysToCamelCase(raw) as T;
  }
}
