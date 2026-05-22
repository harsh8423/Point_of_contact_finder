"use client";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─────────────────────────────────────────────────────────────
// Core fetcher — always sends cookies + parses error detail
// ─────────────────────────────────────────────────────────────

async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",           // ← send HTTP-only poc_token cookie
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") msg = data.detail;
      else if (Array.isArray(data.detail)) msg = data.detail[0]?.msg || msg;
      else if (typeof data.detail === "object" && data.detail !== null)
        msg = (data.detail as { message?: string }).message || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────
// Public API surface — callers keep their original types
// ─────────────────────────────────────────────────────────────

export const api = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: <T = any>(path: string): Promise<T> => request<T>(path),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post: <T = any>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete: <T = any>(path: string): Promise<T> =>
    request<T>(path, { method: "DELETE" }),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bulkDelete: <T = any>(leadIds: number[]): Promise<T> =>
    request<T>("/api/leads", {
      method: "DELETE",
      body: JSON.stringify({ lead_ids: leadIds }),
    }),

  /** CSV export URL — use exportCSV() helper for authenticated download */
  exportUrl: (leadIds?: number[]) => {
    const params = leadIds?.length ? `?lead_ids=${leadIds.join(",")}` : "";
    return `${API}/api/export/csv${params}`;
  },
};

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type Lead = {
  id: number;
  business_name: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  review_count?: number;
  category?: string;
  maps_url?: string;
  status: "new" | "poc_found" | "qualified";
  search_query: string;
  created_at?: string;
  contact_count?: number;
  qualified?: boolean;
  contacts?: Contact[];
  qualifications?: Qualification[];
};

export type Contact = {
  id: number;
  name?: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  phone?: string;
  source: string;
};

export type Qualification = {
  id: number;
  summary: string;
  score?: number;
  reasoning?: string;
  size?: string;
  recent_news?: string;
};

export type Stats = {
  total: number;
  poc_found: number;
  qualified: number;
  this_week: number;
};
