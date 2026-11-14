# SSO ITAPU — Backend

Sistema de autenticación único (SSO) para ITAPU. Permite que cualquier app registrada pueda autenticar usuarios usando sus credenciales del sistema, sin que esas credenciales sean compartidas con la app integradora.

## ¿Qué hace este repositorio?

Implementa un servidor OAuth 2.0 con flujo de authorization code que:

- Gestiona el padrón de usuarios de ITAPU (alumnos, docentes, personal no docente, autoridades, etc.).
- Autentica usuarios contra la base de datos propia del sistema.
- Emite authorization codes de un solo uso (TTL configurable, por defecto 2 minutos).
- Intercambia esos codes por access tokens y refresh tokens JWT.
- Expone un endpoint `/sso/me` para que las apps integradoras identifiquen al usuario autenticado.
- Provee un panel de administración (repositorio separado) para gestionar administradores, usuarios y aplicaciones cliente registradas.
- Implementa 2FA obligatorio (TOTP) para todos los administradores.
- Usa links de un solo uso con cifrado AES-256-GCM para la entrega de client secrets y el setup de contraseñas.


## Tecnologías utilizadas

- **Runtime:** Node.js 22
- **Framework:** NestJS 11
- **Base de datos:** PostgreSQL con TypeORM (migraciones, sin `synchronize`)
- **Caché / sesiones:** Redis
- **Autenticación:** JWT HS256 (access + refresh tokens con rotación), TOTP via `otplib`
- **Validación:** class-validator + class-transformer con `ValidationPipe` global
- **Seguridad:** Helmet, `@nestjs/throttler`, bcrypt (cost 12 para admins, 10 para usuarios), AES-256-GCM para secrets en reposo
- **Email:** Nodemailer (SMTP)
- **Excel:** SheetJS (`xlsx`) para carga masiva de usuarios
- **Documentación:** Swagger UI (protegido con Basic Auth)
- **Tests:** Jest + ts-jest
- **CI:** GitHub Actions


## ¿Cómo integro mi app con el SSO?

### 1. Obtener credenciales

Para integrar tu app necesitás un **Client ID** y un **Client Secret**. Los entrega el equipo de administración de ITAPU al registrar tu app.

Vas a recibir un email con un link de un solo uso que expira en 24 horas. Al abrirlo vas a ver:

- **Client ID** — número entero que identifica tu app.
- **Client Secret** — string de 64 caracteres hexadecimales. Guardalo en un lugar seguro. Si lo perdés, el equipo de administración puede regenerarlo.

> **Importante:** el Client Secret nunca debe estar en el frontend de tu app. Debe estar exclusivamente en tu backend.


### 2. Endpoints de referencia (públicos)

Antes de empezar, consultá estos endpoints para no hardcodear valores en tu código:

```http
GET https://sso.itapu.edu.ar/sso/info/domain-roles
→ ["Alumno", "Docente", "Autoridad", ...]   // valores posibles del campo "cargo" en /sso/me

GET https://sso.itapu.edu.ar/sso/info/specialties
→ ["Química", "Mecánica", ...]              // valores posibles del campo "especialidad" en /sso/me
```

No hardcodees estos valores. Si el administrador agrega o renombra un cargo o especialidad, tu app lo refleja sin cambios de código.


### 3. Flujo de autenticación

El SSO usa el flujo **OAuth 2.0 Authorization Code**. El popup de login lo provee el SSO; vos solo tenés que abrirlo y escuchar el resultado.

#### Paso 1 — Abrir el popup de login

```javascript
const state = crypto.randomUUID();
sessionStorage.setItem('oauth_state', state);

const popup = window.open(
  `https://sso.itapu.edu.ar/sso/login` +
  `?client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent('https://tu-app.com/callback')}` +
  `&state=${state}` +
  `&theme=dark`,   // o theme=light
  'sso_login',
  'width=480,height=560'
);
```

El popup usa un flujo de **dos pasos**: primero pide el nombre de usuario, después la contraseña. Si el usuario no configuró contraseña todavía, el sistema le envía un email automáticamente con un link para hacerlo.

#### Paso 2 — Escuchar el resultado

```javascript
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://sso.itapu.edu.ar') return;

  const { code, state } = event.data;

  if (state !== sessionStorage.getItem('oauth_state')) {
    console.error('State inválido — posible ataque CSRF');
    return;
  }

  sessionStorage.removeItem('oauth_state');

  fetch('/tu-backend/auth/callback', {
    method: 'POST',
    body: JSON.stringify({ code }),
    headers: { 'Content-Type': 'application/json' },
  });
});
```

#### Paso 3 — Canjear el code por tokens (desde tu backend)

```http
POST https://sso.itapu.edu.ar/sso/token
Content-Type: application/json

