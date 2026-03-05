/** Normalize API base URL: trim trailing slashes. */
export function normalizeApiBase(apiUrl: string | undefined): string {
  return (apiUrl ?? '').toString().replace(/\/+$/, '')
}

