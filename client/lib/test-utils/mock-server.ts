/**
 * Mock server for API testing using MSW (Mock Service Worker)
 */

import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { TEST_CONFIG } from '../test-setup';
import { createMockUser, createMockCompany, createMockJob, createMockResume } from './index';

// ============================================================================
// MOCK DATA
// ============================================================================

const mockUsers = [
  createMockUser({
    id: TEST_CONFIG.TEST_USERS.USER.id,
    data: {
      ...createMockUser().data,
      firstName: TEST_CONFIG.TEST_USERS.USER.name.split(' ')[0],
      lastName: TEST_CONFIG.TEST_USERS.USER.name.split(' ')[1],
      contact: {
        ...createMockUser().data.contact,
        email: TEST_CONFIG.TEST_USERS.USER.email,
      },
    },
    role: TEST_CONFIG.TEST_USERS.USER.role,
  }),
  createMockUser({
    id: TEST_CONFIG.TEST_USERS.RECRUITER.id,
    data: {
      ...createMockUser().data,
      firstName: TEST_CONFIG.TEST_USERS.RECRUITER.name.split(' ')[0],
      lastName: TEST_CONFIG.TEST_USERS.RECRUITER.name.split(' ')[1],
      contact: {
        ...createMockUser().data.contact,
        email: TEST_CONFIG.TEST_USERS.RECRUITER.email,
      },
    },
    role: TEST_CONFIG.TEST_USERS.RECRUITER.role,
  }),
];

const mockCompanies = [
  createMockCompany({
    id: 'test-company-1',
    userId: TEST_CONFIG.TEST_USERS.RECRUITER.id,
  }),
];

const mockJobs = [
  createMockJob({
    id: 'test-job-1',
    companyId: 'test-company-1',
    userId: TEST_CONFIG.TEST_USERS.RECRUITER.id,
  }),
];

const mockResumes = [
  createMockResume({
    id: 'test-resume-1',
    userId: TEST_CONFIG.TEST_USERS.USER.id,
  }),
];

// ============================================================================
// API HANDLERS
// ============================================================================

export const handlers = [
  // ============================================================================
  // AUTH ENDPOINTS
  // ============================================================================
  
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json() as any;
    const { email, password } = body;

    // Find user by email
    const user = mockUsers.find(u => u.data.contact.email === email);
    
    if (!user || password !== 'password123') {
      return HttpResponse.json(
        {
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Invalid credentials',
          },
        },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.data.contact.email,
          name: `${user.data.firstName} ${user.data.lastName}`,
          role: user.role,
        },
        token: TEST_CONFIG.TEST_TOKENS.VALID,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  }),

  http.post('/api/auth/signup', async ({ request }) => {
    const body = await request.json() as any;
    const { email, password, name, role = 'job_seeker' } = body;

    // Check if user already exists
    const existingUser = mockUsers.find(u => u.data.contact.email === email);
    if (existingUser) {
      return HttpResponse.json(
        {
          success: false,
          error: {
            code: 'CONFLICT_ERROR',
            message: 'User already exists',
          },
        },
        { status: 409 }
      );
    }

    const newUser = createMockUser({
      id: `new-user-${Date.now()}`,
      data: {
        ...createMockUser().data,
        firstName: name.split(' ')[0],
        lastName: name.split(' ')[1] || '',
        contact: {
          ...createMockUser().data.contact,
          email,
        },
      },
      role: role as any,
    });

    mockUsers.push(newUser);

    return HttpResponse.json({
      success: true,
      data: {
        user: {
          id: newUser.id,
          email: newUser.data.contact.email,
          name: `${newUser.data.firstName} ${newUser.data.lastName}`,
          role: newUser.role,
        },
        token: TEST_CONFIG.TEST_TOKENS.VALID,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  }),

  http.post('/api/auth/logout', () => {
    return HttpResponse.json({
      success: true,
      data: {},
    });
  }),

  http.post('/api/auth/refresh', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.includes(TEST_CONFIG.TEST_TOKENS.VALID)) {
      return HttpResponse.json(
        {
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Invalid token',
          },
        },
        { status: 401 }
      );
    }

    const user = mockUsers[0]; // Default to first user

    return HttpResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.data.contact.email,
          name: `${user.data.firstName} ${user.data.lastName}`,
          role: user.role,
        },
        token: TEST_CONFIG.TEST_TOKENS.VALID,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  }),

  // ============================================================================
  // USER ENDPOINTS
  // ============================================================================

  http.get('/api/users/me', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.includes(TEST_CONFIG.TEST_TOKENS.VALID)) {
      return HttpResponse.json(
        {
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Authentication required',
          },
        },
        { status: 401 }
      );
    }

    const user = mockUsers[0]; // Default to first user

    return HttpResponse.json({
      success: true,
      data: user,
    });
  }),

  http.get('/api/users/:id', ({ params }) => {
    const { id } = params;
    const user = mockUsers.find(u => u.id === id);

    if (!user) {
      return HttpResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND_ERROR',
            message: 'User not found',
          },
        },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      success: true,
      data: user,
    });
  }),

  http.get('/api/users', ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search');

    let filteredUsers = mockUsers;

    if (search) {
      filteredUsers = mockUsers.filter(user =>
        user.data.firstName.toLowerCase().includes(search.toLowerCase()) ||
        user.data.lastName.toLowerCase().includes(search.toLowerCase()) ||
        user.data.headline.toLowerCase().includes(search.toLowerCase())
      );
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

    return HttpResponse.json({
      success: true,
      data: {
        items: paginatedUsers,
        total: filteredUsers.length,
        page,
        limit,
        hasNext: endIndex < filteredUsers.length,
        hasPrev: page > 1,
      },
    });
  }),

  // ============================================================================
  // FALLBACK HANDLERS
  // ============================================================================

  // Catch-all for unhandled requests
  http.all('*', ({ request }) => {
    console.warn(`Unhandled ${request.method} request to ${request.url}`);
    
    return HttpResponse.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND_ERROR',
          message: `No handler found for ${request.method} ${request.url}`,
        },
      },
      { status: 404 }
    );
  }),
];

// ============================================================================
// SERVER SETUP
// ============================================================================

export const server = setupServer(...handlers);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Add a custom handler for testing specific scenarios
 */
export function addHandler(handler: any) {
  server.use(handler);
}

/**
 * Reset handlers to default state
 */
export function resetHandlers() {
  server.resetHandlers(...handlers);
}

/**
 * Mock a successful response for any endpoint
 */
export function mockSuccess(method: string, url: string, data: any) {
  const handler = http[method.toLowerCase() as keyof typeof http](url, () => {
    return HttpResponse.json({
      success: true,
      data,
    });
  });
  
  server.use(handler);
}

/**
 * Mock an error response for any endpoint
 */
export function mockError(method: string, url: string, error: any, status: number = 500) {
  const handler = http[method.toLowerCase() as keyof typeof http](url, () => {
    return HttpResponse.json(
      {
        success: false,
        error,
      },
      { status }
    );
  });
  
  server.use(handler);
}
