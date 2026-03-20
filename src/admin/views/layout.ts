/** Server-rendered HTML layout for the admin UI */
export function layout(title: string, content: string, username?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — OGI Admin</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <style>
    :root { --bg: #f8f9fa; --card: #fff; --border: #dee2e6; --primary: #0d6efd; --danger: #dc3545; --success: #198754; --text: #212529; --muted: #6c757d; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
    .container { max-width: 960px; margin: 0 auto; padding: 1rem; }
    nav { background: var(--text); color: #fff; padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; }
    nav a { color: #fff; text-decoration: none; margin-left: 1rem; }
    nav a:hover { text-decoration: underline; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 0.5rem; padding: 1.25rem; margin-bottom: 1rem; }
    .card h2 { margin-bottom: 0.75rem; font-size: 1.1rem; }
    .stat { font-size: 2rem; font-weight: 700; color: var(--primary); }
    .stat-label { color: var(--muted); font-size: 0.85rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid var(--border); }
    th { font-weight: 600; background: var(--bg); }
    .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; }
    .badge-free { background: #e2e3e5; color: #41464b; }
    .badge-standard { background: #cfe2ff; color: #084298; }
    .badge-premium { background: #d1e7dd; color: #0f5132; }
    .badge-active { background: var(--success); color: #fff; }
    .badge-inactive { background: var(--danger); color: #fff; }
    button, .btn { padding: 0.4rem 0.75rem; border: none; border-radius: 0.25rem; cursor: pointer; font-size: 0.85rem; text-decoration: none; display: inline-block; }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-sm { padding: 0.2rem 0.5rem; font-size: 0.75rem; }
    input, select { padding: 0.4rem; border: 1px solid var(--border); border-radius: 0.25rem; font-size: 0.85rem; }
    form { display: flex; gap: 0.5rem; align-items: end; flex-wrap: wrap; }
    .flash { padding: 0.75rem; border-radius: 0.25rem; margin-bottom: 1rem; background: #d1e7dd; color: #0f5132; border: 1px solid #badbcc; }
    .mt-1 { margin-top: 1rem; }
  </style>
</head>
<body>
  <nav>
    <strong>OGI Admin</strong>
    <div>
      <a href="/admin">Dashboard</a>
      <a href="/admin/api-keys">API Keys</a>
      <a href="/admin/audit">Audit Log</a>
      <a href="/admin/simulate">Simulate</a>
      <a href="/admin/pilots">Pilots</a>
      ${username ? `<span style="opacity:0.6;font-size:0.85rem">${escapeHtml(username)}</span>` : ''}
      <a href="/admin/logout">Logout</a>
    </div>
  </nav>
  <div class="container">
    ${content}
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