{
  "client_id": "TU_CLIENT_ID",
  "client_secret": "TU_CLIENT_SECRET",
  "code": "EL_CODE_RECIBIDO",
  "redirect_uri": "https://tu-app.com/callback"
}
```

Respuesta:

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

Guardá ambos tokens en tu backend. **Nunca los expongas al frontend.**

#### Paso 4 — Identificar al usuario autenticado

```http
GET https://sso.itapu.edu.ar/sso/me
Authorization: Bearer ACCESS_TOKEN
```

Respuesta:

```json
{
  "sub": "uuid-del-usuario",
  "nombre": "Ignacio Mariano",
  "apellido": "Mosconi",
  "username": "immosconi136",
  "especialidad": "Mecánica",
  "email": "usuario@gmail.com",
  "cargo": "Alumno"
}
```

| Campo | Descripción |
|-------|-------------|
| `sub` | Identificador único del usuario (UUID). Usalo como clave en tu sistema — no cambia nunca. |
| `username` | Nombre de usuario del SSO. |
| `especialidad` | Especialidad del usuario. Valores posibles: `GET /sso/info/specialties`. |
| `cargo` | Cargo institucional. Valores posibles: `GET /sso/info/domain-roles`. |

#### Paso 5 — Renovar el access token

El access token expira en 15 minutos. Renovalo desde tu backend:

```http
POST https://sso.itapu.edu.ar/sso/refresh
Content-Type: application/json

{ "refresh_token": "TU_REFRESH_TOKEN" }
```

Respuesta: nuevos `access_token` y `refresh_token`. Reemplazá ambos — el refresh token anterior queda inválido (rotación automática).

> Si intentás usar un refresh token ya usado, el servidor revoca toda la sesión. El usuario tendrá que volver a loguearse.

#### Paso 6 — Cerrar sesión

```http
POST https://sso.itapu.edu.ar/sso/logout
Content-Type: application/json

