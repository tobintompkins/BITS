/**
 * Data retention / permanent deletion helpers.
 *
 * Permanent member deletion is intentionally not implemented here.
 * Future work: Super-Admin-only hard-delete with retention policy checks,
 * related-record archival, and irreversible audit trail.
 *
 * Prefer archive / merge / deceased workflows over deletion.
 */

export const PERMANENT_DELETION_NOT_IMPLEMENTED =
  "Permanent member deletion is reserved for a future Super-Admin-only retention workflow. Prefer Archive.";
