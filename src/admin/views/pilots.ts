import { layout } from './layout.js';
import { escapeHtml, formatNumber, formatCompact } from './helpers.js';
import { t } from '../../i18n/index.js';
import { getCurrencyForCountry, formatLocalCurrency } from '../../data/currencies.js';
import type { Pilot, Disbursement, SavedSimulation } from '../../core/types.js';
import type { Country } from '../../core/types.js';

function statusBadge(status: string): string {
  const classes: Record<string, string> = {
    planning: 'badge-neutral',
    active: 'badge-success',
    paused: 'badge-warning',
    completed: 'badge-info',
  };
  return `<span class="badge ${classes[status] ?? 'badge-neutral'}">${escapeHtml(status)}</span>`;
}

export function renderPilotsPage(
  pilots: Pilot[],
  countries: Country[],
  simulations: SavedSimulation[],
  flash?: string,
): string {
  const countryOpts = countries
    .map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`)
    .join('');

  const simOpts = simulations
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name ?? s.id.slice(0, 8))} — ${escapeHtml(s.countryCode)}</option>`)
    .join('');

  const rows =
    pilots.length === 0
      ? `<tr><td colspan="6" class="text-muted text-center">${t('pilots.noPilots')}</td></tr>`
      : pilots
          .map(
            (p) => `<tr>
        <td><a href="/admin/pilots/${escapeHtml(p.id)}">${escapeHtml(p.name)}</a></td>
        <td>${escapeHtml(p.countryCode)}</td>
        <td>${statusBadge(p.status)}</td>
        <td class="text-right">${p.targetRecipients ? formatNumber(p.targetRecipients) : t('common.none')}</td>
        <td>${p.startDate ?? t('common.none')}</td>
        <td>${p.createdAt.slice(0, 10)}</td>
      </tr>`,
          )
          .join('');

  return layout(
    t('pilots.title'),
    `
    <div class="page-header">
      <h1>${t('pilots.title')}</h1>
    </div>
    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">${t('pilots.createPilot')}</h2>
      </div>
      <form method="POST" action="/admin/pilots/create">
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label>${t('pilots.name')}</label>
            <input type="text" name="name" required>
          </div>
          <div class="form-group" style="flex:1">
            <label>${t('pilots.country')}</label>
            <select name="countryCode" required>
              <option value="">${t('pilots.selectCountry')}</option>
              ${countryOpts}
            </select>
          </div>
          <div class="form-group" style="flex:1">
            <label>${t('pilots.simulation')}</label>
            <select name="simulationId">
              <option value="">${t('pilots.simulationNone')}</option>
              ${simOpts}
            </select>
          </div>
        </div>
        <div class="form-row mt-1">
          <div class="form-group" style="flex:1">
            <label>${t('pilots.targetRecipients')}</label>
            <input type="number" name="targetRecipients" min="1" placeholder="${t('pilots.targetRecipientsPlaceholder')}">
          </div>
          <div class="form-group" style="flex:1">
            <label>${t('pilots.startDate')}</label>
            <input type="date" name="startDate">
          </div>
          <div class="form-group" style="flex:1">
            <label>${t('pilots.endDate')}</label>
            <input type="date" name="endDate">
          </div>
        </div>
        <div class="form-group mt-1">
          <label>${t('pilots.description')}</label>
          <input type="text" name="description" placeholder="${t('pilots.descriptionPlaceholder')}">
        </div>
        <div class="mt-1">
          <button type="submit" class="btn btn-primary">${t('pilots.createButton')}</button>
        </div>
      </form>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">${t('pilots.allPilots')} (${pilots.length})</h2>
      </div>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('pilots.colName')}</th>
              <th>${t('pilots.colCountry')}</th>
              <th>${t('pilots.colStatus')}</th>
              <th class="text-right">${t('pilots.colRecipients')}</th>
              <th>${t('pilots.colStart')}</th>
              <th>${t('pilots.colCreated')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `,
  );
}