{ "refresh_token": "TU_REFRESH_TOKEN" }
```

Respuesta: `204 No Content`.


### Consideraciones de seguridad

- **Verificá siempre `event.origin`** en el listener de `postMessage`.
- **Verificá siempre el `state`** para prevenir ataques CSRF.
- **Nunca guardes el Client Secret en el frontend.**
- **Nunca guardes access o refresh tokens en `localStorage`** — usá cookies `HttpOnly` o almacenamiento en servidor.
- El authorization code es de un solo uso y expira en 2 minutos.
- El refresh token rota en cada uso — guardá siempre el último que recibís.


## Levantar el proyecto localmente

### Requisitos previos

- Node.js 22+
- Docker (para PostgreSQL y Redis via `docker compose`)
- Una cuenta SMTP (Gmail con App Password funciona)

### Instalación

```bash
git clone https://github.com/ignamosconi/sso-itapu-back.git
cd sso-itapu-back
npm install
cp .env.example .env
```

### Variables de entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `NODE_ENV` | En `production` activa validaciones de secretos y desactiva el seeder. | `development` |
| `PORT` | Puerto en el que escucha el servidor. | `3000` |
| `AUTH_ROUTE_PATH` | Prefijo de ruta para los endpoints SSO. | `sso` |
| `CODE_TTL_MS` | TTL del authorization code en ms. | `120000` |
| `CREDENTIAL_TOKEN_TTL_MS` | TTL del link de credenciales de un solo uso en ms. | `86400000` |
| `PASSWORD_RESET_TOKEN_TTL_MS` | TTL del link de setup/reset de contraseña en ms. | `86400000` |
| `CREDENTIAL_ENCRYPTION_KEY` | Clave AES-256-GCM para cifrar secrets en reposo. 64 chars hex. | — |
| `TOTP_ENCRYPTION_KEY` | Clave AES-256-GCM para cifrar secrets TOTP. 64 chars hex. | — |
| `ADMIN_PANEL_URL` | URL del panel de administración (para CORS y links en emails). | `http://localhost:5173` |
| `SSO_BASE_URL` | URL pública de este backend (usada en emails). | `http://localhost:3000` |
| `REDIS_HOST` | Host de Redis. | `localhost` |
| `REDIS_PORT` | Puerto de Redis. | `6379` |
| `REDIS_PASSWORD` | Password de Redis. | — |
| `PENDING_2FA_TTL_MS` | TTL del challenge 2FA pendiente en ms. | `180000` |
| `PENDING_2FA_MAX_ATTEMPTS` | Intentos fallidos de TOTP antes de invalidar el challenge. | `5` |
| `DB_HOST` | Host de PostgreSQL. | `localhost` |
| `DB_PORT` | Puerto de PostgreSQL. | `5433` |
| `DB_USERNAME` | Usuario de PostgreSQL. | `postgres` |
| `DB_PASSWORD` | Password de PostgreSQL. | — |
| `DB_NAME` | Nombre de la base de datos. | `sso_itapu` |
| `JWT_ACCESS_SECRET` | Secret para access tokens. Mínimo 64 chars. | — |
| `JWT_REFRESH_SECRET` | Secret para refresh tokens. Distinto al anterior. | — |
| `JWT_ACCESS_EXPIRES_IN` | Expiración del access token. | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Expiración por inactividad del refresh token. | `8h` |
| `JWT_REFRESH_SESSION_MAX_DURATION` | Duración absoluta máxima de sesión. | `3d` |
| `JWT_ADMIN_ACCESS_SECRET` | Secret para access tokens de admins. | — |
| `JWT_ADMIN_REFRESH_SECRET` | Secret para refresh tokens de admins. | — |
| `JWT_ADMIN_ACCESS_EXPIRES_IN` | Expiración del access token de admins. | `15m` |
| `JWT_ADMIN_REFRESH_EXPIRES_IN` | Expiración del refresh token de admins. | `1d` |
| `ADMIN_USERNAME_SEEDER` | Username del primer admin (solo en desarrollo). | `admin` |
| `ADMIN_PASSWORD_SEEDER` | Password del primer admin. Mínimo 8 caracteres. | — |
| `SWAGGER_USER` | Usuario para la documentación Swagger. | `admin` |
| `SWAGGER_PASSWORD` | Password para la documentación Swagger. | — |
| `MAIL_HOST` | Host SMTP. | `smtp.gmail.com` |
| `MAIL_PORT` | Puerto SMTP. | `587` |
| `MAIL_USER` | Usuario SMTP. | `tu_correo@gmail.com` |
| `MAIL_PASS` | Password SMTP (Gmail: usar App Password). | — |
| `MAIL_FROM` | Dirección remitente. | `tu_correo@gmail.com` |

> **En producción** todos los secrets deben ser distintos a cualquier valor del `.env.example`. El servidor no arranca si detecta valores por defecto con `NODE_ENV=production`.

Generá las claves hex con:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Base de datos

```bash
docker compose up -d        # levanta PostgreSQL y Redis
npm run start:dev           # las migraciones corren automáticamente
```

Para generar una nueva migración tras modificar entidades:

```bash
npm run migration:generate
npm run migration:run
```

### Seeder

En `development`, al levantar el servidor se crea automáticamente el primer admin usando `ADMIN_USERNAME_SEEDER` / `ADMIN_PASSWORD_SEEDER`. En producción el seeder está deshabilitado.

### Comandos

```bash
npm install          # instalar dependencias
npm run start:dev    # desarrollo con hot reload
npm run build        # build de producción
npm run start:prod   # producción
npm run test         # tests unitarios
npm run test:cov     # tests con cobertura
npm run lint         # lint
```

### Documentación de la API
http://localhost:3000/docs

Requiere `SWAGGER_USER` / `SWAGGER_PASSWORD` del `.env`.


## Panel de administración

El panel está en el repositorio **[github.com/ignamosconi/sso-itapu-front](https://github.com/ignamosconi/sso-itapu-front)**.

Permite:

- Iniciar sesión con 2FA obligatorio (TOTP).
- Gestionar administradores del sistema.
- Gestionar el padrón de usuarios: alta individual, carga masiva por Excel, edición, suspensión, baja y reenvío de email de bienvenida.
- Configurar cargos institucionales y especialidades.
- Registrar y gestionar aplicaciones cliente OAuth.
- Regenerar client secrets y enviarlos por email con un link de un solo uso.
- Ver estadísticas del sistema en el dashboard.