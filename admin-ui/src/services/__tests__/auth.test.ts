import { authService, LoginCredentials } from '../auth';
import { apiService } from '../api';

// Mock the apiService
jest.mock('../api');

const mockedApiService = apiService as jest.Mocked<typeof apiService>;

describe('AuthService', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should login successfully and store token and user', async () => {
      const credentials: LoginCredentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockResponse = {
        success: true,
        data: {
          token: 'test-token',
          user: {
            id: '1',
            email: 'test@example.com',
            name: 'Test User',
            role: 'admin' as const,
            createdAt: '2026-01-28',
          },
        },
      };

      mockedApiService.post.mockResolvedValue(mockResponse);

      const result = await authService.login(credentials);

      expect(result.success).toBe(true);
      expect(localStorage.getItem('token')).toBe('test-token');
      expect(localStorage.getItem('user')).toBe(JSON.stringify(mockResponse.data?.user));
    });

    it('should handle login failure', async () => {
      const credentials: LoginCredentials = {
        email: 'test@example.com',
        password: 'wrong-password',
      };

      const mockResponse = {
        success: false,
        error: 'Invalid credentials',
      };

      mockedApiService.post.mockResolvedValue(mockResponse);

      const result = await authService.login(credentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('logout', () => {
    it('should clear localStorage on logout', () => {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('user', JSON.stringify({ id: '1', email: 'test@example.com' }));

      // Mock window.location.href
      delete (window as any).location;
      (window as any).location = { href: '' };

      authService.logout();

      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });
  });

  describe('getToken', () => {
    it('should return token from localStorage', () => {
      localStorage.setItem('token', 'test-token');
      expect(authService.getToken()).toBe('test-token');
    });

    it('should return null if no token exists', () => {
      expect(authService.getToken()).toBeNull();
    });
  });

  describe('getUser', () => {
    it('should return user from localStorage', () => {
      const user = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin' as const,
        createdAt: '2026-01-28',
      };
      localStorage.setItem('user', JSON.stringify(user));

      expect(authService.getUser()).toEqual(user);
    });

    it('should return null if no user exists', () => {
      expect(authService.getUser()).toBeNull();
    });

    it('should return null if user data is invalid JSON', () => {
      localStorage.setItem('user', 'invalid-json');
      expect(authService.getUser()).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true if token and user exist', () => {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('user', JSON.stringify({ id: '1', email: 'test@example.com' }));

      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should return false if token is missing', () => {
      localStorage.setItem('user', JSON.stringify({ id: '1', email: 'test@example.com' }));
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should return false if user is missing', () => {
      localStorage.setItem('token', 'test-token');
      expect(authService.isAuthenticated()).toBe(false);
    });
  });
});
