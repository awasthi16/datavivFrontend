const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
let authToken = localStorage.getItem('dataviv-auth-token') || '';

function resolveApiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function buildHeaders(headers = {}) {
  return authToken ? { ...headers, Authorization: `Bearer ${authToken}` } : headers;
}

async function readErrorMessage(response, fallback) {
  const body = await response.text();

  if (!body) {
    return fallback;
  }

  try {
    const payload = JSON.parse(body);
    return payload.error || payload.message || fallback;
  } catch {
    return body;
  }
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
    throw new Error(await readErrorMessage(response, 'Request failed'));
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
    throw new Error(await readErrorMessage(response, 'Upload failed'));
  }

  return response.json();
}

export async function deleteRequest(path) {
  const response = await fetch(resolveApiUrl(path), {
    method: 'DELETE',
    headers: buildHeaders()
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Delete failed'));
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
    throw new Error(await readErrorMessage(response, 'Request failed'));
  }

  return response.json();
}
