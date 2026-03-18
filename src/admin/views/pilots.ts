import { layout } from './layout.js';
import type { Pilot, Disbursement, SavedSimulation } from '../../core/types.js';
import type { Country } from '../../core/types.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function statusBadge(status: string): string {
  const classes: Record<string, string> = {
    planning: 'badge-free',
    active: 'badge-active',
    paused: 'badge-premium',
    completed: 'badge-standard',
  };
  return `<span class="badge ${classes[status] ?? 'badge-free'}">${escapeHtml(status)}</span>`;
}

export function renderPilotsPage(
  pilots: Pilot[],
  countries: Country[],
  simulations: SavedSimulation[],
  flash?: string,
): string {
  const flashHtml = flash ? `<div class="flash">${escapeHtml(flash)}</div>` : '';

  const countryOptions = countries
    .map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`)
    .join('');

  const simOptions = simulations
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name ?? s.id.slice(0, 8))} — ${escapeHtml(s.countryCode)}</option>`)
    .join('');

  const rows = pilots
    .map(
      (p) => `<tr>
        <td><a href="/admin/pilots/${escapeHtml(p.id)}">${escapeHtml(p.name)}</a></td>
        <td>${escapeHtml(p.countryCode)}</td>
        <td>${statusBadge(p.status)}</td>
        <td>${p.targetRecipients ? formatNumber(p.targetRecipients) : '—'}</td>
        <td>${p.startDate ?? '—'}</td>
        <td>${p.createdAt.slice(0, 10)}</td>
      </tr>`,
    )
    .join('');

  const content = `
    <h1>Pilots</h1>
    ${flashHtml}

    <div class="card">
      <h2>Create Pilot</h2>
      <form method="POST" action="/admin/pilots/create">
        <label>Name <input type="text" name="name" required></label>
        <label>Country <select name="countryCode" required><option value="">Select…</option>${countryOptions}</select></label>
        <label>Simulation <select name="simulationId"><option value="">(none)</option>${simOptions}</select></label>
        <label>Target Recipients <input type="number" name="targetRecipients" min="1" placeholder="optional"></label>
        <label>Start Date <input type="date" name="startDate"></label>
        <label>End Date <input type="date" name="endDate"></label>
        <label>Description <input type="text" name="description" placeholder="optional"></label>
        <button type="submit" class="btn btn-primary">Create</button>
      </form>
    </div>

    <div class="card">
      <h2>All Pilots (${pilots.length})</h2>
      ${
        pilots.length === 0
          ? '<p>No pilots yet.</p>'
          : `<table>
              <thead><tr><th>Name</th><th>Country</th><th>Status</th><th>Recipients</th><th>Start</th><th>Created</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>`
      }
    </div>`;

  return layout('Pilots', content);
}

