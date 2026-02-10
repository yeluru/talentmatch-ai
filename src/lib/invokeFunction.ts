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
  const result = await supabase.functions.invoke(name, {
    body: options.body,
    headers: options.headers,
  });
  return result as { data: T | null; error: { name: string; context: Response } | null };
}
