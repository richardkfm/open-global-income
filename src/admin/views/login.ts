import { layout } from './layout.js';

export function renderLogin(error?: string): string {
  const errorHtml = error
    ? `<div style="color:var(--danger);margin-bottom:0.75rem">${escapeHtml(error)}</div>`
    : '';

  // Use a minimal layout without nav for login
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login — OGI Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f8f9fa; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .login-card { background: #fff; border: 1px solid #dee2e6; border-radius: 0.5rem; padding: 2rem; width: 100%; max-width: 360px; }
    h1 { font-size: 1.3rem; margin-bottom: 1.5rem; text-align: center; }
    label { display: block; margin-bottom: 0.25rem; font-weight: 600; font-size: 0.85rem; }
    input { width: 100%; padding: 0.5rem; border: 1px solid #dee2e6; border-radius: 0.25rem; margin-bottom: 1rem; font-size: 0.9rem; }
    button { width: 100%; padding: 0.6rem; background: #0d6efd; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer; font-size: 0.9rem; }
    button:hover { background: #0b5ed7; }
  </style>
</head>
<body>
  <div class="login-card">
    <h1>OGI Admin</h1>
    ${errorHtml}
    <form method="POST" action="/admin/login">
      <label for="password">Admin Password</label>
      <input type="password" name="password" id="password" required autofocus>
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
