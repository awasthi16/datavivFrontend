const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
let authToken = localStorage.getItem('dataviv-auth-token') || '';

function resolveApiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function buildHeaders(headers = {}) {
  return authToken ? { ...headers, Authorization: `Bearer ${authToken}` } : headers;
}

export function setAuthToken(token) {
  authToken = token || '';

  if (authToken) {
    localStorage.setItem('dataviv-auth-token', authToken);
  } else {
    localStorage.removeItem('dataviv-auth-token');
  }
}

export async function postJson(path, body = {}) {
  const response = await fetch(resolveApiUrl(path), {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let message = 'Request failed';

    try {
      const payload = await response.json();
      message = payload.error || payload.message || message;
    } catch {
      message = await response.text();
    }

    throw new Error(message);
  }

  return response.json();
}

export async function uploadVideo(path, { file, sourceId, name }) {
  const body = new FormData();
  body.append('video', file);
  body.append('sourceId', String(sourceId));

  if (name) {
    body.append('name', name);
  }

  const response = await fetch(resolveApiUrl(path), {
    method: 'POST',
    headers: buildHeaders(),
    body
  });

  if (!response.ok) {
    let message = 'Upload failed';

    try {
      const payload = await response.json();
      message = payload.error || payload.message || message;
    } catch {
      message = await response.text();
    }

    throw new Error(message);
  }

  return response.json();
}

export async function deleteRequest(path) {
  const response = await fetch(resolveApiUrl(path), {
    method: 'DELETE',
    headers: buildHeaders()
  });

  if (!response.ok) {
    let message = 'Delete failed';

    try {
      const payload = await response.json();
      message = payload.error || payload.message || message;
    } catch {
      message = await response.text();
    }

    throw new Error(message);
  }

  return response.json();
}

export function subscribeToDashboard(onMessage, onError) {
  const source = new EventSource(resolveApiUrl('/events'));

  source.onmessage = (event) => {
    onMessage(JSON.parse(event.data));
  };

  source.onerror = () => {
    onError?.(new Error('Live event stream disconnected.'));
  };

  return () => {
    source.close();
  };
}

export async function getJson(path) {
  const response = await fetch(resolveApiUrl(path), {
    headers: buildHeaders()
  });

  if (!response.ok) {
    let message = 'Request failed';

    try {
      const payload = await response.json();
      message = payload.error || payload.message || message;
    } catch {
      message = await response.text();
    }

    throw new Error(message);
  }

  return response.json();
}
