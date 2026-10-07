import axios, { AxiosError } from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

/** Shape every successful API response uses. */
export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  code?: string;
  data: T;
  meta?: { page: number; limit: number; total: number; totalPages: number };
}

export interface Page<T> {
  rows: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const tokenStore = {
  get: () => accessToken,
  set(t: string | null) {
    accessToken = t;
    if (t) window.localStorage.setItem('erp_token', t);
    else window.localStorage.removeItem('erp_token');
  },
  restore() {
    accessToken = window.localStorage.getItem('erp_token');
    return accessToken;
  },
  onUnauthorized(fn: () => void) {
    onUnauthorized = fn;
  },
};

export const http = axios.create({ baseURL: API_BASE, timeout: 30000 });

http.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

http.interceptors.response.use(
  (res) => res,
  (err: AxiosError<ApiEnvelope<unknown>>) => {
    const status = err.response?.status ?? 0;
    if (status === 401 && onUnauthorized) onUnauthorized();
    const body = err.response?.data;
    return Promise.reject(
      new ApiError(status, body?.message ?? err.message ?? 'Network error', body?.code ?? 'ERROR', body?.data),
    );
  },
);

function unwrap<T>(data: unknown): T {
  return (data as ApiEnvelope<T>).data;
}

export const api = {
  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const r = await http.get<ApiEnvelope<T>>(url, { params });
    return unwrap<T>(r.data);
  },

  /** GET a paginated collection. Returns rows + meta. */
  async page<T>(url: string, params?: Record<string, unknown>): Promise<Page<T>> {
    const r = await http.get<ApiEnvelope<T[]>>(url, { params });
    return {
      rows: r.data.data ?? [],
      meta: r.data.meta ?? { page: 1, limit: (r.data.data ?? []).length, total: (r.data.data ?? []).length, totalPages: 1 },
    };
  },

  async post<T>(url: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
    const r = await http.post<ApiEnvelope<T>>(url, body, { params });
    return unwrap<T>(r.data);
  },

  async put<T>(url: string, body?: unknown): Promise<T> {
    const r = await http.put<ApiEnvelope<T>>(url, body);
    return unwrap<T>(r.data);
  },

  async patch<T>(url: string, body?: unknown): Promise<T> {
    const r = await http.patch<ApiEnvelope<T>>(url, body);
    return unwrap<T>(r.data);
  },

  async del<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const r = await http.delete<ApiEnvelope<T>>(url, { params });
    return unwrap<T>(r.data);
  },

  /** Download a file the API streams (CSV exports) through the browser. */
  async download(url: string, filename: string, params?: Record<string, unknown>): Promise<void> {
    const r = await http.get(url, { params, responseType: 'blob' });
    const href = URL.createObjectURL(new Blob([r.data as BlobPart]));
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  },
};

/** Convert an unknown thrown value into a readable message. */
export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
