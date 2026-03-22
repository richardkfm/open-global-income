/** Server-rendered HTML layout for the admin UI */
import { escapeHtml } from './helpers.js';
import { t } from '../../i18n/index.js';

export interface LayoutOptions {
  activePage?: string;
  username?: string;
  role?: string;
}

export function layout(title: string, content: string, usernameOrOptions?: string | LayoutOptions): string {
  let activePage = '';
  let username = '';
  let role = '';

  if (typeof usernameOrOptions === 'string') {
    username = usernameOrOptions;
  } else if (usernameOrOptions) {
    activePage = usernameOrOptions.activePage ?? '';
    username = usernameOrOptions.username ?? '';
    role = usernameOrOptions.role ?? '';
  }

  function navLink(href: string, label: string, page: string): string {
    const active = activePage === page ? ' active' : '';
    return `<a href="${href}" class="sidebar-link${active}">${escapeHtml(label)}</a>`;
  }

  const avatarInitial = username ? escapeHtml(username.charAt(0).toUpperCase()) : 'A';
  const userSection = username
    ? `
    <div class="sidebar-user">
      <div class="sidebar-user-avatar">${avatarInitial}</div>
      <div class="sidebar-user-info">
        <div class="sidebar-user-name">${escapeHtml(username)}</div>
        <div class="sidebar-user-role">${escapeHtml(role || 'admin')}</div>
      </div>
    </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — OGI Admin</title>
  <link href="/css/ogi.css" rel="stylesheet">
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script src="/js/charts.js" defer></script>
</head>
<body>
<div class="app-layout">
  <div class="sidebar-overlay" onclick="this.classList.remove('open');document.querySelector('.sidebar').classList.remove('open')"></div>
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="sidebar-brand-name">${t('nav.brand')}</div>
      <div class="sidebar-brand-subtitle">Open Global Income</div>
    </div>
    <nav class="sidebar-nav">
      <div class="sidebar-section">
        <div class="sidebar-section-label">${t('nav.sectionOverview')}</div>
        ${navLink('/admin', t('nav.dashboard'), 'dashboard')}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-label">${t('nav.sectionTools')}</div>
        ${navLink('/admin/simulate', t('nav.simulate'), 'simulate')}
        ${navLink('/admin/pilots', t('nav.pilots'), 'pilots')}
        ${navLink('/admin/funding', t('nav.funding'), 'funding')}
        ${navLink('/admin/impact', t('nav.impact'), 'impact')}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-label">${t('nav.sectionData')}</div>
        ${navLink('/admin/countries', t('nav.countries'), 'countries')}
        ${navLink('/admin/regions', t('nav.regions'), 'regions')}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-label">${t('nav.sectionAdmin')}</div>
        ${navLink('/admin/api-keys', t('nav.apiKeys'), 'api-keys')}
        ${navLink('/admin/audit', t('nav.audit'), 'audit')}
      </div>
      <div class="sidebar-divider"></div>
      <a href="/admin/logout" class="sidebar-link">${t('nav.logout')}</a>
    </nav>
    ${userSection}
  </aside>
  <div class="mobile-header">
    <button class="mobile-hamburger" onclick="document.querySelector('.sidebar').classList.toggle('open');document.querySelector('.sidebar-overlay').classList.toggle('open')">&#9776;</button>
    <span>${t('nav.brand')}</span>
  </div>
  <main class="main-content">
    <div class="main-content-inner">
      ${content}
    </div>
  </main>
</div>
</body>
</html>`;
}