export function renderPilotDetailPage(
  pilot: Pilot,
  disbursements: Disbursement[],
  simulation: SavedSimulation | null,
  flash?: string,
): string {
  const flashHtml = flash ? `<div class="flash">${escapeHtml(flash)}</div>` : '';

  let totalDisbursed = 0;
  let totalRecipients = 0;
  for (const d of disbursements) {
    totalDisbursed += parseFloat(d.totalAmount) || 0;
    totalRecipients += d.recipientCount;
  }
  const avgPerRecipient = totalRecipients > 0 ? totalDisbursed / totalRecipients : 0;

  let varianceHtml = '';
  if (simulation) {
    const projected = simulation.results.simulation.cost.annualPppUsd;
    const varianceNum = projected > 0 ? ((totalDisbursed - projected) / projected) * 100 : 0;
    const varianceStr = varianceNum >= 0
      ? `+${Math.round(varianceNum * 10) / 10}%`
      : `${Math.round(varianceNum * 10) / 10}%`;
    varianceHtml = `
      <div class="card">
        <h2>Simulation Variance</h2>
        <div class="grid">
          <div><div class="stat">${formatNumber(Math.round(projected))}</div><div class="stat-label">Projected Cost (PPP-USD)</div></div>
          <div><div class="stat">${formatNumber(Math.round(totalDisbursed))}</div><div class="stat-label">Actual Disbursed</div></div>
          <div><div class="stat">${varianceStr}</div><div class="stat-label">Variance</div></div>
        </div>
      </div>`;
  }

  const disbursementRows = disbursements
    .map(
      (d) => `<tr>
        <td>${escapeHtml(d.id.slice(0, 8))}…</td>
        <td>${escapeHtml(d.totalAmount)}</td>
        <td>${escapeHtml(d.currency)}</td>
        <td>${formatNumber(d.recipientCount)}</td>
        <td>${statusBadge(d.status)}</td>
        <td>${d.createdAt.slice(0, 10)}</td>
      </tr>`,
    )
    .join('');

  // Status transition buttons
  const transitions: Record<string, string[]> = {
    planning: ['active', 'completed'],
    active: ['paused', 'completed'],
    paused: ['active', 'completed'],
    completed: [],
  };
  const availableTransitions = transitions[pilot.status] ?? [];
  const transitionButtons = availableTransitions
    .map(
      (s) =>
        `<form method="POST" action="/admin/pilots/${escapeHtml(pilot.id)}/status" style="display:inline">
          <input type="hidden" name="status" value="${escapeHtml(s)}">
          <button type="submit" class="btn ${s === 'completed' ? 'btn-primary' : 'btn-sm'}">${escapeHtml(s.charAt(0).toUpperCase() + s.slice(1))}</button>
        </form>`,
    )
    .join(' ');

  const content = `
    <h1>${escapeHtml(pilot.name)} ${statusBadge(pilot.status)}</h1>
    ${flashHtml}

    <div class="card">
      <h2>Details</h2>
      <table>
        <tr><td><strong>Country</strong></td><td>${escapeHtml(pilot.countryCode)}</td></tr>
        <tr><td><strong>Start Date</strong></td><td>${pilot.startDate ?? '—'}</td></tr>
        <tr><td><strong>End Date</strong></td><td>${pilot.endDate ?? '—'}</td></tr>
        <tr><td><strong>Description</strong></td><td>${pilot.description ? escapeHtml(pilot.description) : '—'}</td></tr>
        <tr><td><strong>Simulation</strong></td><td>${pilot.simulationId ? escapeHtml(pilot.simulationId.slice(0, 8)) + '…' : '—'}</td></tr>
      </table>
      ${availableTransitions.length > 0 ? `<div class="mt-1">Transition: ${transitionButtons}</div>` : ''}
    </div>

    <div class="card">
      <h2>Summary</h2>
      <div class="grid">
        <div><div class="stat">${pilot.targetRecipients ? formatNumber(pilot.targetRecipients) : '—'}</div><div class="stat-label">Target Recipients</div></div>
        <div><div class="stat">${formatNumber(Math.round(totalDisbursed))}</div><div class="stat-label">Total Disbursed</div></div>
        <div><div class="stat">${disbursements.length}</div><div class="stat-label">Disbursements</div></div>
        <div><div class="stat">${formatNumber(Math.round(avgPerRecipient * 100) / 100)}</div><div class="stat-label">Avg Per Recipient</div></div>
      </div>
    </div>

    ${varianceHtml}

    <div class="card">
      <h2>Disbursements (${disbursements.length})</h2>
      ${
        disbursements.length === 0
          ? '<p>No disbursements linked yet.</p>'
          : `<table>
              <thead><tr><th>ID</th><th>Amount</th><th>Currency</th><th>Recipients</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>${disbursementRows}</tbody>
            </table>`
      }
      <div class="mt-1">
        <form method="POST" action="/admin/pilots/${escapeHtml(pilot.id)}/link-disbursement">
          <label>Link Disbursement <input type="text" name="disbursementId" placeholder="Disbursement ID" required></label>
          <button type="submit" class="btn btn-primary btn-sm">Link</button>
        </form>
      </div>
    </div>

    <div class="mt-1"><a href="/admin/pilots">← Back to Pilots</a></div>`;

  return layout(`Pilot: ${pilot.name}`, content);
}
