/**
 * Jest Setup
 * Global test configuration and utilities
 */

// Set test environment variables
process.env.NODE_ENV = 'test';

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce test output noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for important messages
  error: console.error,
};

// Global test utilities
global.testHelpers = {
  // Wait for a condition to be true
  waitFor: async (condition, timeout = 5000) => {
    const start = Date.now();
    while (!condition() && Date.now() - start < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!condition()) {
      throw new Error('Timeout waiting for condition');
    }
  },
  
  // Create a mock request object
  mockRequest: (options = {}) => ({
    method: 'GET',
    path: '/',
    headers: {},
    query: {},
    body: {},
    ...options
  }),
  
  // Create a mock response object
  mockResponse: () => {
    const res = {
      statusCode: 200,
      headers: {},
      body: null
    };
    res.status = jest.fn((code) => {
      res.statusCode = code;
      return res;
    });
    res.json = jest.fn((data) => {
      res.body = data;
      return res;
    });
    res.send = jest.fn((data) => {
      res.body = data;
      return res;
    });
    res.setHeader = jest.fn((key, value) => {
      res.headers[key] = value;
    });
    res.set = res.setHeader;
    return res;
  }
};
