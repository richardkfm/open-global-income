import { layout } from './layout.js';
import { escapeHtml, formatDate } from './helpers.js';
import type { IdentityConnectorInfo, IdentityContext } from '../../identity/types.js';
import type { RecipientProfile, PaymentMethod } from '../../core/types.js';

const CONTEXT_BADGE: Record<IdentityContext, { label: string; cls: string }> = {
  government: { label: 'Government', cls: 'badge-info' },
  ngo: { label: 'NGO', cls: 'badge-success' },
  dao: { label: 'DAO / ReFi', cls: 'badge-secondary' },
  mobile: { label: 'Mobile money', cls: 'badge-warning' },
};

const PAYMENT_METHODS: PaymentMethod[] = ['sepa', 'mobile_money', 'crypto'];

function contextBadge(context: IdentityContext): string {
  const { label, cls } = CONTEXT_BADGE[context] ?? { label: context, cls: 'badge-neutral' };
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    verified: 'badge-success',
    pending: 'badge-warning',
    suspended: 'badge-neutral',
  };
  return `<span class="badge ${map[status] ?? 'badge-neutral'}">${escapeHtml(status)}</span>`;
}

function muted(value: string | null | undefined): string {
  return value ? escapeHtml(value) : '<span class="text-muted">—</span>';
}

// ── Bulk import result ────────────────────────────────────────────────────────

export interface RecipientImportResult {
  /** Total data rows the parser accepted before persistence. */
  parsedRows: number;
  created: number;
  skipped: Array<{ line: number; countryCode: string; reason: string }>;
  errors: Array<{ line: number; message: string }>;
}

function renderImportResult(result: RecipientImportResult): string {
  const skippedRows = result.skipped
    .map(
      (s) =>
        `<tr><td class="mono text-xs">${s.line}</td><td>${escapeHtml(s.countryCode)}</td><td class="text-xs">${escapeHtml(s.reason)}</td></tr>`,
    )
    .join('');
  const errorRows = result.errors
    .map(
      (e) =>
        `<tr><td class="mono text-xs">${e.line || '—'}</td><td class="text-xs">${escapeHtml(e.message)}</td></tr>`,
    )
    .join('');

  const variant = result.errors.length > 0 || result.skipped.length > 0 ? 'warning' : 'success';

  return `
    <div class="card mb-2 toast-${variant}" style="border-left:4px solid currentColor">
      <div class="card-header">
        <h2 class="card-title">Import result</h2>
      </div>
      <div class="grid grid-3 mb-1">
        <div><span class="stat-value text-success">${result.created}</span><div class="stat-label">Enrolled</div></div>
        <div><span class="stat-value">${result.skipped.length}</span><div class="stat-label">Skipped (duplicate)</div></div>
        <div><span class="stat-value text-danger">${result.errors.length}</span><div class="stat-label">Errors</div></div>
      </div>
      ${
        skippedRows
          ? `<details class="drawer mt-1"><summary class="drawer-summary">Skipped duplicates (${result.skipped.length})</summary>
              <div class="data-table-container"><table class="data-table">
                <thead><tr><th>Line</th><th>Country</th><th>Reason</th></tr></thead>
                <tbody>${skippedRows}</tbody>
              </table></div></details>`
          : ''
      }
      ${
        errorRows
          ? `<details class="drawer mt-1" open><summary class="drawer-summary">Errors (${result.errors.length})</summary>
              <div class="data-table-container"><table class="data-table">
                <thead><tr><th>Line</th><th>Message</th></tr></thead>
                <tbody>${errorRows}</tbody>
              </table></div></details>`
          : ''
      }
    </div>`;
}

// ── Filters + pagination helpers ────────────────────────────────────────────

export interface RecipientFilters {
  countryCode?: string;
  status?: string;
  pilotId?: string;
}

