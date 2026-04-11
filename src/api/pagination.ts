/**
 * Shared pagination helpers for API list endpoints.
 *
 * All /v1 list endpoints accept `page` and `limit` query parameters with
 * the same semantics. This module centralises the parsing, bounds clamping,
 * and response shape so every endpoint is consistent and every fix lands
 * in one place.
 *
 * Parsing rules:
 * - `page` defaults to 1, minimum 1. Non-numeric input falls back to 1.
 * - `limit` defaults to 20, minimum 1, maximum 100. Non-numeric input
 *   falls back to the default.
 *
 * Rationale: earlier revisions used
 *   `Math.max(1, parseInt(request.query.page ?? '1', 10))`
 * which returns NaN when `parseInt` fails (Math.max(1, NaN) === NaN),
 * corrupting OFFSET calculations. Always fall back to a numeric default.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Parsed pagination query. `offset` is pre-computed for SQL LIMIT/OFFSET. */
export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Parse `page` and `limit` query parameters into clamped numeric values.
 * Safe against NaN, empty strings, negative numbers, and oversized limits.
 */
export function parsePagination(query: { page?: string; limit?: string } | undefined): Pagination {
  const pageNum = parseInt(query?.page ?? '1', 10);
  const limitNum = parseInt(query?.limit ?? String(DEFAULT_LIMIT), 10);
  const page = Math.max(1, Number.isFinite(pageNum) ? pageNum : 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limitNum) ? limitNum : DEFAULT_LIMIT));
  return { page, limit, offset: (page - 1) * limit };
}

/** Canonical pagination envelope returned in list-endpoint responses. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Build the pagination envelope. `totalPages` is at least 1 so UIs that
 * expect a valid page-count never render "page 1 of 0" for empty result sets.
 */
export function buildPaginationMeta(pg: Pagination, total: number): PaginationMeta {
  return {
    page: pg.page,
    limit: pg.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / pg.limit)),
  };
}
