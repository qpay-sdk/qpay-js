import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfigFromEnv } from '../src/config.js';

describe('loadConfigFromEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all QPAY_ env vars before each test
    delete process.env.QPAY_BASE_URL;
    delete process.env.QPAY_USERNAME;
    delete process.env.QPAY_PASSWORD;
    delete process.env.QPAY_INVOICE_CODE;
    delete process.env.QPAY_CALLBACK_URL;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  function setAllEnvVars() {
    process.env.QPAY_BASE_URL = 'https://merchant.qpay.mn';
    process.env.QPAY_USERNAME = 'test_user';
    process.env.QPAY_PASSWORD = 'test_pass';
    process.env.QPAY_INVOICE_CODE = 'TEST_INVOICE';
    process.env.QPAY_CALLBACK_URL = 'https://example.com/callback';
  }

  it('should load all config values from environment variables', () => {
    setAllEnvVars();
    const config = loadConfigFromEnv();

    expect(config.baseUrl).toBe('https://merchant.qpay.mn');
    expect(config.username).toBe('test_user');
    expect(config.password).toBe('test_pass');
    expect(config.invoiceCode).toBe('TEST_INVOICE');
    expect(config.callbackUrl).toBe('https://example.com/callback');
  });

  it('should throw when QPAY_BASE_URL is missing', () => {
    setAllEnvVars();
    delete process.env.QPAY_BASE_URL;

    expect(() => loadConfigFromEnv()).toThrow('QPAY_BASE_URL');
  });

  it('should throw when QPAY_USERNAME is missing', () => {
    setAllEnvVars();
    delete process.env.QPAY_USERNAME;

    expect(() => loadConfigFromEnv()).toThrow('QPAY_USERNAME');
  });

  it('should throw when QPAY_PASSWORD is missing', () => {
    setAllEnvVars();
    delete process.env.QPAY_PASSWORD;

    expect(() => loadConfigFromEnv()).toThrow('QPAY_PASSWORD');
  });

  it('should throw when QPAY_INVOICE_CODE is missing', () => {
    setAllEnvVars();
    delete process.env.QPAY_INVOICE_CODE;

    expect(() => loadConfigFromEnv()).toThrow('QPAY_INVOICE_CODE');
  });

  it('should throw when QPAY_CALLBACK_URL is missing', () => {
    setAllEnvVars();
    delete process.env.QPAY_CALLBACK_URL;

    expect(() => loadConfigFromEnv()).toThrow('QPAY_CALLBACK_URL');
  });

  it('should throw when all environment variables are missing', () => {
    expect(() => loadConfigFromEnv()).toThrow('required environment variable');
  });

  it('should throw when an env var is set to an empty string', () => {
    setAllEnvVars();
    process.env.QPAY_BASE_URL = '';

    expect(() => loadConfigFromEnv()).toThrow('QPAY_BASE_URL');
  });

  it('should return a plain config object with exactly five keys', () => {
    setAllEnvVars();
    const config = loadConfigFromEnv();

    expect(Object.keys(config)).toHaveLength(5);
    expect(Object.keys(config).sort()).toEqual([
      'baseUrl',
      'callbackUrl',
      'invoiceCode',
      'password',
      'username',
    ]);
  });
});