function filterQuery(filters: RecipientFilters, extra: Record<string, string | number> = {}): string {
  const params = new URLSearchParams();
  if (filters.countryCode) params.set('country', filters.countryCode);
  if (filters.status) params.set('status', filters.status);
  if (filters.pilotId) params.set('pilot', filters.pilotId);
  for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export interface IdentityPageData {
  providers: IdentityConnectorInfo[];
  recipients: RecipientProfile[];
  stats: { total: number; pending: number; verified: number; suspended: number };
  total: number;
  page: number;
  limit: number;
  countries: Array<{ code: string; name: string }>;
  pilots: Array<{ id: string; name: string }>;
  filters: RecipientFilters;
  importResult?: RecipientImportResult;
  flash?: string;
  flashVariant?: 'success' | 'error' | 'info' | 'warning';
}

/**
 * Identity Providers & Recipients admin page.
 *
 * Lists the registered non-custodial identity connectors, offers a form to
 * verify a recipient against one of them, and provides full recipient
 * management: enrol one, bulk-import many from CSV, filter/paginate the
 * registry, and drill into a recipient's detail page. The raw claim is sent
 * once during verification and never stored — only the resulting hash +
 * routing reference are persisted.
 */
export function renderIdentityPage(data: IdentityPageData): string {
  const { providers, recipients, stats, filters } = data;
  const byContext = new Set(providers.map((p) => p.context)).size;

  const providerRows = providers
    .map(
      (p) => `
      <tr>
        <td>
          <div class="text-bold">${escapeHtml(p.providerName)}</div>
          <div class="text-xs text-muted mono">${escapeHtml(p.providerId)}</div>
        </td>
        <td>${contextBadge(p.context)}</td>
        <td>
          <div class="flex gap-1" style="flex-wrap:wrap">
            ${p.supportedClaimTypes.map((c) => `<span class="badge badge-neutral">${escapeHtml(c)}</span>`).join('')}
          </div>
        </td>
        <td class="text-xs text-muted">${escapeHtml(p.description)}</td>
      </tr>`,
    )
    .join('');

  const providerOptions = providers
    .map(
      (p) =>
        `<option value="${escapeHtml(p.providerId)}" data-claims="${escapeHtml(p.supportedClaimTypes.join(','))}">${escapeHtml(p.providerName)}</option>`,
    )
    .join('');

  const recipientOptions = recipients
    .map(
      (r) =>
        `<option value="${escapeHtml(r.id)}">${escapeHtml(r.countryCode)} · ${escapeHtml(r.status)} · ${escapeHtml(r.id.slice(0, 8))}…</option>`,
    )
    .join('');

  const claimOptions = ['national_id', 'phone', 'wallet', 'community', 'bank_account']
    .map((c) => `<option value="${c}">${c}</option>`)
    .join('');

  const countryOptions = data.countries
    .map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`)
    .join('');

  const pilotOptions = data.pilots
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
    .join('');

  const paymentOptions = PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join('');

  // Filter dropdowns with the active value pre-selected.
  const sel = (current: string | undefined, value: string) =>
    current === value ? ' selected' : '';
  const filterCountryOptions = data.countries
    .map(
      (c) =>
        `<option value="${escapeHtml(c.code)}"${sel(filters.countryCode, c.code)}>${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`,
    )
    .join('');
  const filterPilotOptions = data.pilots
    .map(
      (p) =>
        `<option value="${escapeHtml(p.id)}"${sel(filters.pilotId, p.id)}>${escapeHtml(p.name)}</option>`,
    )
    .join('');
  const filterStatusOptions = ['pending', 'verified', 'suspended']
    .map((s) => `<option value="${s}"${sel(filters.status, s)}>${s}</option>`)
    .join('');

  const recipientRows =
    recipients.length === 0
      ? '<tr><td colspan="6" class="text-muted text-center">No recipients match these filters</td></tr>'
      : recipients
          .map(
            (r) => `
            <tr>
              <td><a href="/admin/identity/recipients/${escapeHtml(r.id)}" class="mono text-xs">${escapeHtml(r.id.slice(0, 8))}…</a></td>
              <td>${escapeHtml(r.countryCode)}</td>
              <td>${statusBadge(r.status)}</td>
              <td class="text-xs">${muted(r.paymentMethod)}</td>
              <td class="text-xs">${muted(r.identityProvider)}</td>
              <td class="text-xs mono">${muted(r.routingRef)}</td>
            </tr>`,
          )
          .join('');

  // Pagination
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  const prevLink =
    data.page > 1
      ? `<a class="btn btn-secondary btn-sm" href="/admin/identity${filterQuery(filters, { page: data.page - 1 })}">← Prev</a>`
      : '<span class="btn btn-secondary btn-sm" style="opacity:.4;pointer-events:none">← Prev</span>';
  const nextLink =
    data.page < totalPages
      ? `<a class="btn btn-secondary btn-sm" href="/admin/identity${filterQuery(filters, { page: data.page + 1 })}">Next →</a>`
      : '<span class="btn btn-secondary btn-sm" style="opacity:.4;pointer-events:none">Next →</span>';

  return layout(
    'Identity Providers',
    `
    <div class="page-header">
      <h1>Identity & Recipients</h1>
      <p class="text-muted">
        Pluggable, non-custodial identity connectors plus the recipient
        registry. Each connector performs offline format/checksum validation,
        derives a non-reversible account hash, and delegates the authoritative
        KYC / personhood assertion to the external provider. OGI stores verified
        claims — never raw identity data.
      </p>
    </div>

    ${data.importResult ? renderImportResult(data.importResult) : ''}

    <div class="grid grid-4 mb-2">
      <div class="card stat-card">
        <div class="stat-value">${stats.total}</div>
        <div class="stat-label">Recipients</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value text-success">${stats.verified}</div>
        <div class="stat-label">Verified</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value text-warning">${stats.pending}</div>
        <div class="stat-label">Pending</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">${stats.suspended}</div>
        <div class="stat-label">Suspended</div>
      </div>
    </div>

    <div class="card mb-2">
      <div class="card-header">
        <h2 class="card-title">Registered connectors (${providers.length} · ${byContext} contexts)</h2>
      </div>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Context</th>
              <th>Claim types</th>
              <th>What it validates</th>
            </tr>
          </thead>
          <tbody>${providerRows || '<tr><td colspan="4" class="text-muted">No connectors registered</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="grid grid-2 mb-2">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Enrol a recipient</h2>
        </div>
        <p class="text-sm text-muted mb-1">
          Creates a recipient in <strong>pending</strong> status. Identity is
          verified separately (below) — no raw identity data is collected here.
        </p>
        <form method="post" action="/admin/identity/recipients" class="form-grid">
          <div class="form-group">
            <label for="r-country">Country</label>
            <select id="r-country" name="countryCode" class="form-input" required>
              <option value="">Select a country…</option>
              ${countryOptions}
            </select>
          </div>
          <div class="form-group">
            <label for="r-payment">Payment method <span class="text-muted text-xs">(optional)</span></label>
            <select id="r-payment" name="paymentMethod" class="form-input">
              <option value="">—</option>
              ${paymentOptions}
            </select>
          </div>
          <div class="form-group">
            <label for="r-pilot">Pilot <span class="text-muted text-xs">(optional)</span></label>
            <select id="r-pilot" name="pilotId" class="form-input">
              <option value="">—</option>
              ${pilotOptions}
            </select>
          </div>
          <div>
            <button type="submit" class="btn btn-primary">Enrol</button>
          </div>
        </form>
      </div>

      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Verify a recipient</h2>
        </div>
        <p class="text-sm text-muted mb-1">
          Run a recipient's claim through a provider. On success the recipient is
          marked <strong>verified</strong> and the hashed claim + routing
          reference are stored. The raw value is never persisted.
        </p>
        <form method="post" action="/admin/identity/verify" class="form-grid">
          <div class="form-group">
            <label for="id-recipient">Recipient</label>
            ${
              recipients.length > 0
                ? `<select id="id-recipient" name="recipientId" class="form-input" required>
                    <option value="">Select a recipient…</option>
                    ${recipientOptions}
                  </select>`
                : `<input id="id-recipient" name="recipientId" class="form-input" placeholder="recipient UUID" required>`
            }
          </div>
          <div class="form-group">
            <label for="id-provider">Provider</label>
            <select id="id-provider" name="provider" class="form-input" required>
              ${providerOptions}
            </select>
          </div>
          <div class="form-group">
            <label for="id-claimtype">Claim type</label>
            <select id="id-claimtype" name="claimType" class="form-input" required>
              ${claimOptions}
            </select>
          </div>
          <div class="form-group">
            <label for="id-claimref">Claim reference</label>
            <input id="id-claimref" name="claimReference" class="form-input"
                   placeholder="e.g. national ID, +254…, 0x…, org:witnessA:witnessB" required>
          </div>
          <div>
            <button type="submit" class="btn btn-primary">Verify</button>
          </div>
        </form>
      </div>
    </div>

    <div class="card mb-2">
      <div class="card-header">
        <h2 class="card-title">Bulk import recipients</h2>
      </div>
      <p class="text-sm text-muted mb-1">
        Paste CSV rows below. The first line is a header. Only
        <code>countryCode</code> is required; <code>paymentMethod</code>,
        <code>accountHash</code>, <code>routingRef</code> and
        <code>identityProvider</code> are optional. Rows whose
        <code>accountHash</code> is already enrolled in the same country are
        skipped (cross-program de-duplication). Never paste raw identity data —
        only pre-computed, non-reversible hashes.
      </p>
      <form method="post" action="/admin/identity/recipients/import">
        <div class="form-group">
          <label for="r-csv">CSV</label>
          <textarea id="r-csv" name="csv" class="form-input mono" rows="8"
            placeholder="countryCode,paymentMethod,accountHash,routingRef,identityProvider
KE,mobile_money,,,
TZ,sepa,abc123hash,••••1234,national-id"></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Import</button>
      </form>
    </div>

    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
        <h2 class="card-title" style="margin:0">Recipients (${data.total})</h2>
        <a href="/admin/identity/recipients/export${filterQuery(filters)}"
           class="btn btn-secondary btn-sm" style="margin-left:auto">Download CSV</a>
      </div>
      <form method="get" action="/admin/identity" class="form-row mb-1" style="gap:0.75rem;flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="flex:1;min-width:160px">
          <label for="f-country">Country</label>
          <select id="f-country" name="country" class="form-input">
            <option value="">All countries</option>
            ${filterCountryOptions}
          </select>
        </div>
        <div class="form-group" style="flex:1;min-width:140px">
          <label for="f-status">Status</label>
          <select id="f-status" name="status" class="form-input">
            <option value="">All statuses</option>
            ${filterStatusOptions}
          </select>
        </div>
        <div class="form-group" style="flex:1;min-width:160px">
          <label for="f-pilot">Pilot</label>
          <select id="f-pilot" name="pilot" class="form-input">
            <option value="">All pilots</option>
            ${filterPilotOptions}
          </select>
        </div>
        <div class="form-group">
          <button type="submit" class="btn btn-secondary">Filter</button>
          <a href="/admin/identity" class="btn btn-secondary">Reset</a>
        </div>
      </form>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr><th>ID</th><th>Country</th><th>Status</th><th>Payment</th><th>Provider</th><th>Routing ref</th></tr>
          </thead>
          <tbody>${recipientRows}</tbody>
        </table>
      </div>
      <div class="flex gap-1 mt-1" style="align-items:center;justify-content:space-between">
        <span class="text-xs text-muted">Page ${data.page} of ${totalPages}</span>
        <div class="flex gap-1">${prevLink}${nextLink}</div>
      </div>
    </div>
    `,
    {
      activePage: 'identity',
      flash: data.flash,
      flashVariant: data.flashVariant ?? 'info',
    },
  );
}

// ── Recipient detail page ─────────────────────────────────────────────────────

/** Legal next states from each status — mirrors the recipients API. */
const NEXT_STATES: Record<string, string[]> = {
  pending: ['verified', 'suspended'],
  verified: ['suspended'],
  suspended: ['pending'],
};

export interface RecipientDetailData {
  recipient: RecipientProfile;
  pilotName?: string | null;
  flash?: string;
  flashVariant?: 'success' | 'error' | 'info' | 'warning';
}

export function renderRecipientDetailPage(data: RecipientDetailData): string {
  const r = data.recipient;
  const transitions = NEXT_STATES[r.status] ?? [];

  const transitionButtons =
    transitions.length === 0
      ? '<span class="text-muted text-sm">No further transitions available.</span>'
      : transitions
          .map(
            (next) => `
            <form method="post" action="/admin/identity/recipients/${escapeHtml(r.id)}/status" style="display:inline">
              <input type="hidden" name="status" value="${escapeHtml(next)}">
              <button type="submit" class="btn btn-secondary btn-sm">Move to ${escapeHtml(next)}</button>
            </form>`,
          )
          .join(' ');

  const field = (label: string, value: string) =>
    `<div class="form-group"><label>${escapeHtml(label)}</label><div>${value}</div></div>`;

  return layout(
    'Recipient',
    `
    <div class="page-header">
      <h1>Recipient</h1>
      <p class="text-muted mono text-sm">${escapeHtml(r.id)}</p>
    </div>

    <div class="card mb-2">
      <div class="card-header">
        <h2 class="card-title">Status: ${statusBadge(r.status)}</h2>
      </div>
      <div class="flex gap-1" style="flex-wrap:wrap">${transitionButtons}</div>
      ${
        r.status !== 'suspended'
          ? '<p class="text-xs text-muted mt-1">Verify this recipient against an identity provider from the <a href="/admin/identity">Identity page</a>.</p>'
          : ''
      }
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Details</h2>
      </div>
      <div class="form-grid">
        ${field('Country', escapeHtml(r.countryCode))}
        ${field('Payment method', muted(r.paymentMethod))}
        ${field('Identity provider', muted(r.identityProvider))}
        ${field('Routing reference', `<span class="mono">${muted(r.routingRef)}</span>`)}
        ${field('Account hash', r.accountHash ? '<span class="badge badge-success">stored</span>' : '<span class="text-muted">none</span>')}
        ${field('Pilot', muted(data.pilotName ?? r.pilotId))}
        ${field('Verified at', r.verifiedAt ? escapeHtml(formatDate(r.verifiedAt)) : '<span class="text-muted">not verified</span>')}
        ${field('Enrolled', escapeHtml(formatDate(r.createdAt)))}
      </div>
    </div>
    `,
    {
      activePage: 'identity',
      breadcrumbs: [
        { label: 'Identity & Recipients', href: '/admin/identity' },
        { label: r.id.slice(0, 8) + '…' },
      ],
      flash: data.flash,
      flashVariant: data.flashVariant ?? 'info',
    },
  );
}
