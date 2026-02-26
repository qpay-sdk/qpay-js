import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QPayClient } from '../src/client.js';
import { QPayError } from '../src/errors.js';
import type { QPayConfig } from '../src/config.js';

// ============================================================================
// Helpers
// ============================================================================

const TEST_CONFIG: QPayConfig = {
  baseUrl: 'https://merchant.qpay.mn',
  username: 'test_user',
  password: 'test_pass',
  invoiceCode: 'TEST_INVOICE',
  callbackUrl: 'https://example.com/callback',
};

/** Timestamp far in the future (so tokens are considered valid). */
const FUTURE_TS = Math.floor(Date.now() / 1000) + 3600;

/** A standard token response from the QPay API (snake_case as returned by the API). */
function makeTokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    token_type: 'Bearer',
    refresh_expires_in: FUTURE_TS,
    refresh_token: 'refresh_tok_123',
    access_token: 'access_tok_123',
    expires_in: FUTURE_TS,
    scope: 'profile',
    'not-before-policy': '0',
    session_state: 'session_abc',
    ...overrides,
  };
}

/** Create a mock Response object from a body and status. */
function mockResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    clone: () => mockResponse(body, status, statusText),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    json: async () => JSON.parse(text),
    text: async () => text,
    bytes: async () => new Uint8Array(),
  } as Response;
}

/**
 * Helper to set up a client that already has a valid token.
 * Mocks getToken on the first call, then allows subsequent calls to use the token.
 */
function createAuthenticatedClient(): { client: QPayClient; fetchMock: ReturnType<typeof vi.fn> } {
  const fetchMock = vi.fn();
  // First call: getToken (basic auth)
  fetchMock.mockResolvedValueOnce(mockResponse(makeTokenResponse()));
  vi.stubGlobal('fetch', fetchMock);
  const client = new QPayClient(TEST_CONFIG);
  return { client, fetchMock };
}

// ============================================================================
// Tests
// ============================================================================