export function renderPilotDetailPage(
  pilot: Pilot,
  disbursements: Disbursement[],
  simulation: SavedSimulation | null,
  flash?: string,
): string {
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
        <div class="card-header">
          <h2 class="card-title">${t('pilots.simulationVariance')}</h2>
        </div>
        <div class="grid grid-3">
          <div class="card stat-card">
            <div class="stat-value">${formatNumber(Math.round(projected))}</div>
            <div class="stat-label">${t('pilots.projectedCost')}</div>
          </div>
          <div class="card stat-card">
            <div class="stat-value">${formatNumber(Math.round(totalDisbursed))}</div>
            <div class="stat-label">${t('pilots.actualDisbursed')}</div>
          </div>
          <div class="card stat-card">
            <div class="stat-value">${varianceStr}</div>
            <div class="stat-label">${t('pilots.variance')}</div>
          </div>
        </div>
      </div>`;
  }

  const disbursementRows = disbursements.length === 0
    ? `<tr><td colspan="6" class="text-muted text-center">${t('pilots.noDisbursements')}</td></tr>`
    : disbursements
        .map(
          (d) => `<tr>
        <td class="mono">${escapeHtml(d.id.slice(0, 8))}${t('common.ellipsis')}</td>
        <td class="text-right">${escapeHtml(d.totalAmount)}</td>
        <td>${escapeHtml(d.currency)}</td>
        <td class="text-right">${formatNumber(d.recipientCount)}</td>
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
        `<form method="POST" action="/admin/pilots/${escapeHtml(pilot.id)}/status" class="form-inline">
          <input type="hidden" name="status" value="${escapeHtml(s)}">
          <button type="submit" class="btn ${s === 'completed' ? 'btn-primary' : 'btn-secondary'} btn-sm">${escapeHtml(s.charAt(0).toUpperCase() + s.slice(1))}</button>
        </form>`,
    )
    .join(' ');

  return layout(
    `Pilot: ${pilot.name}`,
    `
    <div class="page-header">
      <div class="page-header-row">
        <h1>${escapeHtml(pilot.name)} ${statusBadge(pilot.status)}</h1>
      </div>
    </div>
    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">${t('pilots.details')}</h2>
      </div>
      <div class="data-table-container">
        <table class="data-table">
          <tbody>
            <tr><td class="text-bold">${t('pilots.detailCountry')}</td><td>${escapeHtml(pilot.countryCode)}</td></tr>
            <tr><td class="text-bold">${t('pilots.detailStartDate')}</td><td>${pilot.startDate ?? t('common.none')}</td></tr>
            <tr><td class="text-bold">${t('pilots.detailEndDate')}</td><td>${pilot.endDate ?? t('common.none')}</td></tr>
            <tr><td class="text-bold">${t('pilots.detailDescription')}</td><td>${pilot.description ? escapeHtml(pilot.description) : t('common.none')}</td></tr>
            <tr><td class="text-bold">${t('pilots.detailSimulation')}</td><td>${pilot.simulationId ? escapeHtml(pilot.simulationId.slice(0, 8)) + t('common.ellipsis') : t('common.none')}</td></tr>
          </tbody>
        </table>
      </div>
      ${availableTransitions.length > 0 ? `<div class="mt-1 flex gap-1">${t('pilots.transition')} ${transitionButtons}</div>` : ''}
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">${t('pilots.summary')}</h2>
      </div>
      <div class="grid grid-4">
        <div class="card stat-card">
          <div class="stat-value">${pilot.targetRecipients ? formatCompact(pilot.targetRecipients) : t('common.none')}</div>
          <div class="stat-label">${t('pilots.targetRecipientsLabel')}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${formatNumber(Math.round(totalDisbursed))}</div>
          <div class="stat-label">${t('pilots.totalDisbursed')}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${disbursements.length}</div>
          <div class="stat-label">${t('pilots.disbursementsCount')}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${formatNumber(Math.round(avgPerRecipient * 100) / 100)}</div>
          <div class="stat-label">${t('pilots.avgPerRecipient')}</div>
        </div>
      </div>
    </div>

    ${varianceHtml}

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">${t('pilots.disbursementsTitle')} (${disbursements.length})</h2>
      </div>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('pilots.colId')}</th>
              <th class="text-right">${t('pilots.colAmount')}</th>
              <th>${t('pilots.colCurrency')}</th>
              <th class="text-right">${t('pilots.colRecipientsCount')}</th>
              <th>${t('pilots.colDisbStatus')}</th>
              <th>${t('pilots.colDisbCreated')}</th>
            </tr>
          </thead>
          <tbody>${disbursementRows}</tbody>
        </table>
      </div>
      <div class="mt-1">
        <form method="POST" action="/admin/pilots/${escapeHtml(pilot.id)}/link-disbursement" class="form-inline">
          <div class="form-group">
            <label>${t('pilots.linkDisbursement')}</label>
            <input type="text" name="disbursementId" placeholder="${t('pilots.disbursementIdPlaceholder')}" required>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">${t('pilots.linkButton')}</button>
        </form>
      </div>
    </div>

    <div class="mt-2"><a href="/admin/pilots">${t('pilots.backToPilots')}</a></div>
  `,
  );
}
