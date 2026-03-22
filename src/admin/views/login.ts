import { escapeHtml } from './helpers.js';
import { t } from '../../i18n/index.js';

export function renderLogin(error?: string, prefillUsername?: string): string {
  const errorHtml = error
    ? `<div class="login-error" role="alert">${escapeHtml(error)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t('login.title')} — OGI Admin</title>
  <link href="/css/ogi.css" rel="stylesheet">
</head>
<body>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <h1>${t('login.brand')}</h1>
        <p>${t('login.subtitle')}</p>
      </div>

      ${errorHtml}

      <form method="POST" action="/admin/login" autocomplete="on" class="login-form">
        <div class="form-group">
          <label for="username">${t('login.username')}</label>
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
          <label for="password">${t('login.password')}</label>
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
              class="btn btn-ghost btn-sm password-toggle"
              aria-label="${t('login.showOrHidePassword')}"
              onclick="(function(btn){
                var inp = btn.previousElementSibling;
                var show = inp.type === 'password';
                inp.type = show ? 'text' : 'password';
                btn.textContent = show ? '${t('login.hidePassword')}' : '${t('login.showPassword')}';
              })(this)"
            >${t('login.showPassword')}</button>
          </div>
        </div>

        <div class="form-checkbox">
          <input type="checkbox" id="rememberMe" name="rememberMe" value="1">
          <label for="rememberMe">${t('login.rememberMe')}</label>
        </div>

        <button type="submit" class="btn btn-primary">${t('login.submit')}</button>
      </form>
    </div>
    <div class="login-footer">${t('login.footer')}</div>
  </div>
</body>
</html>`;
}
