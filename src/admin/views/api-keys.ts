import { layout } from './layout.js';
import { escapeHtml, formatDate } from './helpers.js';
import { t } from '../../i18n/index.js';
import type { ApiKey } from '../../db/api-keys.js';

export function renderApiKeys(keys: ApiKey[], flash?: string): string {
  const flashHtml = flash
    ? `<div class="flash">${escapeHtml(flash)}</div>`
    : '';

  const rows = keys.length === 0
    ? `<tr><td colspan="6" class="text-muted">${t('common.noData')}</td></tr>`
    : keys
        .map(
          (k) => `
      <tr>
        <td>${escapeHtml(k.name)}</td>
        <td><span class="badge badge-${escapeHtml(k.tier)}">${escapeHtml(k.tier)}</span></td>
        <td><span class="badge ${k.active ? 'badge-active' : 'badge-inactive'}">${k.active ? t('apiKeys.statusActive') : t('apiKeys.statusRevoked')}</span></td>
        <td>${formatDate(k.createdAt)}</td>
        <td>${k.lastUsedAt ? formatDate(k.lastUsedAt) : t('common.none')}</td>
        <td>
          ${
            k.active
              ? `<button class="btn btn-danger btn-sm"
                   hx-post="/admin/api-keys/${escapeHtml(String(k.id))}/revoke"
                   hx-confirm="${t('apiKeys.revokeConfirm')}"
                   hx-target="body">${t('apiKeys.revokeButton')}</button>`
              : ''
          }
        </td>
      </tr>`,
        )
        .join('');

  return layout(
    t('apiKeys.title'),
    `
    <h1 class="mt-1">${t('apiKeys.title')}</h1>
    ${flashHtml}

    <div class="card mt-1">
      <h2>${t('apiKeys.createNew')}</h2>
      <form method="POST" action="/admin/api-keys" class="form-inline">
        <div class="form-field">
          <label class="form-label">${t('apiKeys.name')}</label>
          <input class="form-input" type="text" name="name" required placeholder="${t('apiKeys.namePlaceholder')}">
        </div>
        <div class="form-field">
          <label class="form-label">${t('apiKeys.tier')}</label>
          <select class="form-select" name="tier">
            <option value="free">${t('apiKeys.tierFree')}</option>
            <option value="standard">${t('apiKeys.tierStandard')}</option>
            <option value="premium">${t('apiKeys.tierPremium')}</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">${t('apiKeys.create')}</button>
      </form>
    </div>

    <div class="card mt-1">
      <h2>${t('apiKeys.allKeys')} (${keys.length})</h2>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('apiKeys.colName')}</th>
              <th>${t('apiKeys.colTier')}</th>
              <th>${t('apiKeys.colStatus')}</th>
              <th>${t('apiKeys.colCreated')}</th>
              <th>${t('apiKeys.colLastUsed')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `,
  );
}
