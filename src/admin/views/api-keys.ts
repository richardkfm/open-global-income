import { layout } from './layout.js';
import type { ApiKey } from '../../db/api-keys.js';

export function renderApiKeys(keys: ApiKey[], flash?: string): string {
  const flashHtml = flash ? `<div class="flash">${escapeHtml(flash)}</div>` : '';

  const rows = keys
    .map(
      (k) => `
      <tr>
        <td>${escapeHtml(k.name)}</td>
        <td><span class="badge badge-${k.tier}">${k.tier}</span></td>
        <td><span class="badge ${k.active ? 'badge-active' : 'badge-inactive'}">${k.active ? 'active' : 'revoked'}</span></td>
        <td>${escapeHtml(k.createdAt)}</td>
        <td>${k.lastUsedAt ? escapeHtml(k.lastUsedAt) : '—'}</td>
        <td>
          ${
            k.active
              ? `<button class="btn btn-danger btn-sm"
                   hx-post="/admin/api-keys/${k.id}/revoke"
                   hx-confirm="Revoke this API key?"
                   hx-target="body">Revoke</button>`
              : ''
          }
        </td>
      </tr>`,
    )
    .join('');

  return layout(
    'API Keys',
    `
    <h1 class="mt-1">API Keys</h1>
    ${flashHtml}
    <div class="card mt-1">
      <h2>Create New Key</h2>
      <form method="POST" action="/admin/api-keys">
        <div>
          <label>Name</label><br>
          <input type="text" name="name" required placeholder="My App">
        </div>
        <div>
          <label>Tier</label><br>
          <select name="tier">
            <option value="free">Free (30 req/min)</option>
            <option value="standard">Standard (100 req/min)</option>
            <option value="premium">Premium (500 req/min)</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Create</button>
      </form>
    </div>
    <div class="card mt-1">
      <h2>All Keys (${keys.length})</h2>
      <table>
        <thead>
          <tr><th>Name</th><th>Tier</th><th>Status</th><th>Created</th><th>Last Used</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `,
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
