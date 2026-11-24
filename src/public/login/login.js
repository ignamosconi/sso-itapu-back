(function () {
  const params = new URLSearchParams(window.location.search);
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const state = params.get('state') || '';
  let currentUsername = '';
  let resendInterval = null;
  let emailMode = 'reset';        // un único flujo de correo: configurar u olvidé mi contraseña
  let resetCooldownEndsAt = 0;    // timestamp (ms) en el que termina el cooldown de reset de currentUsername

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
    ['screen-username', 'screen-password', 'screen-check-email', ].forEach(s => {
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
      showError('El enlace de acceso no es válido. Contactá a un administrador.');
      return;
    }

    function blockLogin(msg) {
      document.getElementById('loginSub').style.display = 'none';
      showError(msg);
    }

    fetch(`/admin/clients/${encodeURIComponent(clientId)}/info?redirect_uri=${encodeURIComponent(redirectUri)}`)
      .then(async r => {
        if (r.status === 400 || r.status === 404) {
          blockLogin('La aplicación no existe. Contactá a un administrador.');
          return;
        }
        if (!r.ok) {
          blockLogin('No pudimos verificar la aplicación. Intentá de nuevo más tarde.');
          return;
        }
        const data = await r.json();
        if (data.isActive === false) {
          blockLogin('La aplicación está suspendida. Contactá a un administrador.');
          return;
        }
        if (data.redirectUriValid === false) {
          blockLogin('La URL de redirección en el link no coincide con las registradas. Contactá al desarrollador de la aplicación para que lo resuelva.');
          return;
        }
        if (data.clientName) {
          document.getElementById('loginSub').textContent =
            `Ingresá a ${data.clientName} con tu usuario.`;
        }
        // Mostramos el origen REAL al que va a volver el código, para que el alumno detecte un link de phishing.
        try {
          document.getElementById('redirectNote').textContent = `Vas a volver a: ${new URL(redirectUri).origin}`;
        } catch { /* la redirect_uri ya fue validada por el servidor */ }
        showScreen('screen-username');
      })
      .catch(() => blockLogin('Error de red. Intentá de nuevo.'));
  });

  window.addEventListener('pageshow', e => {
    if (e.persisted) { document.body.style.display = 'none'; window.location.reload(); }
  });

  // ── Paso 1: usuario ───────────────────────────────────────────────────────
  // Ya no se consulta al servidor en este paso: así la pantalla no revela si el usuario existe,
  // está suspendido o pendiente. Todo se resuelve recién con usuario + contraseña (o con el correo de acceso).

  document.getElementById('btnContinue').addEventListener('click', () => {
    const username = document.getElementById('usernameInput').value.trim();
    if (!username) { showError('Ingresá tu nombre de usuario.'); return; }
    if (username !== currentUsername) resetCooldownEndsAt = 0; // el cooldown del correo es por usuario
    currentUsername = username;
    document.getElementById('passwordInput').value = '';
    showScreen('screen-password');
    document.getElementById('passwordInput').focus();
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

      if (res.status === 429) {
        const secs = Number(res.headers.get('Retry-After')) || data.retryAfterSeconds || 0;
        const mins = secs > 0 ? Math.ceil(secs / 60) : 0;
        showError(mins
          ? `Demasiados intentos. Probá de nuevo en ${mins} minuto${mins === 1 ? '' : 's'}.`
          : 'Demasiados intentos. Esperá unos minutos antes de volver a intentar.');
        return;
      }
      if (!res.ok) { showError(Array.isArray(data.message) ? data.message[0] : (data.message || 'Usuario o contraseña incorrectos.')); return; }

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

  // ── Pantalla de envío de correo (setup y olvidé mi contraseña) ───────────
  // Deja la pantalla en estado limpio (evita arrastrar el countdown de otro usuario)
  // y, si hay un cooldown activo, la muestra con el botón deshabilitado.
  function openEmailScreen(mode, cooldownSeconds) {
    emailMode = mode;
    clearInterval(resendInterval);
    resendInterval = null;

    const btn = document.getElementById('btnResend');
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.textContent = 'Enviar correo';
    document.getElementById('resendCountdown').style.display = 'none';

    showScreen('screen-check-email');
    if (cooldownSeconds > 0) {
      btn.textContent = 'Reenviar correo';
      startResendCooldown(cooldownSeconds);
    }
  }

  // Si el cooldown del reset cambia (envío o 429), lo recordamos para cuando el usuario
  // vuelva a entrar a "Olvidé mi contraseña" sin volver a consultar al servidor.
  function applyCooldown(seconds) {
    if (emailMode === 'reset') resetCooldownEndsAt = Date.now() + seconds * 1000;
    startResendCooldown(seconds);
  }

  // ── Reenviar correo de setup ──────────────────────────────────────────────
  function startResendCooldown(seconds) {
    const btn = document.getElementById('btnResend');
    const countdown = document.getElementById('resendCountdown');
    btn.disabled = true;
    btn.style.opacity = '0.5';
    let remaining = seconds;

    function tick() {
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      countdown.textContent = `Podés reenviarlo en ${m}:${String(s).padStart(2, '0')}`;
      countdown.style.display = '';
      remaining--;
      if (remaining < 0) {
        clearInterval(resendInterval);
        resendInterval = null;
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.textContent = 'Reenviar correo';
        countdown.style.display = 'none';
      }
    }

    clearInterval(resendInterval);
    tick();
    resendInterval = setInterval(tick, 1000);
  }

  document.getElementById('btnResend').addEventListener('click', async () => {
    const btn = document.getElementById('btnResend');
    hideError();
    setLoading(btn, true);
    try {
      // Un solo endpoint para "es mi primera vez" y "olvidé mi contraseña": responde igual exista o no el usuario.
      const endpoint = '/request-password-reset';
      const route = window.location.pathname.replace('/login', endpoint);
      const res = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUsername }),
      });
      const data = await res.json();

      if (res.status === 429) {
        applyCooldown(data.retryAfter ?? 300);
        return;
      }
      if (!res.ok) {
        showError(data.message || 'Error al enviar el correo.');
        return;
      }
      btn.textContent = 'Reenviar correo';
      applyCooldown(data.cooldownSeconds ?? 300);
    } catch {
      showError('Error de red. Intentá de nuevo.');
    } finally {
      if (btn.disabled) {
        btn.style.opacity = '0.5';
      } else {
        setLoading(btn, false);
      }
    }
  });

  // ── Olvidé mi contraseña ──────────────────────────────────────────────────

  document.getElementById('btnForgot').addEventListener('click', () => {
    hideError();
    const remaining = Math.max(0, Math.ceil((resetCooldownEndsAt - Date.now()) / 1000));
    openEmailScreen('reset', remaining);
  });

  // ── Volver ────────────────────────────────────────────────────────────────

  document.getElementById('btnBackFromPassword').addEventListener('click', () => {
    showScreen('screen-username');
  });

  document.getElementById('btnBackFromEmail').addEventListener('click', () => {
    showScreen('screen-password');
  });

  // ── Success ───────────────────────────────────────────────────────────────

  function showSuccessAndClose(code, returnedState) {
    document.body.classList.add('is-success');
    document.body.innerHTML = `
      <div class="success-wrap">
        <div class="success-card">
          <div class="success-title">¡Logueo exitoso!</div>
          <div class="badge">Autenticado</div>
        </div>
        <p class="success-sub">Cerrá esta página si sigue abierta.</p>
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