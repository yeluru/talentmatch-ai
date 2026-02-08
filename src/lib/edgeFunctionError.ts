/**
 * Extracts a user-facing error message from an Edge Function invoke error.
 * When the Supabase client gets a non-2xx response, it throws FunctionsHttpError
 * with the raw Response as context. This helper parses the JSON body (e.g. { error: "..." })
 * so we can show the server message instead of "Edge Function returned a non-2xx status code".
 */
export async function getEdgeFunctionErrorMessage(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && (error as { name?: string }).name === 'FunctionsHttpError') {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      try {
        const body = await (ctx as Response).json();
        if (body && typeof body === 'object') {
          const err = typeof body.error === 'string' ? body.error : '';
          const details = typeof (body as { details?: string }).details === 'string' ? (body as { details: string }).details : '';
          if (details && err) return `${err}: ${details}`;
          if (err) return err;
          if (details) return details;
        }
      } catch {
        // ignore parse errors
      }
    }
  }
  return error instanceof Error ? error.message : String(error);
}
