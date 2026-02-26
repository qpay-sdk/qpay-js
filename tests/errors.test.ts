import { describe, it, expect } from 'vitest';
import {
  QPayError,
  isQPayError,
  ERR_AUTHENTICATION_FAILED,
  ERR_INVOICE_NOT_FOUND,
  ERR_PAYMENT_NOT_FOUND,
} from '../src/errors.js';

// ============================================================================
// QPayError
// ============================================================================

describe('QPayError', () => {
  it('should create an error with the correct properties', () => {
    const err = new QPayError(401, 'UNAUTHORIZED', 'Invalid credentials', '{"error":"UNAUTHORIZED"}');

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(QPayError);
    expect(err.name).toBe('QPayError');
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.rawBody).toBe('{"error":"UNAUTHORIZED"}');
    expect(err.message).toBe('qpay: UNAUTHORIZED - Invalid credentials (status 401)');
  });

  it('should format the message correctly with different inputs', () => {
    const err = new QPayError(404, 'NOT_FOUND', 'Resource missing', '');
    expect(err.message).toBe('qpay: NOT_FOUND - Resource missing (status 404)');
  });

  it('should have readonly properties', () => {
    const err = new QPayError(500, 'SERVER_ERROR', 'Internal error', 'raw');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('SERVER_ERROR');
    expect(err.rawBody).toBe('raw');
  });

  it('should be catchable as an Error', () => {
    const err = new QPayError(400, 'BAD_REQUEST', 'Bad request', '');
    try {
      throw err;
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as QPayError).statusCode).toBe(400);
    }
  });

  it('should preserve the stack trace', () => {
    const err = new QPayError(500, 'ERR', 'msg', '');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('QPayError');
  });
});

// ============================================================================
// isQPayError
// ============================================================================

describe('isQPayError', () => {
  it('should return true for QPayError instances', () => {
    const err = new QPayError(400, 'BAD_REQUEST', 'bad', '');
    expect(isQPayError(err)).toBe(true);
  });

  it('should return false for regular Error instances', () => {
    const err = new Error('regular error');
    expect(isQPayError(err)).toBe(false);
  });

  it('should return false for plain objects', () => {
    const obj = { statusCode: 400, code: 'BAD_REQUEST', message: 'bad' };
    expect(isQPayError(obj)).toBe(false);
  });

  it('should return false for null and undefined', () => {
    expect(isQPayError(null)).toBe(false);
    expect(isQPayError(undefined)).toBe(false);
  });

  it('should return false for strings and numbers', () => {
    expect(isQPayError('error')).toBe(false);
    expect(isQPayError(42)).toBe(false);
  });
});

// ============================================================================
// Error code constants
// ============================================================================

describe('Error code constants', () => {
  it('should export the correct error code values', () => {
    expect(ERR_AUTHENTICATION_FAILED).toBe('AUTHENTICATION_FAILED');
    expect(ERR_INVOICE_NOT_FOUND).toBe('INVOICE_NOTFOUND');
    expect(ERR_PAYMENT_NOT_FOUND).toBe('PAYMENT_NOTFOUND');
  });
});
