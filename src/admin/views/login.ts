function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderLogin(error?: string, prefillUsername?: string): string {
  const errorHtml = error
    ? `<div class="login-error" role="alert">${escapeHtml(error)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign In — OGI Admin</title>
  <style>
    :root { --primary: #0d6efd; --primary-hover: #0b5ed7; --danger: #dc3545; --border: #dee2e6; --muted: #6c757d; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8f9fa; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .login-wrap { width: 100%; max-width: 380px; padding: 1rem; }
    .login-card { background: #fff; border: 1px solid var(--border); border-radius: 0.5rem; padding: 2rem 2rem 1.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
    .login-brand { text-align: center; margin-bottom: 1.75rem; }
    .login-brand h1 { font-size: 1.4rem; font-weight: 700; }
    .login-brand p { font-size: 0.82rem; color: var(--muted); margin-top: 0.2rem; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: 0.82rem; font-weight: 600; margin-bottom: 0.3rem; }
    input[type="text"], input[type="password"] { width: 100%; padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: 0.25rem; font-size: 0.9rem; transition: border-color 0.15s; }
    input[type="text"]:focus, input[type="password"]:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(13,110,253,0.15); }
    .password-wrap { position: relative; }
    .password-wrap input { padding-right: 2.5rem; }
    .toggle-pw { position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--muted); font-size: 0.8rem; padding: 0.2rem; line-height: 1; }
    .toggle-pw:hover { color: #333; }
    .remember-row { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 1.25rem; }
    .remember-row input { width: auto; }
    .remember-row label { margin: 0; font-weight: 400; font-size: 0.85rem; }
    .btn-login { width: 100%; padding: 0.6rem; background: var(--primary); color: #fff; border: none; border-radius: 0.25rem; cursor: pointer; font-size: 0.9rem; font-weight: 600; transition: background 0.15s; }
    .btn-login:hover { background: var(--primary-hover); }
    .login-error { background: #fff3cd; border: 1px solid #ffc107; border-radius: 0.25rem; padding: 0.6rem 0.75rem; font-size: 0.85rem; color: #664d03; margin-bottom: 1rem; }
    .login-footer { text-align: center; margin-top: 1.25rem; font-size: 0.78rem; color: var(--muted); }
  </style>
</head>
<body>
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-brand">
        <h1>OGI Admin</h1>
        <p>Open Global Income — Operations Dashboard</p>
      </div>

      ${errorHtml}

      <form method="POST" action="/admin/login" autocomplete="on">
        <div class="form-group">
          <label for="username">Username</label>
          <input
            type="text"
            id="username"
            name="username"
            value="${escapeHtml(prefillUsername ?? '')}"
            required
            autofocus
            autocomplete="username"
            spellcheck="false"
          >
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <div class="password-wrap">
            <input
              type="password"
              id="password"
              name="password"
              required
              autocomplete="current-password"
            >
            <button
              type="button"
              class="toggle-pw"
              aria-label="Show or hide password"
              onclick="(function(btn){
                var inp = btn.previousElementSibling;
                var show = inp.type === 'password';
                inp.type = show ? 'text' : 'password';
                btn.textContent = show ? 'Hide' : 'Show';
              })(this)"
            >Show</button>
          </div>
        </div>

        <div class="remember-row">
          <input type="checkbox" id="rememberMe" name="rememberMe" value="1">
          <label for="rememberMe">Keep me signed in for 7 days</label>
        </div>

        <button type="submit" class="btn-login">Sign In</button>
      </form>
    </div>
    <div class="login-footer">Open Global Income · Admin Access Only</div>
  </div>
</body>
</html>`;
}
