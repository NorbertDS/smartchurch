import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta as any)?.env?.VITE_API_BASE_URL || '/api',
});

api.interceptors.request.use((config) => {
  const url = config.url || '';
  const publicEndpoints = ['/auth/tenant-resolve', '/auth/public-cell-groups', '/landing', '/church-info'];
  const isPublic = publicEndpoints.some(pe => url.startsWith(pe));
  if (!isPublic) {
    const token = localStorage.getItem('fc_token');
    if (token) (config.headers as any).Authorization = `Bearer ${token}`;
  } else {
    if ((config.headers as any).Authorization) delete (config.headers as any).Authorization;
  }
  const hasTenantHeader = (config.headers as any)['x-tenant-id'];
  if (!hasTenantHeader) {
    const tenantId = localStorage.getItem('fc_tenant_id');
    if (tenantId) (config.headers as any)['x-tenant-id'] = tenantId;
  }
  return config;
});

api.interceptors.response.use(
  (resp) => resp,
  (error) => {
    const status = error?.response?.status;
    const isNetwork = !error?.response && !!error?.request;
    const message = error?.response?.data?.message || (isNetwork ? 'Cannot reach backend server. Please ensure it is running.' : '');
    // Log detailed error for troubleshooting
    try {
      const req = error?.config || {};
      console.error('[API Error]', {
        url: req?.url,
        method: req?.method,
        status,
        message,
        data: error?.response?.data,
      });
    } catch {}
    // Auto-logout/redirect only if a user had a token
    const hadToken = !!localStorage.getItem('fc_token');
    const reqUrl = (error?.config?.url || '') as string;
    const isPublic = reqUrl.includes('/landing') || window.location.pathname === '/';
    if (status === 401 && hadToken && (message.includes('Invalid token') || message.includes('Missing Authorization') || message.includes('Unauthenticated')) && !isPublic) {
      try { localStorage.removeItem('fc_token'); } catch {}
      const current = window.location.pathname + window.location.search;
      const redirect = `/login?next=${encodeURIComponent(current)}`;
      try { console.info('[Auth Redirect]', { reason: message, from: current, to: redirect, reqUrl }); } catch {}
      if (window.location.pathname !== '/login') window.location.href = redirect;
    }
    // Friendly default message for network/server errors
    if (isNetwork) {
      try {
        error.response = error.response || { data: {} } as any;
        const data = error.response.data || {};
        if (!data.message) {
          data.message = 'Backend unavailable (connection refused). Start server on `http://localhost:4000` and retry.';
          error.response.data = data;
        }
      } catch {}
    } else if (status === 500) {
      try {
        error.response = error.response || { data: {} };
        const data = error.response.data || {};
        if (!data.message) {
          data.message = 'Server error occurred. Please try again or contact an administrator.';
          error.response.data = data;
        }
      } catch {}
    }
    return Promise.reject(error);
  }
);

export default api;
