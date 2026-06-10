// FOR API BASE URL
export const BASE_URL = process.env.NEXT_PUBLIC_API_URL as string;

/**
 * Join BASE_URL with an endpoint path safely. BASE_URL ends with a trailing
 * slash (".../api/") and endpoint descriptor paths start with one
 * ("/me/addresses"); naive `${BASE_URL}${path}` yields a double slash
 * (".../api//me/addresses") which Strapi 404s. Always build request URLs with
 * this helper.
 */
export function apiUrl(path: string): string {
  return `${(BASE_URL || "").replace(/\/+$/, "")}${path}`;
}

// FOR BASE URL OF THE IMAGE
export const IMAGE_URL = process.env.NEXT_PUBLIC_IMAGE_URL as string;