describe('QPayClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --------------------------------------------------------------------------
  // Auth: getToken
  // --------------------------------------------------------------------------

  describe('getToken', () => {
    it('should authenticate with Basic Auth and return a camelCase token', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(mockResponse(makeTokenResponse()));
      vi.stubGlobal('fetch', fetchMock);

      const client = new QPayClient(TEST_CONFIG);
      const token = await client.getToken();

      // Verify fetch was called with Basic Auth
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://merchant.qpay.mn/v2/auth/token');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toMatch(/^Basic /);

      // Verify credentials encoding
      const expectedCreds = btoa('test_user:test_pass');
      expect(init.headers.Authorization).toBe(`Basic ${expectedCreds}`);

      // Verify camelCase conversion
      expect(token.accessToken).toBe('access_tok_123');
      expect(token.refreshToken).toBe('refresh_tok_123');
      expect(token.tokenType).toBe('Bearer');
      expect(token.expiresIn).toBe(FUTURE_TS);
      expect(token.refreshExpiresIn).toBe(FUTURE_TS);
      expect(token.scope).toBe('profile');
      expect(token.notBeforePolicy).toBe('0');
      expect(token.sessionState).toBe('session_abc');
    });

    it('should throw QPayError on auth failure', async () => {
      const errorBody = { error: 'AUTHENTICATION_FAILED', message: 'Bad credentials' };
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(errorBody, 401, 'Unauthorized'));
      vi.stubGlobal('fetch', fetchMock);

      const client = new QPayClient(TEST_CONFIG);
      await expect(client.getToken()).rejects.toThrow(QPayError);

      // Calling again should also throw
      await expect(client.getToken()).rejects.toThrow(QPayError);
    });
  });

  // --------------------------------------------------------------------------
  // Auth: refreshToken
  // --------------------------------------------------------------------------

  describe('refreshToken', () => {
    it('should use the refresh token with Bearer auth', async () => {
      const fetchMock = vi.fn();
      // First: getToken
      fetchMock.mockResolvedValueOnce(mockResponse(makeTokenResponse()));
      // Second: refreshToken
      fetchMock.mockResolvedValueOnce(
        mockResponse(makeTokenResponse({ access_token: 'new_access_tok', refresh_token: 'new_refresh_tok' }))
      );
      vi.stubGlobal('fetch', fetchMock);

      const client = new QPayClient(TEST_CONFIG);
      await client.getToken();

      const refreshed = await client.refreshToken();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe('https://merchant.qpay.mn/v2/auth/refresh');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer refresh_tok_123');

      expect(refreshed.accessToken).toBe('new_access_tok');
      expect(refreshed.refreshToken).toBe('new_refresh_tok');
    });

    it('should throw QPayError when refresh fails', async () => {
      const fetchMock = vi.fn();
      // First: getToken
      fetchMock.mockResolvedValueOnce(mockResponse(makeTokenResponse()));
      // Second: refresh fails
      fetchMock.mockResolvedValueOnce(mockResponse({ error: 'TOKEN_EXPIRED', message: 'Refresh token expired' }, 401));
      vi.stubGlobal('fetch', fetchMock);

      const client = new QPayClient(TEST_CONFIG);
      await client.getToken();

      await expect(client.refreshToken()).rejects.toThrow(QPayError);
    });
  });

  // --------------------------------------------------------------------------
  // Auto token refresh (ensureToken)
  // --------------------------------------------------------------------------

  describe('auto token management', () => {
    it('should automatically get a token before making API calls', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      // Second call: the actual API request
      fetchMock.mockResolvedValueOnce(mockResponse({ invoice_id: 'INV001', qr_text: 'qr', qr_image: 'img', 'qPay_shortUrl': 'url', urls: [] }));

      const result = await client.createSimpleInvoice({
        invoiceCode: 'TEST',
        senderInvoiceNo: '001',
        invoiceReceiverCode: 'RCV',
        invoiceDescription: 'Test invoice',
        amount: 1000,
        callbackUrl: 'https://example.com/cb',
      });

      // Should have called fetch twice: getToken + createInvoice
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.invoiceId).toBe('INV001');
    });

    it('should reuse a valid token without re-authenticating', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      // Two subsequent API calls
      fetchMock.mockResolvedValueOnce(mockResponse({ invoice_id: 'INV001', qr_text: 'qr', qr_image: 'img', 'qPay_shortUrl': 'url', urls: [] }));
      fetchMock.mockResolvedValueOnce(mockResponse({ invoice_id: 'INV002', qr_text: 'qr', qr_image: 'img', 'qPay_shortUrl': 'url', urls: [] }));

      await client.createSimpleInvoice({
        invoiceCode: 'TEST', senderInvoiceNo: '001', invoiceReceiverCode: 'RCV',
        invoiceDescription: 'Test', amount: 1000, callbackUrl: 'https://example.com/cb',
      });

      await client.createSimpleInvoice({
        invoiceCode: 'TEST', senderInvoiceNo: '002', invoiceReceiverCode: 'RCV',
        invoiceDescription: 'Test', amount: 2000, callbackUrl: 'https://example.com/cb',
      });

      // getToken (1) + first invoice (2) + second invoice (3) = 3 calls
      // No extra getToken because the token is still valid
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should re-authenticate when token is expired', async () => {
      const pastTS = Math.floor(Date.now() / 1000) - 100;
      const fetchMock = vi.fn();
      // First: getToken with expired timestamps
      fetchMock.mockResolvedValueOnce(mockResponse(makeTokenResponse({
        expires_in: pastTS,
        refresh_expires_in: pastTS,
      })));
      // Second: auto re-auth getToken
      fetchMock.mockResolvedValueOnce(mockResponse(makeTokenResponse()));
      // Third: actual API call
      fetchMock.mockResolvedValueOnce(mockResponse({ count: 0, rows: [] }));
      vi.stubGlobal('fetch', fetchMock);

      const client = new QPayClient(TEST_CONFIG);
      await client.getToken();

      const result = await client.checkPayment({ objectType: 'INVOICE', objectId: 'INV001' });

      expect(result.count).toBe(0);
      // getToken (1) + re-auth getToken (2) + checkPayment (3) = 3 calls
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should attempt refresh when access token expired but refresh token is valid', async () => {
      const pastTS = Math.floor(Date.now() / 1000) - 100;
      const fetchMock = vi.fn();
      // First: getToken with expired access but valid refresh
      fetchMock.mockResolvedValueOnce(mockResponse(makeTokenResponse({
        expires_in: pastTS,
        refresh_expires_in: FUTURE_TS,
      })));
      // Second: refresh token call
      fetchMock.mockResolvedValueOnce(mockResponse(makeTokenResponse({ access_token: 'refreshed_tok' })));
      // Third: actual API call
      fetchMock.mockResolvedValueOnce(mockResponse({ count: 0, rows: [] }));
      vi.stubGlobal('fetch', fetchMock);

      const client = new QPayClient(TEST_CONFIG);
      await client.getToken();

      await client.checkPayment({ objectType: 'INVOICE', objectId: 'INV001' });

      // getToken (1) + refreshToken (2) + checkPayment (3) = 3 calls
      expect(fetchMock).toHaveBeenCalledTimes(3);
      // Verify the refresh call used Bearer auth
      const [refreshUrl, refreshInit] = fetchMock.mock.calls[1];
      expect(refreshUrl).toBe('https://merchant.qpay.mn/v2/auth/refresh');
      expect(refreshInit.headers.Authorization).toBe('Bearer refresh_tok_123');
    });

    it('should fall back to full auth when refresh fails', async () => {
      const pastTS = Math.floor(Date.now() / 1000) - 100;
      const fetchMock = vi.fn();
      // First: getToken with expired access but valid refresh
      fetchMock.mockResolvedValueOnce(mockResponse(makeTokenResponse({
        expires_in: pastTS,
        refresh_expires_in: FUTURE_TS,
      })));
      // Second: refresh token fails
      fetchMock.mockResolvedValueOnce(mockResponse({ error: 'TOKEN_EXPIRED' }, 401));
      // Third: fallback getToken
      fetchMock.mockResolvedValueOnce(mockResponse(makeTokenResponse({ access_token: 'new_after_fallback' })));
      // Fourth: actual API call
      fetchMock.mockResolvedValueOnce(mockResponse({ count: 0, rows: [] }));
      vi.stubGlobal('fetch', fetchMock);

      const client = new QPayClient(TEST_CONFIG);
      await client.getToken();

      const result = await client.checkPayment({ objectType: 'INVOICE', objectId: 'INV001' });

      expect(result.count).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  // --------------------------------------------------------------------------
  // Invoice methods
  // --------------------------------------------------------------------------

  describe('createInvoice', () => {
    it('should POST to /v2/invoice with snake_case body and return camelCase response', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse({
        invoice_id: 'INV123',
        qr_text: 'qr_data',
        qr_image: 'base64_image',
        'qPay_shortUrl': 'https://qpay.mn/s/abc',
        urls: [{ name: 'Khan Bank', description: 'desc', logo: 'logo.png', link: 'khanbank://pay' }],
      }));

      const result = await client.createInvoice({
        invoiceCode: 'TEST',
        senderInvoiceNo: '001',
        invoiceReceiverCode: 'RCV',
        invoiceDescription: 'Full invoice',
        amount: 5000,
        callbackUrl: 'https://example.com/cb',
      });

      expect(result.invoiceId).toBe('INV123');
      expect(result.qrText).toBe('qr_data');
      expect(result.qrImage).toBe('base64_image');
      expect(result.qPayShortUrl).toBe('https://qpay.mn/s/abc');
      expect(result.urls).toHaveLength(1);
      expect(result.urls[0].name).toBe('Khan Bank');

      // Verify the request body was sent in snake_case
      const [, init] = fetchMock.mock.calls[1];
      const body = JSON.parse(init.body as string);
      expect(body.invoice_code).toBe('TEST');
      expect(body.sender_invoice_no).toBe('001');
      expect(body.invoice_receiver_code).toBe('RCV');
      expect(body.callback_url).toBe('https://example.com/cb');
    });
  });

  describe('createSimpleInvoice', () => {
    it('should POST to /v2/invoice with minimal fields', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse({
        invoice_id: 'INV_SIMPLE',
        qr_text: 'qr',
        qr_image: 'img',
        'qPay_shortUrl': 'url',
        urls: [],
      }));

      const result = await client.createSimpleInvoice({
        invoiceCode: 'TEST',
        senderInvoiceNo: '002',
        invoiceReceiverCode: 'RCV',
        invoiceDescription: 'Simple',
        amount: 100,
        callbackUrl: 'https://example.com/cb',
      });

      expect(result.invoiceId).toBe('INV_SIMPLE');

      const [url] = fetchMock.mock.calls[1];
      expect(url).toBe('https://merchant.qpay.mn/v2/invoice');
    });
  });

  describe('createEbarimtInvoice', () => {
    it('should POST to /v2/invoice with ebarimt fields', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse({
        invoice_id: 'INV_EBARIMT',
        qr_text: 'qr',
        qr_image: 'img',
        'qPay_shortUrl': 'url',
        urls: [],
      }));

      const result = await client.createEbarimtInvoice({
        invoiceCode: 'TEST',
        senderInvoiceNo: '003',
        invoiceReceiverCode: 'RCV',
        invoiceDescription: 'Ebarimt invoice',
        taxType: 'CITIZEN',
        districtCode: 'UB',
        callbackUrl: 'https://example.com/cb',
        lines: [{
          lineDescription: 'Item 1',
          lineQuantity: '1',
          lineUnitPrice: '5000',
        }],
      });

      expect(result.invoiceId).toBe('INV_EBARIMT');
    });
  });

  describe('cancelInvoice', () => {
    it('should send DELETE to /v2/invoice/{id}', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse('', 200));

      await client.cancelInvoice('INV123');

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe('https://merchant.qpay.mn/v2/invoice/INV123');
      expect(init.method).toBe('DELETE');
    });
  });

  // --------------------------------------------------------------------------
  // Payment methods
  // --------------------------------------------------------------------------

  describe('getPayment', () => {
    it('should send GET to /v2/payment/{id} and return camelCase detail', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse({
        payment_id: 'PAY001',
        payment_status: 'PAID',
        payment_fee: '0',
        payment_amount: '1000',
        payment_currency: 'MNT',
        payment_date: '2026-01-15',
        payment_wallet: 'QPAY',
        transaction_type: 'P2P',
        object_type: 'INVOICE',
        object_id: 'INV001',
        card_transactions: [],
        p2p_transactions: [],
      }));

      const result = await client.getPayment('PAY001');

      expect(result.paymentId).toBe('PAY001');
      expect(result.paymentStatus).toBe('PAID');
      expect(result.paymentAmount).toBe('1000');
      expect(result.paymentCurrency).toBe('MNT');
      expect(result.transactionType).toBe('P2P');

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe('https://merchant.qpay.mn/v2/payment/PAY001');
      expect(init.method).toBe('GET');
    });
  });

  describe('checkPayment', () => {
    it('should POST to /v2/payment/check', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse({
        count: 1,
        paid_amount: 1000,
        rows: [{
          payment_id: 'PAY001',
          payment_status: 'PAID',
          payment_amount: '1000',
          trx_fee: '0',
          payment_currency: 'MNT',
          payment_wallet: 'QPAY',
          payment_type: 'P2P',
          card_transactions: [],
          p2p_transactions: [],
        }],
      }));

      const result = await client.checkPayment({
        objectType: 'INVOICE',
        objectId: 'INV001',
        offset: { pageNumber: 1, pageLimit: 10 },
      });

      expect(result.count).toBe(1);
      expect(result.paidAmount).toBe(1000);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].paymentId).toBe('PAY001');

      // Verify snake_case request body
      const [, init] = fetchMock.mock.calls[1];
      const body = JSON.parse(init.body as string);
      expect(body.object_type).toBe('INVOICE');
      expect(body.object_id).toBe('INV001');
      expect(body.offset.page_number).toBe(1);
      expect(body.offset.page_limit).toBe(10);
    });
  });

  describe('listPayments', () => {
    it('should POST to /v2/payment/list', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse({
        count: 0,
        rows: [],
      }));

      const result = await client.listPayments({
        objectType: 'INVOICE',
        objectId: 'INV001',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        offset: { pageNumber: 1, pageLimit: 20 },
      });

      expect(result.count).toBe(0);
      expect(result.rows).toEqual([]);

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe('https://merchant.qpay.mn/v2/payment/list');
      expect(init.method).toBe('POST');
    });
  });

  describe('cancelPayment', () => {
    it('should send DELETE to /v2/payment/cancel/{id}', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse('', 200));

      await client.cancelPayment('PAY001', {
        callbackUrl: 'https://example.com/cancel-cb',
        note: 'Customer requested',
      });

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe('https://merchant.qpay.mn/v2/payment/cancel/PAY001');
      expect(init.method).toBe('DELETE');
      const body = JSON.parse(init.body as string);
      expect(body.callback_url).toBe('https://example.com/cancel-cb');
      expect(body.note).toBe('Customer requested');
    });

    it('should work without optional request body', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse('', 200));

      await client.cancelPayment('PAY001');

      const [, init] = fetchMock.mock.calls[1];
      expect(init.body).toBeUndefined();
    });
  });

  describe('refundPayment', () => {
    it('should send DELETE to /v2/payment/refund/{id}', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse('', 200));

      await client.refundPayment('PAY001', {
        callbackUrl: 'https://example.com/refund-cb',
        note: 'Refund reason',
      });

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe('https://merchant.qpay.mn/v2/payment/refund/PAY001');
      expect(init.method).toBe('DELETE');
    });

    it('should work without optional request body', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse('', 200));

      await client.refundPayment('PAY001');

      const [, init] = fetchMock.mock.calls[1];
      expect(init.body).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Ebarimt methods
  // --------------------------------------------------------------------------

  describe('createEbarimt', () => {
    it('should POST to /v2/ebarimt_v3/create', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse({
        id: 'EB001',
        ebarimt_by: 'MERCHANT',
        g_wallet_id: 'W001',
        g_wallet_customer_id: 'C001',
        ebarimt_receiver_type: 'CITIZEN',
        ebarimt_receiver: '',
        ebarimt_district_code: 'UB',
        ebarimt_bill_type: 'B2C',
        g_merchant_id: 'M001',
        merchant_branch_code: 'BR001',
        merchant_register_no: '1234567',
        g_payment_id: 'PAY001',
        paid_by: 'CUSTOMER',
        object_type: 'INVOICE',
        object_id: 'INV001',
        amount: '1000',
        vat_amount: '100',
        city_tax_amount: '10',
        ebarimt_qr_data: 'qr_data',
        ebarimt_lottery: 'LOTTERY',
        barimt_status: 'CREATED',
        barimt_status_date: '2026-01-15',
        ebarimt_receiver_phone: '99001122',
        tax_type: 'CITIZEN',
        created_by: 'system',
        created_date: '2026-01-15',
        updated_by: 'system',
        updated_date: '2026-01-15',
        status: true,
      }));

      const result = await client.createEbarimt({
        paymentId: 'PAY001',
        ebarimtReceiverType: 'CITIZEN',
        districtCode: 'UB',
      });

      expect(result.id).toBe('EB001');
      expect(result.ebarimtReceiverType).toBe('CITIZEN');
      expect(result.amount).toBe('1000');
      expect(result.status).toBe(true);

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe('https://merchant.qpay.mn/v2/ebarimt_v3/create');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.payment_id).toBe('PAY001');
      expect(body.ebarimt_receiver_type).toBe('CITIZEN');
    });
  });

  describe('cancelEbarimt', () => {
    it('should send DELETE to /v2/ebarimt_v3/{id}', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse({
        id: 'EB001',
        ebarimt_by: 'MERCHANT',
        g_wallet_id: 'W001',
        g_wallet_customer_id: 'C001',
        ebarimt_receiver_type: 'CITIZEN',
        ebarimt_receiver: '',
        ebarimt_district_code: 'UB',
        ebarimt_bill_type: 'B2C',
        g_merchant_id: 'M001',
        merchant_branch_code: 'BR001',
        merchant_register_no: '1234567',
        g_payment_id: 'PAY001',
        paid_by: 'CUSTOMER',
        object_type: 'INVOICE',
        object_id: 'INV001',
        amount: '1000',
        vat_amount: '100',
        city_tax_amount: '10',
        ebarimt_qr_data: 'qr_data',
        ebarimt_lottery: 'LOTTERY',
        barimt_status: 'CANCELLED',
        barimt_status_date: '2026-01-15',
        ebarimt_receiver_phone: '99001122',
        tax_type: 'CITIZEN',
        created_by: 'system',
        created_date: '2026-01-15',
        updated_by: 'system',
        updated_date: '2026-01-15',
        status: false,
      }));

      const result = await client.cancelEbarimt('PAY001');

      expect(result.barimtStatus).toBe('CANCELLED');

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe('https://merchant.qpay.mn/v2/ebarimt_v3/PAY001');
      expect(init.method).toBe('DELETE');
    });
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    it('should throw QPayError with parsed error fields on API error', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(
        mockResponse({ error: 'INVOICE_NOTFOUND', message: 'Invoice not found' }, 404, 'Not Found')
      );

      try {
        await client.getPayment('NONEXISTENT');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(QPayError);
        const qpayErr = err as QPayError;
        expect(qpayErr.statusCode).toBe(404);
        expect(qpayErr.code).toBe('INVOICE_NOTFOUND');
        expect(qpayErr.rawBody).toContain('INVOICE_NOTFOUND');
      }
    });

    it('should use statusText as code when error field is missing', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(
        mockResponse('Server error', 500, 'Internal Server Error')
      );

      try {
        await client.getPayment('PAY001');
        expect.fail('Should have thrown');
      } catch (err) {
        const qpayErr = err as QPayError;
        expect(qpayErr.statusCode).toBe(500);
        expect(qpayErr.code).toBe('Internal Server Error');
      }
    });

    it('should handle non-JSON error responses gracefully', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(
        mockResponse('<html>Bad Gateway</html>', 502, 'Bad Gateway')
      );

      try {
        await client.getPayment('PAY001');
        expect.fail('Should have thrown');
      } catch (err) {
        const qpayErr = err as QPayError;
        expect(qpayErr.statusCode).toBe(502);
        expect(qpayErr.rawBody).toContain('Bad Gateway');
      }
    });

    it('should throw an error when initial auth fails during ensureToken', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({ error: 'AUTH_FAILED', message: 'Bad credentials' }, 401)
      );
      vi.stubGlobal('fetch', fetchMock);

      const client = new QPayClient(TEST_CONFIG);

      await expect(
        client.createSimpleInvoice({
          invoiceCode: 'TEST',
          senderInvoiceNo: '001',
          invoiceReceiverCode: 'RCV',
          invoiceDescription: 'Test',
          amount: 1000,
          callbackUrl: 'https://example.com/cb',
        })
      ).rejects.toThrow('failed to get token');
    });
  });

  // --------------------------------------------------------------------------
  // Request body conversion (camelCase -> snake_case)
  // --------------------------------------------------------------------------

  describe('request body snake_case conversion', () => {
    it('should convert callbackUrl to callback_url (special mapping)', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse({
        invoice_id: 'INV', qr_text: '', qr_image: '', 'qPay_shortUrl': '', urls: [],
      }));

      await client.createSimpleInvoice({
        invoiceCode: 'TEST',
        senderInvoiceNo: '001',
        invoiceReceiverCode: 'RCV',
        invoiceDescription: 'Test',
        amount: 1000,
        callbackUrl: 'https://example.com/cb',
      });

      const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
      expect(body.callback_url).toBe('https://example.com/cb');
      expect(body.invoice_code).toBe('TEST');
      expect(body.sender_invoice_no).toBe('001');
    });

    it('should send Authorization Bearer header on authenticated requests', async () => {
      const { client, fetchMock } = createAuthenticatedClient();
      fetchMock.mockResolvedValueOnce(mockResponse({ count: 0, rows: [] }));

      await client.checkPayment({ objectType: 'INVOICE', objectId: 'INV001' });

      const [, init] = fetchMock.mock.calls[1];
      expect(init.headers.Authorization).toBe('Bearer access_tok_123');
      expect(init.headers['Content-Type']).toBe('application/json');
    });
  });
});
