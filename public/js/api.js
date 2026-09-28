// Thin wrapper around fetch(). Cookies (the session) are sent automatically
// because the login endpoint sets an httpOnly cookie; we just need
// credentials: 'include' so the browser attaches it on every request.

// Read a cookie by name (used to forward the CSRF token as a header).
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const csrfHeaders = {};
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = getCookie('csrf_token');
    if (token) csrfHeaders['x-csrf-token'] = token;
  }

  const res = await fetch('/api' + path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders,
      ...(options.headers || {})
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

const API = {
  get: (path) => api(path),
  post: (path, body) => api(path, { method: 'POST', body }),
  put: (path, body) => api(path, { method: 'PUT', body }),
  del: (path) => api(path, { method: 'DELETE' })
};
