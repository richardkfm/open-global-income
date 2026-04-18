import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  renderBreadcrumbs,
  renderDrawer,
  renderToast,
  renderCitations,
  renderCitationSup,
} from './helpers.js';
import type { Citation } from '../../core/types.js';

// ── escapeHtml ────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes &, <, >, and "', () => {
    expect(escapeHtml('<script>"alert"</script>&')).toBe(
      '&lt;script&gt;&quot;alert&quot;&lt;/script&gt;&amp;',
    );
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Hello world')).toBe('Hello world');
  });
});

// ── renderBreadcrumbs ─────────────────────────────────────────────────────────

describe('renderBreadcrumbs', () => {
  it('returns empty string for an empty array', () => {
    expect(renderBreadcrumbs([])).toBe('');
  });

  it('renders a single item as current (span, no href)', () => {
    const html = renderBreadcrumbs([{ label: 'Home' }]);
    expect(html).toContain('<nav');
    expect(html).toContain('breadcrumbs');
    expect(html).toContain('breadcrumb-current');
    expect(html).toContain('Home');
    expect(html).not.toContain('<a ');
  });

  it('renders the last item as current and earlier items as links', () => {
    const html = renderBreadcrumbs([
      { label: 'Countries', href: '/admin/countries' },
      { label: 'Kenya', href: '/admin/countries/KE' },
      { label: 'Simulate' },
    ]);
    expect(html).toContain('href="/admin/countries"');
    expect(html).toContain('href="/admin/countries/KE"');
    expect(html).toContain('breadcrumb-current');
    // Last item must NOT be a link
    const lastItemIndex = html.lastIndexOf('Simulate');
    const lastLinkIndex = html.lastIndexOf('<a ');
    expect(lastItemIndex).toBeGreaterThan(lastLinkIndex);
  });

  it('separates items with the breadcrumb-sep span', () => {
    const html = renderBreadcrumbs([
      { label: 'A', href: '/a' },
      { label: 'B' },
    ]);
    expect(html).toContain('breadcrumb-sep');
    expect(html).toContain('›');
  });

  it('HTML-escapes label text', () => {
    const html = renderBreadcrumbs([{ label: '<script>' }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('wraps in a <nav> with aria-label', () => {
    const html = renderBreadcrumbs([{ label: 'Home', href: '/' }]);
    expect(html).toContain('aria-label="Breadcrumb"');
  });
});

// ── renderDrawer ──────────────────────────────────────────────────────────────

describe('renderDrawer', () => {
  it('renders a <details> element with the given id', () => {
    const html = renderDrawer('drawer-1', 'Open me', 'Title', '<p>Content</p>');
    expect(html).toContain('<details');
    expect(html).toContain('id="drawer-1"');
  });

  it('renders the trigger label in the <summary>', () => {
    const html = renderDrawer('d', 'Open me', 'Title', '');
    expect(html).toContain('<summary');
    expect(html).toContain('Open me');
  });

  it('renders the title and content inside the drawer body', () => {
    const html = renderDrawer('d', 'Open', 'My Title', '<p>Body</p>');
    expect(html).toContain('My Title');
    expect(html).toContain('<p>Body</p>');
  });

  it('HTML-escapes trigger label and title', () => {
    const html = renderDrawer('d', '<b>trigger</b>', '<em>title</em>', '');
    expect(html).toContain('&lt;b&gt;trigger&lt;/b&gt;');
    expect(html).toContain('&lt;em&gt;title&lt;/em&gt;');
  });

  it('applies drawer CSS classes', () => {
    const html = renderDrawer('d', 'T', 'Ti', '');
    expect(html).toContain('class="drawer"');
    expect(html).toContain('drawer-summary');
    expect(html).toContain('drawer-body');
  });
});

// ── renderToast ───────────────────────────────────────────────────────────────

describe('renderToast', () => {
  it('renders with default info variant', () => {
    const html = renderToast('Hello');
    expect(html).toContain('toast-info');
    expect(html).toContain('Hello');
  });

  it('renders the correct variant class', () => {
    expect(renderToast('ok', 'success')).toContain('toast-success');
    expect(renderToast('err', 'error')).toContain('toast-error');
    expect(renderToast('warn', 'warning')).toContain('toast-warning');
    expect(renderToast('info', 'info')).toContain('toast-info');
  });

  it('has role="alert" for accessibility', () => {
    const html = renderToast('msg');
    expect(html).toContain('role="alert"');
  });

  it('HTML-escapes the message', () => {
    const html = renderToast('<b>bold</b>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
  });
});

// ── renderCitations ───────────────────────────────────────────────────────────

const sampleCitations: Citation[] = [
  {
    id: 'c1',
    indicatorCode: 'SI.POV.DDAY',
    source: 'World Bank',
    year: 2023,
    url: 'https://data.worldbank.org/indicator/SI.POV.DDAY',
    note: 'Poverty headcount at $2.15/day',
  },
  {
    id: 'c2',
    source: 'IMF Fiscal Monitor',
    year: 2014,
  },
];

describe('renderCitations', () => {
  it('returns empty string for an empty array', () => {
    expect(renderCitations([])).toBe('');
  });

  it('renders an ordered list with citation-list class', () => {
    const html = renderCitations(sampleCitations);
    expect(html).toContain('<ol');
    expect(html).toContain('citation-list');
    expect(html).toContain('</ol>');
  });

  it('renders each citation as a list item anchored at #cite-{id}', () => {
    const html = renderCitations(sampleCitations);
    expect(html).toContain('id="cite-c1"');
    expect(html).toContain('id="cite-c2"');
  });

  it('includes the source, year, and indicator code for each citation', () => {
    const html = renderCitations(sampleCitations);
    expect(html).toContain('World Bank');
    expect(html).toContain('2023');
    expect(html).toContain('SI.POV.DDAY');
    expect(html).toContain('IMF Fiscal Monitor');
    expect(html).toContain('2014');
  });

  it('renders a link when url is present', () => {
    const html = renderCitations(sampleCitations);
    expect(html).toContain('href="https://data.worldbank.org/indicator/SI.POV.DDAY"');
  });

  it('does not render a link when url is absent', () => {
    const html = renderCitations([{ id: 'c2', source: 'IMF', year: 2014 }]);
    // c2 has no url, so no href for an external link in that item
    expect(html).not.toContain('href=');
  });

  it('applies citation-item class to each list item', () => {
    const html = renderCitations(sampleCitations);
    const count = (html.match(/citation-item/g) ?? []).length;
    expect(count).toBe(sampleCitations.length);
  });
});

// ── renderCitationSup ─────────────────────────────────────────────────────────

describe('renderCitationSup', () => {
  it('renders a superscript link to the footnote anchor', () => {
    const html = renderCitationSup('c1');
    expect(html).toContain('<sup');
    expect(html).toContain('citation-sup');
    expect(html).toContain('href="#cite-c1"');
    expect(html).toContain('[c1]');
  });

  it('HTML-escapes the citation id', () => {
    const html = renderCitationSup('<x>');
    expect(html).not.toContain('<x>');
    expect(html).toContain('&lt;x&gt;');
  });
});
