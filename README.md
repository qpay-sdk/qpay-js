# qpay-js

[![CI](https://github.com/qpay-sdk/qpay-js/actions/workflows/ci.yml/badge.svg)](https://github.com/qpay-sdk/qpay-js/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/qpay-js.svg)](https://www.npmjs.com/package/qpay-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

TypeScript/JavaScript client library for the QPay V2 payment API. Works in Node.js (18+) and modern browsers.

## Installation

```bash
npm install qpay-js
```

## Quick Start

```typescript
import { QPayClient, loadConfigFromEnv } from 'qpay-js';

// Load config from environment variables
const config = loadConfigFromEnv();
const client = new QPayClient(config);

// Create an invoice
const invoice = await client.createSimpleInvoice({
  invoiceCode: 'TEST_INVOICE',
  senderInvoiceNo: 'ORDER-001',
  invoiceReceiverCode: 'terminal',
  invoiceDescription: 'Payment for Order #001',
  amount: 10000,
  callbackUrl: 'https://example.com/api/qpay/callback',
});

console.log(invoice.invoiceId);    // "abc123..."
console.log(invoice.qPayShortUrl); // "https://qpay.mn/s/..."
console.log(invoice.qrImage);      // base64-encoded QR image
```

## Configuration

### From environment variables

Set the following environment variables, then call `loadConfigFromEnv()`:

| Variable | Description |
|---|---|
| `QPAY_BASE_URL` | QPay API base URL (e.g., `https://merchant.qpay.mn`) |
| `QPAY_USERNAME` | QPay merchant username |
| `QPAY_PASSWORD` | QPay merchant password |
| `QPAY_INVOICE_CODE` | Default invoice code |
| `QPAY_CALLBACK_URL` | Payment callback URL |

```typescript
import { QPayClient, loadConfigFromEnv } from 'qpay-js';

const client = new QPayClient(loadConfigFromEnv());
```

### Manual configuration

```typescript
import { QPayClient } from 'qpay-js';
import type { QPayConfig } from 'qpay-js';

const config: QPayConfig = {
  baseUrl: 'https://merchant.qpay.mn',
  username: 'YOUR_USERNAME',
  password: 'YOUR_PASSWORD',
  invoiceCode: 'YOUR_INVOICE_CODE',
  callbackUrl: 'https://example.com/api/qpay/callback',
};

const client = new QPayClient(config);
```

## Usage

### Authentication

The client manages tokens automatically. When you call any API method, it will obtain a token if needed, refresh it when it expires, and re-authenticate if the refresh token also expires.

You can also manage tokens manually:

```typescript
// Get a new token pair
const token = await client.getToken();
console.log(token.accessToken);
console.log(token.refreshToken);
console.log(token.expiresIn);

// Refresh the current token
const refreshed = await client.refreshToken();
```

### Create Invoice

Full invoice with all options:

```typescript
const invoice = await client.createInvoice({
  invoiceCode: 'TEST_INVOICE',
  senderInvoiceNo: 'ORDER-001',
  invoiceReceiverCode: 'terminal',
  invoiceDescription: 'Payment for Order #001',
  amount: 50000,
  callbackUrl: 'https://example.com/api/qpay/callback',
  senderBranchCode: 'BRANCH01',
  enableExpiry: 'true',
  allowPartial: false,
  minimumAmount: 1000,
  allowExceed: false,
  maximumAmount: 100000,
  note: 'Special order',
  lines: [
    {
      lineDescription: 'Product A',
      lineQuantity: '2',
      lineUnitPrice: '25000',
      taxes: [{ description: 'VAT', amount: 2500 }],
    },
  ],
});

console.log(invoice.invoiceId);
console.log(invoice.qrText);
console.log(invoice.qrImage);
console.log(invoice.qPayShortUrl);

// Deep links for mobile banking apps
for (const url of invoice.urls) {
  console.log(`${url.name}: ${url.link}`);
}
```

### Create Simple Invoice

Minimal fields for quick invoice creation:

```typescript
const invoice = await client.createSimpleInvoice({
  invoiceCode: 'TEST_INVOICE',
  senderInvoiceNo: 'ORDER-002',
  invoiceReceiverCode: 'terminal',
  invoiceDescription: 'Quick payment',
  amount: 10000,
  callbackUrl: 'https://example.com/api/qpay/callback',
});
```

### Create Ebarimt Invoice

Invoice with tax (ebarimt) information:

```typescript
const invoice = await client.createEbarimtInvoice({
  invoiceCode: 'TEST_INVOICE',
  senderInvoiceNo: 'ORDER-003',
  invoiceReceiverCode: 'terminal',
  invoiceDescription: 'Taxed payment',
  taxType: 'CITIZEN',
  districtCode: 'UB',
  callbackUrl: 'https://example.com/api/qpay/callback',
  lines: [
    {
      lineDescription: 'Service fee',
      lineQuantity: '1',
      lineUnitPrice: '30000',
      taxProductCode: 'TAX001',
    },
  ],
});
```

### Cancel Invoice

```typescript
await client.cancelInvoice('INVOICE_ID');
```

### Get Payment

```typescript
const payment = await client.getPayment('PAYMENT_ID');

console.log(payment.paymentId);
console.log(payment.paymentStatus);  // "PAID", "PENDING", etc.
console.log(payment.paymentAmount);
console.log(payment.paymentCurrency);
console.log(payment.paymentDate);
console.log(payment.transactionType);
```

### Check Payment

Check if a payment has been made for an invoice:

```typescript
const result = await client.checkPayment({
  objectType: 'INVOICE',
  objectId: 'INVOICE_ID',
  offset: { pageNumber: 1, pageLimit: 10 },
});

console.log(result.count);
console.log(result.paidAmount);

for (const row of result.rows) {
  console.log(row.paymentId, row.paymentStatus, row.paymentAmount);
}
```

### List Payments

```typescript
const result = await client.listPayments({
  objectType: 'INVOICE',
  objectId: 'INVOICE_ID',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  offset: { pageNumber: 1, pageLimit: 20 },
});

for (const item of result.rows) {
  console.log(item.paymentId, item.paymentDate, item.paymentAmount);
}
```

### Cancel Payment

Cancel a card payment:

```typescript
await client.cancelPayment('PAYMENT_ID', {
  callbackUrl: 'https://example.com/api/qpay/cancel-callback',
  note: 'Customer requested cancellation',
});

// Or without options
await client.cancelPayment('PAYMENT_ID');
```

### Refund Payment

Refund a card payment:

```typescript
await client.refundPayment('PAYMENT_ID', {
  callbackUrl: 'https://example.com/api/qpay/refund-callback',
  note: 'Refund for returned item',
});

// Or without options
await client.refundPayment('PAYMENT_ID');
```

### Create Ebarimt

Create an electronic tax receipt for a payment:

```typescript
const ebarimt = await client.createEbarimt({
  paymentId: 'PAYMENT_ID',
  ebarimtReceiverType: 'CITIZEN',
  districtCode: 'UB',
});

console.log(ebarimt.id);
console.log(ebarimt.ebarimtQrData);
console.log(ebarimt.ebarimtLottery);
console.log(ebarimt.amount);
console.log(ebarimt.vatAmount);
```

### Cancel Ebarimt

```typescript
const cancelled = await client.cancelEbarimt('PAYMENT_ID');
console.log(cancelled.barimtStatus); // "CANCELLED"
```

## Error Handling

All API errors throw a `QPayError` with structured information:

```typescript
import { QPayError, isQPayError, ERR_INVOICE_NOT_FOUND } from 'qpay-js';

try {
  await client.getPayment('NONEXISTENT');
} catch (err) {
  if (isQPayError(err)) {
    console.log(err.statusCode); // 404
    console.log(err.code);       // "INVOICE_NOTFOUND"
    console.log(err.message);    // "qpay: INVOICE_NOTFOUND - Invoice not found (status 404)"
    console.log(err.rawBody);    // Raw JSON response body

    // Compare against known error codes
    if (err.code === ERR_INVOICE_NOT_FOUND) {
      // Handle specific error
    }
  }
}
```

### Available Error Code Constants

The library exports all QPay error codes as constants:

```typescript
import {
  ERR_AUTHENTICATION_FAILED,
  ERR_INVOICE_NOT_FOUND,
  ERR_INVOICE_PAID,
  ERR_INVOICE_ALREADY_CANCELED,
  ERR_PAYMENT_NOT_FOUND,
  ERR_PAYMENT_NOT_PAID,
  ERR_PAYMENT_ALREADY_CANCELED,
  ERR_PERMISSION_DENIED,
  ERR_INVALID_AMOUNT,
  ERR_MERCHANT_NOT_FOUND,
  ERR_MERCHANT_INACTIVE,
  // ... and more
} from 'qpay-js';
```

## Browser Usage

This library works in modern browsers that support the `fetch` API. No polyfills are needed for current browsers.

```html
<script type="module">
  import { QPayClient } from 'qpay-js';

  const client = new QPayClient({
    baseUrl: 'https://merchant.qpay.mn',
    username: 'YOUR_USERNAME',
    password: 'YOUR_PASSWORD',
    invoiceCode: 'YOUR_INVOICE_CODE',
    callbackUrl: 'https://example.com/callback',
  });

  const invoice = await client.createSimpleInvoice({
    invoiceCode: 'TEST',
    senderInvoiceNo: 'ORDER-001',
    invoiceReceiverCode: 'terminal',
    invoiceDescription: 'Browser payment',
    amount: 5000,
    callbackUrl: 'https://example.com/callback',
  });

  // Display QR code
  document.getElementById('qr').src = `data:image/png;base64,${invoice.qrImage}`;
</script>
```

> **Note:** In browser environments, `loadConfigFromEnv()` will not work because `process.env` is not available. Use manual configuration instead.

## API Reference

### `QPayClient`

| Method | Description |
|---|---|
| `new QPayClient(config)` | Create a new client with the given config |
| `getToken()` | Authenticate and return a token pair |
| `refreshToken()` | Refresh the current access token |
| `createInvoice(req)` | Create a detailed invoice |
| `createSimpleInvoice(req)` | Create a simple invoice with minimal fields |
| `createEbarimtInvoice(req)` | Create an invoice with ebarimt (tax) data |
| `cancelInvoice(invoiceId)` | Cancel an invoice by ID |
| `getPayment(paymentId)` | Get payment details by ID |
| `checkPayment(req)` | Check if a payment has been made |
| `listPayments(req)` | List payments with filters |
| `cancelPayment(paymentId, req?)` | Cancel a card payment |
| `refundPayment(paymentId, req?)` | Refund a card payment |
| `createEbarimt(req)` | Create an electronic tax receipt |
| `cancelEbarimt(paymentId)` | Cancel an ebarimt by payment ID |

### `QPayConfig`

```typescript
interface QPayConfig {
  baseUrl: string;      // QPay API base URL
  username: string;     // Merchant username
  password: string;     // Merchant password
  invoiceCode: string;  // Default invoice code
  callbackUrl: string;  // Payment callback URL
}
```

### `QPayError`

```typescript
class QPayError extends Error {
  statusCode: number;  // HTTP status code
  code: string;        // QPay error code
  rawBody: string;     // Raw response body
}
```

### `loadConfigFromEnv()`

Loads a `QPayConfig` from environment variables. Throws an `Error` if any required variable is missing.

### `isQPayError(err)`

Type guard that returns `true` if the given value is a `QPayError` instance.

## License

MIT
