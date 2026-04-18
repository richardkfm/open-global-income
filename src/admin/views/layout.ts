/** Server-rendered HTML layout for the admin UI */
import { escapeHtml } from './helpers.js';
import { t } from '../../i18n/index.js';
import { packageVersion } from '../../config.js';

const REPO_URL = 'https://github.com/richardkfm/open-global-income';

export interface LayoutOptions {
  activePage?: string;
  username?: string;
  role?: string;
  /** Optional breadcrumb trail rendered above the main content area. */
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

// ---------------------------------------------------------------------------
// Navigation structure
// Each item maps directly to the keys used in en.ts so labels go through t().
// ---------------------------------------------------------------------------

interface NavItem {
  /** activePage key used to highlight the current page */
  key: string;
  href: string;
  /** i18n key for the link label */
  labelKey: string;
}

interface NavSection {
  /** i18n key for the section heading */
  labelKey: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: 'nav.sectionOverview',
    items: [
      { key: 'dashboard', href: '/admin', labelKey: 'nav.dashboard' },
    ],
  },
  {
    labelKey: 'nav.sectionPlan',
    items: [
      { key: 'countries', href: '/admin/countries', labelKey: 'nav.countries' },
      { key: 'regions',   href: '/admin/regions',   labelKey: 'nav.regions'   },
      { key: 'simulate',  href: '/admin/simulate',  labelKey: 'nav.simulate'  },
    ],
  },
  {
    labelKey: 'nav.sectionFund',
    items: [
      { key: 'funding', href: '/admin/funding', labelKey: 'nav.funding' },
    ],
  },
  {
    labelKey: 'nav.sectionModel',
    items: [
      { key: 'impact',   href: '/admin/impact',    labelKey: 'nav.impact'   },
      { key: 'programs', href: '/admin/programs',  labelKey: 'nav.briefs'   },
    ],
  },
  {
    labelKey: 'nav.sectionRun',
    items: [
      { key: 'pilots', href: '/admin/pilots', labelKey: 'nav.pilots' },
    ],
  },
  {
    labelKey: 'nav.sectionSystem',
    items: [
      { key: 'data-sources', href: '/admin/data-sources', labelKey: 'nav.dataSources' },
      { key: 'api-keys',     href: '/admin/api-keys',     labelKey: 'nav.apiKeys'     },
      { key: 'audit',        href: '/admin/audit',        labelKey: 'nav.audit'       },
    ],
  },
];

export function layout(title: string, content: string, usernameOrOptions?: string | LayoutOptions): string {
  let activePage = '';
  let username = '';
  let role = '';
  let breadcrumbs: Array<{ label: string; href?: string }> | undefined;

  if (typeof usernameOrOptions === 'string') {
    username = usernameOrOptions;
  } else if (usernameOrOptions) {
    activePage = usernameOrOptions.activePage ?? '';
    username = usernameOrOptions.username ?? '';
    role = usernameOrOptions.role ?? '';
    breadcrumbs = usernameOrOptions.breadcrumbs;
  }

  function navLink(href: string, label: string, page: string): string {
    const active = activePage === page ? ' active' : '';
    return `<a href="${href}" class="sidebar-link${active}">${escapeHtml(label)}</a>`;
  }

  // Build sidebar nav from NAV_SECTIONS data
  const navHtml = NAV_SECTIONS.map(section => {
    const itemsHtml = section.items
      .map(item => navLink(item.href, t(item.labelKey as Parameters<typeof t>[0]), item.key))
      .join('\n      ');
    return `<div class="sidebar-section">
        <div class="sidebar-section-label">${t(section.labelKey as Parameters<typeof t>[0])}</div>
        ${itemsHtml}
      </div>`;
  }).join('\n      ');

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

  // Breadcrumbs block (rendered if provided)
  const breadcrumbHtml = breadcrumbs && breadcrumbs.length > 0
    ? `<nav class="breadcrumbs" aria-label="Breadcrumb">
      ${breadcrumbs.map((crumb, i) => {
        const isLast = i === breadcrumbs!.length - 1;
        const sep = i > 0 ? '<span class="breadcrumb-sep" aria-hidden="true">›</span>' : '';
        const item = isLast || !crumb.href
          ? `<span class="breadcrumb-item breadcrumb-current">${escapeHtml(crumb.label)}</span>`
          : `<a class="breadcrumb-item" href="${crumb.href}">${escapeHtml(crumb.label)}</a>`;
        return sep + item;
      }).join('\n      ')}
    </nav>`
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
      ${navHtml}
      <div class="sidebar-divider"></div>
      <a href="/admin/logout" class="sidebar-link">${t('nav.logout')}</a>
    </nav>
    ${userSection}
    <div class="sidebar-footer">
      <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer" class="sidebar-footer-link">v${escapeHtml(packageVersion)}</a>
    </div>
  </aside>
  <div class="mobile-header">
    <button class="mobile-hamburger" onclick="document.querySelector('.sidebar').classList.toggle('open');document.querySelector('.sidebar-overlay').classList.toggle('open')">&#9776;</button>
    <span>${t('nav.brand')}</span>
  </div>
  <main class="main-content">
    ${breadcrumbHtml}
    <div class="main-content-inner">
      ${content}
    </div>
  </main>
</div>
</body>
</html>`;
}
