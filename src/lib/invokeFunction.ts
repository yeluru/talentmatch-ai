/**
 * Invoke a Supabase Edge Function. When running on localhost, if
 * VITE_SUPABASE_FUNCTIONS_DIRECT_URL is set (e.g. http://127.0.0.1:8081), the request
 * is sent directly to that URL instead of via Kong. This avoids 503 when Kong proxies
 * to the Docker edge-runtime but the host's `supabase functions serve` has your env.
 */
import { supabase } from '@/integrations/supabase/client';

const DIRECT_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_DIRECT_URL as string | undefined;

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

export type InvokeOptions = {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export async function invokeFunction<T = unknown>(
  name: string,
  options: InvokeOptions = {}
): Promise<{ data: T | null; error: { name: string; context: Response } | null }> {
  if (isLocalHost() && DIRECT_URL?.trim()) {
    const base = DIRECT_URL.trim().replace(/\/$/, '');
    const url = `${base}/${name}`;
    if (import.meta.env.DEV) console.info('[supabase] functions direct:', url);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token ?? '';
    console.log('[invokeFunction] Token present:', !!token, 'Token length:', token?.length || 0);
    if (!token) {
      console.error('[invokeFunction] No auth token available! User may not be logged in.');
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: JSON.stringify(options.body ?? {}),
    });
    if (!res.ok) {
      console.error('[invokeFunction] HTTP error:', res.status, res.statusText);
      const errorText = await res.text().catch(() => 'Unable to read error body');
      console.error('[invokeFunction] Error body:', errorText);
      return {
        data: null,
        error: { name: 'FunctionsHttpError', context: res },
      };
    }
    let data: T | null = null;
    const ct = res.headers.get('content-type');
    if (ct?.includes('application/json')) {
      try {
        data = (await res.json()) as T;
      } catch {
        // leave data null
      }
    }
    return { data, error: null };
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? '';
  console.log('[invokeFunction] Production - Token present:', !!token, 'Token length:', token?.length || 0);
  if (!token) {
    console.error('[invokeFunction] No auth token available in production! User may not be logged in.');
  }
  const result = await supabase.functions.invoke(name, {
    body: options.body,
    headers: options.headers,
  });
  if (result.error) {
    console.error('[invokeFunction] Production error:', result.error);
  }
  return result as { data: T | null; error: { name: string; context: Response } | null };
}
