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

// Define global test helpers type
declare global {
  var testHelpers: {
    waitFor: (condition: () => boolean, timeout?: number) => Promise<void>;
    mockRequest: (options?: Partial<MockRequest>) => MockRequest;
    mockResponse: () => MockResponse;
  };
}

interface MockRequest {
  method: string;
  path: string;
  headers: Record<string, any>;
  query: Record<string, any>;
  body: any;
}

interface MockResponse {
  statusCode: number;
  headers: Record<string, any>;
  body: any;
  status: jest.Mock;
  json: jest.Mock;
  send: jest.Mock;
  setHeader: jest.Mock;
  set: jest.Mock;
}

// Global test utilities
global.testHelpers = {
  // Wait for a condition to be true
  waitFor: async (condition: () => boolean, timeout: number = 5000): Promise<void> => {
    const start = Date.now();
    while (!condition() && Date.now() - start < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!condition()) {
      throw new Error('Timeout waiting for condition');
    }
  },
  
  // Create a mock request object
  mockRequest: (options: Partial<MockRequest> = {}): MockRequest => ({
    method: 'GET',
    path: '/',
    headers: {},
    query: {},
    body: {},
    ...options
  }),
  
  // Create a mock response object
  mockResponse: (): MockResponse => {
    const res: any = {
      statusCode: 200,
      headers: {},
      body: null
    };
    res.status = jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    });
    res.json = jest.fn((data: any) => {
      res.body = data;
      return res;
    });
    res.send = jest.fn((data: any) => {
      res.body = data;
      return res;
    });
    res.setHeader = jest.fn((key: string, value: any) => {
      res.headers[key] = value;
    });
    res.set = res.setHeader;
    return res as MockResponse;
  }
};

export {};
