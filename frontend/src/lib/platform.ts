/**
 * White-label platform identity. The product is a multi-tenant ERP — the
 * brands it manages (Alia Hijab, Noori, or fifty others) are *data*, loaded
 * per workspace after sign-in. Anything shown before a session exists, or
 * anywhere that describes the software rather than a tenant, reads from
 * here so onboarding a new brand never means editing chrome.
 */
export const PLATFORM_NAME = "Company ERP";
export const PLATFORM_CAPTION = "Enterprise Resource & Inventory Management";
export const PLATFORM_EDITION = "Enterprise Edition v2.0";
