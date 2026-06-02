import { layout } from './layout.js';
import { escapeHtml } from './helpers.js';
import type { IdentityConnectorInfo, IdentityContext } from '../../identity/types.js';
import type { RecipientProfile } from '../../core/types.js';

const CONTEXT_BADGE: Record<IdentityContext, { label: string; cls: string }> = {
  government: { label: 'Government', cls: 'badge-info' },
  ngo: { label: 'NGO', cls: 'badge-success' },
  dao: { label: 'DAO / ReFi', cls: 'badge-secondary' },
  mobile: { label: 'Mobile money', cls: 'badge-warning' },
};

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

/**
 * Identity Providers admin page.
 *
 * Lists the registered non-custodial identity connectors and offers a form to
 * verify a recipient against one of them. The raw claim is sent once and never
 * stored — only the resulting hash + routing reference are persisted.
 */
export function renderIdentityPage(
  providers: IdentityConnectorInfo[],
  recentRecipients: RecipientProfile[],
  opts?: { flash?: string; flashVariant?: 'success' | 'error' | 'info' | 'warning' },
): string {
  const byContext = new Set(providers.map((p) => p.context)).size;

  const rows = providers
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

  const recipientOptions = recentRecipients
    .map(
      (r) =>
        `<option value="${escapeHtml(r.id)}">${escapeHtml(r.countryCode)} · ${escapeHtml(r.status)} · ${escapeHtml(r.id.slice(0, 8))}…</option>`,
    )
    .join('');

  const claimOptions = ['national_id', 'phone', 'wallet', 'community', 'bank_account']
    .map((c) => `<option value="${c}">${c}</option>`)
    .join('');

  return layout(
    'Identity Providers',
    `
    <div class="page-header">
      <h1>Identity Providers</h1>
      <p class="text-muted">
        Pluggable, non-custodial identity connectors. Each performs offline
        format/checksum validation, derives a non-reversible account hash, and
        delegates the authoritative KYC / personhood assertion to the external
        provider. OGI stores verified claims — never raw identity data.
      </p>
    </div>

    <div class="grid grid-3 mb-2">
      <div class="card stat-card">
        <div class="stat-value">${providers.length}</div>
        <div class="stat-label">Connectors</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value text-primary">${byContext}</div>
        <div class="stat-label">Contexts covered</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value text-success">Non-custodial</div>
        <div class="stat-label">No PII stored</div>
      </div>
    </div>

    <div class="card mb-2">
      <div class="card-header">
        <h2 class="card-title">Registered connectors</h2>
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
          <tbody>${rows || '<tr><td colspan="4" class="text-muted">No connectors registered</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Verify a recipient</h2>
      </div>
      <p class="text-sm text-muted mb-1">
        Run a recipient's claim through a provider. On success the recipient is
        marked <strong>verified</strong> and the hashed claim + routing reference
        are stored. The raw value is never persisted.
      </p>
      <form method="post" action="/admin/identity/verify" class="form-grid">
        <div class="form-group">
          <label for="id-recipient">Recipient</label>
          ${
            recentRecipients.length > 0
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

    ${
      recentRecipients.length > 0
        ? `
    <div class="card mt-2">
      <div class="card-header">
        <h2 class="card-title">Recent recipients</h2>
      </div>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr><th>ID</th><th>Country</th><th>Status</th><th>Provider</th><th>Routing ref</th></tr>
          </thead>
          <tbody>
            ${recentRecipients
              .map(
                (r) => `
              <tr>
                <td class="mono text-xs">${escapeHtml(r.id.slice(0, 8))}…</td>
                <td>${escapeHtml(r.countryCode)}</td>
                <td>${statusBadge(r.status)}</td>
                <td class="text-xs">${r.identityProvider ? escapeHtml(r.identityProvider) : '<span class="text-muted">—</span>'}</td>
                <td class="text-xs mono">${r.routingRef ? escapeHtml(r.routingRef) : '<span class="text-muted">—</span>'}</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>`
        : ''
    }
    `,
    {
      activePage: 'identity',
      flash: opts?.flash,
      flashVariant: opts?.flashVariant ?? 'info',
    },
  );
}
