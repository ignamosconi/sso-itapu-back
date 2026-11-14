(function () {
  const params = new URLSearchParams(window.location.search);
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const state = params.get('state') || '';
  let currentUsername = '';

  // ── Helpers de UI ────────────────────────────────────────────────────────

  function showError(msg) {
    const box = document.getElementById('errorBox');
    box.classList.remove('visible');
    setTimeout(() => {
      box.textContent = msg;
      box.classList.add('visible');
    }, 50);
  }

  function hideError() {
    document.getElementById('errorBox').classList.remove('visible');
  }

  function showScreen(id) {
    ['screen-username', 'screen-password', 'screen-check-email', 'screen-reset-sent'].forEach(s => {
      document.getElementById(s).style.display = s === id ? '' : 'none';
    });
    hideError();
  }

  function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.style.opacity = loading ? '0.6' : '1';
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  window.addEventListener('load', () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const card = document.querySelector('.login-card');
        if (card) card.classList.add('visible');
      });
    });

    if (!clientId || !redirectUri) {
      document.getElementById('screen-username').style.display = 'none';
      showError('El enlace de acceso no es válido. Contactá al administrador de la aplicación.');
      return;
    }

    fetch(`/admin/clients/${clientId}/info`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.clientName) {
          document.getElementById('loginSub').textContent =
            `Ingresá a ${data.clientName} con tu usuario.`;
        }
      })
      .catch(() => {});
  });

  window.addEventListener('pageshow', e => {
    if (e.persisted) { document.body.style.display = 'none'; window.location.reload(); }
  });

  // ── Paso 1: check username ────────────────────────────────────────────────

  document.getElementById('btnContinue').addEventListener('click', async () => {
    const btn = document.getElementById('btnContinue');
    const username = document.getElementById('usernameInput').value.trim();
    if (!username) { showError('Ingresá tu nombre de usuario.'); return; }

    hideError();
    setLoading(btn, true);
    try {
      const res = await fetch(
        `${window.location.pathname.replace('/login', '')}/check-username`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        showError(data.message || 'Error al verificar el usuario.');
        return;
      }

      currentUsername = username;

      if (data.status === 'has_password') {
        document.getElementById('passwordInput').value = '';
        showScreen('screen-password');
      } else {
        document.getElementById('maskedEmail').textContent = data.maskedEmail;
        showScreen('screen-check-email');
      }
    } catch {
      showError('Error de red. Intentá de nuevo.');
    } finally {
      setLoading(btn, false);
    }
  });

  document.getElementById('usernameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnContinue').click();
  });

  // ── Paso 2: login ─────────────────────────────────────────────────────────

  document.getElementById('btnLogin').addEventListener('click', async () => {
    const btn = document.getElementById('btnLogin');
    const password = document.getElementById('passwordInput').value;
    if (!password) { showError('Ingresá tu contraseña.'); return; }

    hideError();
    setLoading(btn, true);
    try {
      const route = window.location.pathname; // /sso/login
      const res = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUsername, password, client_id: clientId, redirect_uri: redirectUri, state }),
      });
      const data = await res.json();

      if (!res.ok) { showError(data.message || 'Credenciales inválidas.'); return; }

      showSuccessAndClose(data.code, data.state);
    } catch {
      showError('Error de red. Intentá de nuevo.');
    } finally {
      setLoading(btn, false);
    }
  });

  document.getElementById('passwordInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnLogin').click();
  });

  // ── Olvidé mi contraseña ──────────────────────────────────────────────────

  document.getElementById('btnForgot').addEventListener('click', async () => {
    const btn = document.getElementById('btnForgot');
    hideError();
    setLoading(btn, true);
    try {
      const route = window.location.pathname.replace('/login', '/request-password-reset');
      const res = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUsername }),
      });
      if (!res.ok) {
        const data = await res.json();
        showError(data.message || 'Error al solicitar la recuperación.');
        return;
      }
      showScreen('screen-reset-sent');
    } catch {
      showError('Error de red. Intentá de nuevo.');
    } finally {
      setLoading(btn, false);
    }
  });

  // ── Volver ────────────────────────────────────────────────────────────────

  document.getElementById('btnBackFromPassword').addEventListener('click', () => {
    showScreen('screen-username');
  });

  document.getElementById('btnBackFromEmail').addEventListener('click', () => {
    showScreen('screen-username');
  });

  document.getElementById('btnBackFromReset').addEventListener('click', () => {
    currentUsername = '';
    document.getElementById('usernameInput').value = '';
    showScreen('screen-username');
  });

  // ── Success ───────────────────────────────────────────────────────────────

  function showSuccessAndClose(code, returnedState) {
    const isLight = params.get('theme') === 'light';
    const successBg = isLight ? '#f5f5f5' : '#0f0f1a';
    const cardBg = isLight ? '#ffffff' : 'rgba(255,255,255,0.06)';
    const cardBorder = isLight ? '#e0e0e0' : 'rgba(255,255,255,0.12)';
    const successColor = isLight ? '#1a1a1a' : '#ffffff';
    const subColor = isLight ? '#666666' : 'rgba(255,255,255,0.5)';

    document.body.style.cssText = `background:${successBg};min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0`;
    document.body.innerHTML = `
      <div style="text-align:center;font-family:'Inter',sans-serif;padding:2rem">
        <div style="background:${cardBg};border:1px solid ${cardBorder};border-radius:12px;padding:1.5rem 2.5rem;display:inline-block;box-shadow:0 8px 32px rgba(0,0,0,0.15);margin-bottom:1.5rem">
          <div style="font-size:18px;font-weight:600;color:${successColor};margin-bottom:6px">¡Logueo exitoso!</div>
          <div style="display:inline-block;background:#f5a705;color:#1a1200;font-size:11px;font-weight:600;letter-spacing:0.06em;padding:3px 10px;border-radius:4px;text-transform:uppercase">Autenticado</div>
        </div>
        <p style="color:${subColor};font-size:13px;margin:0 0 2rem 0">Cerrá esta página si sigue abierta.</p>
      </div>
    `;

    if (window.opener) {
      let targetOrigin = '*';
      try { targetOrigin = new URL(redirectUri).origin; } catch { window.close(); return; }
      window.opener.postMessage({ status: 'success', code, state: returnedState }, targetOrigin);
      window.close();
    }
  }
})();