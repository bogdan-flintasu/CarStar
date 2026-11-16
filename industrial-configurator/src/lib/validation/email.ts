import { z } from 'zod';
import {
  CONFIGURATION_TOKEN_PATTERN,
  configurationDataSchema,
  contactEmailSchema,
  contactNameSchema,
  contactPhoneSchema,
} from './configuration';

/**
 * Name of the honeypot field. The contact form renders it hidden; humans leave
 * it empty, naive bots fill it in.
 */
export const HONEYPOT_FIELD = 'website';

/** Body of `POST /api/send-email`. */
export const sendEmailSchema = z.object({
  name: contactNameSchema,
  email: contactEmailSchema,
  phone: contactPhoneSchema,
  message: z
    .string()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  configurationLink: z
    .string()
    .max(300)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  configurationSummary: configurationDataSchema.optional().nullable(),
  [HONEYPOT_FIELD]: z.string().max(500).optional().nullable(),
});

export type SendEmailInput = z.infer<typeof sendEmailSchema>;

/** Normalise an origin like "https://example.com/" to "https://example.com"; null if invalid. */
export function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Accept only `${allowedOrigin}/configuration/<token>` (no query, no fragment).
 * Returns the token, or null when the link points anywhere else.
 */
export function parseConfigurationLink(link: string, allowedOrigin: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.origin !== allowedOrigin) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  const match = /^\/configuration\/([^/]+)$/.exec(url.pathname);
  if (!match || !CONFIGURATION_TOKEN_PATTERN.test(match[1])) return null;
  return match[1];
}

/** Canonical public link for a configuration token. */
export function buildConfigurationLink(origin: string, token: string): string {
  return `${origin}/configuration/${token}`;
}
