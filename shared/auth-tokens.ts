/**
 * One-time auth token purposes — the discriminator of `auth_tokens`
 * (W3-B, migration 0591). The schema/migration CHECK lists these values.
 */
export const AUTH_TOKEN_PURPOSES = ["email_verification", "password_reset", "magic_link", "two_factor"] as const;
export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number];
