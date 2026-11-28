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
→ ["Alumno", "Profesor", "Autoridad", "No Docente"]   // valores posibles de cada elemento de "cargos" en /sso/me

GET https://sso.itapu.edu.ar/sso/info/specialties
→ ["Química", "Mecánica", ...]              // valores posibles de cada elemento de "especialidades" en /sso/me
```

No hardcodees estos valores. Si el administrador agrega o renombra un cargo o especialidad, tu app lo refleja sin cambios de código.

> **Un usuario puede tener varios cargos y varias especialidades** (por ejemplo, alguien que es Profesor y Preceptor, o un profesor de Mecánica y Electrónica). Por eso `/sso/me` devuelve **listas**: `cargos` y `especialidades`. Para dar un permiso, verificá si **alguno** de los cargos del usuario está en tu lista (`cargos.includes("Profesor")`), nunca solo el primero.


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

El popup pide primero el nombre de usuario y después la contraseña. **No revela si un usuario existe, está suspendido o pendiente**: ante cualquier fallo responde «Usuario o contraseña incorrectos». Si es la primera vez o no recuerda la contraseña, el alumno toca **«Es mi primera vez / Olvidé mi contraseña»** y, si el usuario existe y está habilitado, recibe un correo con un link para configurarla o restablecerla (el correo se envía solo cuando el alumno lo pide; no es automático). Solo si la contraseña es correcta y la cuenta está suspendida se le informa que contacte a un administrador.

Reglas de la `redirect_uri`:

- Tiene que coincidir **exactamente** con una de las URIs registradas para tu aplicación (comparación de texto exacta).
- Se registran con **`https`**; `http` solo se acepta para `localhost`, `127.0.0.1` y `[::1]` (desarrollo). **En producción (`NODE_ENV=production`) se rechazan también esos hosts**, salvo que se defina `ALLOW_LOCALHOST_REDIRECTS=true`. No se admiten comodines (`*`), usuario/contraseña en la URL ni fragmentos (`#`). Máximo 2048 caracteres.
- Es el único destino al que el popup entrega el `code` (`postMessage` al **origen** de esa URI). Además, el popup le muestra al alumno el dominio al que va a volver.
- El `code` queda atado a la `redirect_uri` con la que se emitió: en el paso 3 hay que enviar **la misma**.

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

Los tokens son JWT firmados con **HS256** e incluyen `iss` (la URL del SSO, `SSO_BASE_URL`) y `aud` (tu `client_id`). Si validás el `access_token` en tu propio backend, verificá ambos.

> Los tokens emitidos antes de esta versión no tienen `iss`/`aud`: al desplegar, los alumnos con sesión abierta tendrán que volver a iniciar sesión.

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
  "username": "immosconi456",
  "especialidades": ["Electrónica", "Mecánica"],
  "email": "usuario@gmail.com",
  "cargos": ["Preceptor", "Profesor"],
  "aud": "TU_CLIENT_ID"
}
```

| Campo | Descripción |
|-------|-------------|
| `sub` | Identificador único del usuario (UUID). Usalo como clave en tu sistema — no cambia nunca. |
| `username` | Nombre de usuario del SSO. |
| `especialidades` | Lista de especialidades del usuario: **siempre al menos una**, ordenadas alfabéticamente. Valores posibles: `GET /sso/info/specialties`. |
| `cargos` | Lista de cargos institucionales: **siempre al menos uno**, ordenados alfabéticamente. Valores posibles: `GET /sso/info/domain-roles`. |

Ejemplo para dar permisos de administración en tu app (la lista de cargos con permisos va en tu configuración, no fija en el código):

```js
const STAFF_CARGOS = process.env.STAFF_CARGOS.split(',');          // ej. "Profesor,Preceptor"
const esStaff = me.cargos.some((c) => STAFF_CARGOS.includes(c));   // alcanza con que tenga UNO
```

> **Cambio incompatible en v2.0.0:** los campos `cargo` y `especialidad` (texto) se reemplazaron por `cargos` y `especialidades` (listas). Una app que lea `cargo` recibe `undefined`.
| `aud` | Tu `client_id`: la aplicación para la que se emitió el token. |

#### Paso 5 — Renovar el access token

El access token expira en 15 minutos. Renovalo **desde tu backend** con las credenciales de tu aplicación:

```http
POST https://sso.itapu.edu.ar/sso/refresh
Content-Type: application/json

{
  "client_id": "TU_CLIENT_ID",
  "client_secret": "TU_CLIENT_SECRET",
  "refresh_token": "TU_REFRESH_TOKEN"
}
```

Respuesta: nuevos `access_token` y `refresh_token`. Reemplazá ambos — el refresh token anterior queda inválido (rotación automática).

- Un refresh token solo se puede renovar con las credenciales de **la aplicación que lo originó**.
- Cada renovación vuelve a leer al alumno: el nuevo token trae sus **cargos, especialidades, nombre y email actuales**. Si un administrador le cambió cargos o especialidades, tu app lo ve en la próxima renovación (como máximo 15 minutos) o en el próximo login. Si el alumno fue **suspendido o eliminado**, responde `401` y la sesión se revoca.
- Si intentás usar un refresh token ya usado, el servidor revoca toda la sesión y el usuario tendrá que volver a loguearse. **Excepción:** si el segundo uso llega a los pocos segundos del primero (dos pestañas o dos pedidos simultáneos), solo se rechaza ese pedido con `401` y la sesión sigue viva con el token más nuevo. Serializá las renovaciones en tu backend para evitarlo.

> Aplica a las sesiones nuevas. Un refresh token emitido antes de esta versión sigue funcionando, pero ahora también hay que enviar `client_id` y `client_secret`.

#### Paso 6 — Cerrar sesión

```http
POST https://sso.itapu.edu.ar/sso/logout
Content-Type: application/json

{
  "client_id": "TU_CLIENT_ID",
  "client_secret": "TU_CLIENT_SECRET",
  "refresh_token": "TU_REFRESH_TOKEN"
}
```

Respuesta: `204 No Content`. Con credenciales de aplicación incorrectas responde `401`; el refresh token solo se revoca si pertenece a esa aplicación.


### Consideraciones de seguridad

- **Verificá siempre `event.origin`** en el listener de `postMessage`.
- **Verificá siempre el `state`** para prevenir ataques CSRF.
- **Nunca guardes el Client Secret en el frontend.**
- **Nunca guardes access o refresh tokens en `localStorage`** — usá cookies `HttpOnly` o almacenamiento en servidor.
- **`/sso/token`, `/sso/refresh` y `/sso/logout` se llaman solo desde tu backend**, nunca desde el navegador: llevan el Client Secret.
- Validá `iss` y `aud` de los tokens que recibas.
- El authorization code es de un solo uso, expira en 2 minutos (`CODE_TTL_MS`), vive en Redis y solo se canjea con la `redirect_uri` con la que se emitió.
- El refresh token rota en cada uso — guardá siempre el último que recibís.
- Cambiar la contraseña, suspender o dar de baja al alumno cierra sus sesiones.


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
| `PASSWORD_RESET_COOLDOWN_MS` | Cuántos ms (5 min por defecto) el usuario debe esperar para reenviar el correo de "olvidé mi contraseña". | `300000` |
| `STUDENT_PASSWORD_MAX_ATTEMPTS` | Intentos de contraseña por alumno antes de bloquear la baja. | `5` |
| `STUDENT_PASSWORD_LOCK_TTL_MS` | Duración de la ventana de conteo y del bloqueo, en ms. | `900000` |
| `ADMIN_CONFIRM_PASSWORD_MAX_ATTEMPTS` | Intentos de la contraseña del **admin** antes de bloquear a ese admin. Un solo contador por admin, compartido entre editar un usuario del padrón, cambiar usuario/contraseña en **Mi perfil** (`PATCH /admin/admins/me`) y borrar la propia cuenta (`DELETE /admin/admins/me`). | `5` |
| `ADMIN_CONFIRM_PASSWORD_LOCK_TTL_MS` | Duración de la ventana de conteo y del bloqueo anterior, en ms. | `900000` |
| `STUDENT_DELETE_THROTTLE_LIMIT` | Máximo de requests de baja de alumnos por IP en la ventana. | `10` |
| `STUDENT_DELETE_THROTTLE_TTL_MS` | Ventana del límite anterior, en ms. | `60000` |
| `EMAIL_CHANGE_TOKEN_TTL_MS` | Vencimiento del link de confirmación de cambio de email, en ms. | `3600000` |
| `STUDENT_EMAIL_CHANGE_THROTTLE_LIMIT` | Máximo de pedidos de cambio de email por IP en la ventana. | `10` |
| `STUDENT_EMAIL_CHANGE_THROTTLE_TTL_MS` | Ventana del límite anterior, en ms. | `60000` |
| `LOGIN_MAX_ATTEMPTS` | Intentos fallidos de contraseña por **cuenta** antes de bloquear el login de ese usuario (aunque cambie de IP). | `5` |
| `LOGIN_LOCK_TTL_MS` | Duración de la ventana de conteo y del bloqueo del login, en ms. | `900000` |
| `TRUST_PROXY` | Cantidad de proxies inversos confiables delante del back (`0` a `10`). Define de dónde sale la IP para el throttling. | `1` |
| `THROTTLE_GLOBAL_LIMIT` | Máximo de requests por IP en la ventana, para endpoints sin límite propio. | `30` |
| `THROTTLE_GLOBAL_TTL_MS` | Ventana del límite global, en ms. | `60000` |
| `DB_HOST` | Host de PostgreSQL. | `localhost` |
| `DB_PORT` | Puerto de PostgreSQL. | `5433` |
| `DB_USERNAME` | Usuario de PostgreSQL. | `postgres` |
| `DB_PASSWORD` | Password de PostgreSQL. | — |
| `DB_NAME` | Nombre de la base de datos. | `sso_itapu` |
| `JWT_ACCESS_SECRET` | Secret para access tokens. En `production`: mínimo 64 chars. | — |
| `JWT_REFRESH_SECRET` | Secret para refresh tokens. Distinto a los demás. | — |
| `JWT_ACCESS_EXPIRES_IN` | Expiración del access token. | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Expiración por inactividad del refresh token. | `8h` |
| `JWT_REFRESH_SESSION_MAX_DURATION` | Duración absoluta máxima de sesión. | `3d` |
| `JWT_ADMIN_ACCESS_SECRET` | Secret para access tokens de admins. Distinto a los demás. | — |
| `JWT_ADMIN_REFRESH_SECRET` | Secret para refresh tokens de admins. Distinto a los demás. | — |
| `JWT_ADMIN_ACCESS_EXPIRES_IN` | Expiración del access token de admins. | `15m` |
| `JWT_ADMIN_REFRESH_EXPIRES_IN` | Expiración del refresh token de admins. | `1d` |
| `ADMIN_USERNAME_SEEDER` | Username del primer admin (solo en desarrollo). | `admin` |
| `ADMIN_PASSWORD_SEEDER` | Password del primer admin. Tiene que cumplir la política de contraseñas (mínimo 8 caracteres, con mayúscula, minúscula, número y caracter especial); si no, el seeder corta el arranque. Solo se usa si ese admin todavía no existe. | — |
| `SWAGGER_USER` | Usuario para la documentación Swagger. | `admin` |
| `SWAGGER_PASSWORD` | Password para la documentación Swagger. | — |
| `MAIL_HOST` | Host SMTP. | `smtp.gmail.com` |
| `MAIL_PORT` | Puerto SMTP. | `587` |
| `MAIL_USER` | Usuario SMTP. | `tu_correo@gmail.com` |
| `MAIL_PASS` | Password SMTP (Gmail: usar App Password). | — |
| `MAIL_FROM` | Dirección remitente. | `tu_correo@gmail.com` |
| `ALLOW_LOCALHOST_REDIRECTS` | Permitir redirect URIs a `localhost`/`127.0.0.1`/`[::1]` también con `NODE_ENV=production`. Por defecto `false`. | `false` |
| `MAIL_REQUIRE_TLS` | Exigir STARTTLS/TLS al enviar. Por defecto `true` en `production` y `false` en desarrollo (para un SMTP local sin TLS). | `true` |

> **En producción** el servidor **no arranca** si: algún secret (incluida `DB_PASSWORD`) es un valor por defecto del `.env.example`, algún secret JWT tiene menos de 64 caracteres, o dos de los cuatro secrets JWT son iguales. Con `LOGIN_*`, `STUDENT_*`, `ADMIN_CONFIRM_PASSWORD_*` y `PASSWORD_RESET_COOLDOWN_MS` inválidos tampoco arranca.

Generá las claves hex con:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Base de datos

```bash
docker compose up -d        # levanta PostgreSQL y Redis (ambos solo en 127.0.0.1; requiere DB_PASSWORD y REDIS_PASSWORD en el .env)
npm run start:dev           # las migraciones corren automáticamente
```

> **Migraciones nuevas de la auditoría:** `case-insensitive-unique` crea índices únicos sobre `lower(email)` de alumnos y `lower(nombre)` de cargos y especialidades. Si ya existen valores que solo difieren en mayúsculas, **la migración aborta con la lista de duplicados**: corregilos y volvé a arrancar. `refresh-token-used-at` agrega la columna `usedAt` (ventana de tolerancia de refresh simultáneos).

> **Migración de v2.0.0 (`multiple-roles-specialties`):** crea las tablas `student_domain_roles` y `student_specialties` (un usuario puede tener varios cargos y varias especialidades), copia a ellas el cargo y la especialidad que cada usuario tenía y borra las columnas `students.domain_role_id` y `students.specialty_id`. Agrega a `domain_roles` las reglas `exclusive` y `single_specialty` (en `false` para los cargos existentes). Hacé un `pg_dump` antes de desplegar. El `down()` existe pero pierde información: cada usuario conserva un solo cargo y una sola especialidad.

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


## Política de contraseñas

Toda contraseña **nueva** (de alumnos y de admins) tiene que tener:

- al menos 8 caracteres (y como máximo 72 bytes, el límite de bcrypt);
- una letra mayúscula y una minúscula (se aceptan tildes y ñ);
- un número;
- un caracter especial: cualquier símbolo que no sea letra, número ni espacio (`! # $ % _ -`, etc.).

Se exige en todos los lugares donde se elige una contraseña: `POST /sso/set-password` (primera vez y "olvidé mi contraseña" del alumno), `POST /admin/admins` (alta de admin), `PATCH /admin/admins/me` ("Mi perfil") y el seeder del primer admin. Si no se cumple, la API responde `400` con **un solo mensaje que lista todo lo que falta** (por ejemplo: «La contraseña no es segura. Le falta: una letra mayúscula, un número.»), y el panel muestra la misma lista mientras se escribe.

Los campos que solo **verifican** una contraseña existente (login, confirmación con la contraseña del admin, baja o cambio de email del alumno) no aplican la política: las cuentas creadas antes siguen entrando y la política se les exige recién cuando cambian la contraseña.

La regla vive en `src/common/validators/password-policy.validator.ts` y está duplicada en el panel (`src/utils/passwordPolicy.ts`): si se cambia, hay que cambiarla en los dos.


## Protección contra fuerza bruta en la baja de alumnos

La baja de un alumno con contraseña exige ingresar esa contraseña, por lo que el endpoint `DELETE /admin/students/:id` tiene dos límites independientes, ambos configurables por entorno:

| Límite | Alcance | Por defecto | Respuesta |
|--------|---------|-------------|-----------|
| Requests de baja | Por IP | 10 por minuto | `429` con header `Retry-After` |
| Intentos de contraseña | Por alumno | 5 cada 15 minutos | `403` con `attemptsRemaining`; al agotarse, `429` con `code: PASSWORD_ATTEMPTS_LOCKED` y `retryAfterSeconds` |

- El contador de intentos vive en Redis y se incrementa **antes** de comparar la contraseña, por lo que los intentos en paralelo también cuentan.
- Una contraseña correcta durante un bloqueo **no** lo levanta.
- `GET /admin/students/:id/password-lock` informa si un alumno está bloqueado sin consumir intentos (lo usa el panel para mostrar la espera al abrir el modal).
- Para levantar un bloqueo manualmente: `DEL student:password-attempts:<id del alumno>` en Redis.
- Si una variable de estos límites está definida con un valor inválido, el servidor no arranca.
- **Despliegue:** `TRUST_PROXY` (por defecto `1`) debe coincidir con el número real de proxies delante del back, y el back no debe ser accesible sin pasar por ellos; de lo contrario la IP puede falsearse con `X-Forwarded-For`.

## Protección contra fuerza bruta en el login

Tres capas independientes:

| Capa | Alcance | Por defecto | Respuesta |
|------|---------|-------------|-----------|
| Requests de `POST /sso/login` | Por IP | 20 por minuto | `429` |
| Intentos fallidos de contraseña | Por **cuenta** (nombre de usuario), sin importar la IP | 5 cada 15 minutos (`LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_TTL_MS`) | `429` con `Retry-After` |
| Pedidos de correo (configurar / olvidé mi contraseña) | Por nombre de usuario | 1 cada 5 minutos (`PASSWORD_RESET_COOLDOWN_MS`) | `429` con `retryAfter` |

- El contador vive en Redis (`sso:login-attempts:<usuario>`), es **independiente** del de la baja de alumnos, y se cuenta también para usuarios que no existen (así no revela cuáles existen).
- Un login correcto limpia el contador. Contrapartida: alguien puede bloquear a propósito a un usuario concreto durante 15 minutos; el bloqueo expira solo.
- Para levantar un bloqueo manualmente: `DEL sso:login-attempts:<usuario en minúsculas>` en Redis.
- `/sso/token`, `/sso/refresh` y `/sso/logout` se limitan por **(`client_id` + IP)**, no solo por IP: varias aplicaciones, o varios alumnos entrando a la vez desde el servidor de una aplicación, no se pisan entre sí.
- Las rutas `/admin/*` (ya autenticadas) tienen un límite de 300 requests por minuto por IP.

## Cargos, especialidades y sus reglas

Cada usuario tiene **uno o más cargos** y **una o más especialidades**. Al crear un cargo, el administrador define dos reglas:

| Regla (API) | En el panel | Qué significa |
|---|---|---|
| `exclusive` | "No se combina con otros cargos" | Si un usuario tiene este cargo, no puede tener ningún otro. |
| `single_specialty` | "Exactamente una especialidad" | Si un usuario tiene este cargo (aunque tenga otros), debe tener exactamente una especialidad. |

- **Se aplican si ALGUNO de los cargos del usuario las tiene.** Ejemplo: Profesor (libre) + Regente (`single_specialty`) → el usuario debe tener una sola especialidad.
- **Son fijas:** se definen al crear el cargo y no hay forma de cambiarlas (no existe endpoint de edición de cargos; un campo extra en el request se rechaza con `400`). Para cambiar una regla hay que eliminar el cargo, cosa que solo se puede hacer si nadie lo tiene asignado, y volver a crearlo. **Definí bien las reglas antes de cargar usuarios reales.**
- **Se validan en el backend en todos los puntos de entrada**, con una única función (`src/domain-role/utils/assignment-rules.ts`): alta individual, vista previa del Excel, confirmación del Excel (vuelve a validar todo, no confía en la vista previa) y edición.
- Mensajes de error (`400`, en `message` como lista):
  - `El cargo "Alumno" no se puede combinar con otros cargos.`
  - `El cargo "Regente" exige exactamente una especialidad (se indicaron 2).`
  - `Indicá al menos un cargo.` / `Indicá al menos una especialidad.` / `Hay cargos repetidos.`
- Límites técnicos: hasta 10 cargos y 20 especialidades por usuario.

### Carga masiva por Excel

- Las columnas **Cargo** y **Especialidad** aceptan varios valores en la misma celda, separados por punto y coma (también se acepta coma): `Profesor; Preceptor`.
- El Excel de ejemplo (`GET /admin/students/import/example`) trae filas de ejemplo con un cargo y con varios, y al costado una tabla con cada cargo válido, si se combina con otros y cuántas especialidades admite, más la lista de especialidades válidas.
- En la vista previa cada fila se marca inválida si un cargo o especialidad no existe, está repetido o viola las reglas. En la confirmación, si alguna fila viola las reglas no se importa ninguna.

### Edición de un usuario

`PATCH /admin/students/:id` permite cambiar nombre, apellido, DNI, fecha de nacimiento, cargos y especialidades (las listas se reemplazan completas). El email y la contraseña tienen sus propios flujos; el nombre de usuario y el `sub` no cambian.

- **Confirmación obligatoria con la contraseña del admin** que hace el cambio (`admin_password`). Contraseña incorrecta → `403` con `attemptsRemaining`; al superar `ADMIN_CONFIRM_PASSWORD_MAX_ATTEMPTS` → `429` (`code: ADMIN_PASSWORD_ATTEMPTS_LOCKED`) durante `ADMIN_CONFIRM_PASSWORD_LOCK_TTL_MS`. Así, una sesión de admin robada no alcanza para cambiar permisos.
- Se valida la combinación **final** de cargos y especialidades con las reglas de arriba.
- **El usuario recibe un mail** ("Se modificaron tus datos en ITAPU") con el antes y el después de cada dato que cambió, para que pueda avisar si no lo reconoce.
- Las apps ven los cambios en la próxima renovación del token (como máximo `JWT_ACCESS_EXPIRES_IN`, 15 minutos) o en el próximo login. Hasta entonces, `/sso/me` con un access token anterior devuelve los datos viejos.

## Cambio de email de alumnos

Solo alumnos **activos**. Es un proceso de dos pasos:

1. `POST /admin/students/:id/email-change` (admin) con `{ password, newEmail }`. Requiere la contraseña del alumno (debe estar presente) y **comparte con la baja el mismo contador de intentos** (`STUDENT_PASSWORD_*`), así que no se pueden alternar acciones para evadirlo. Envía un link de confirmación al email **nuevo** y un aviso al email actual.
2. `POST /<AUTH_ROUTE_PATH>/confirm-email-change` (público) con `{ token }`. El link va a `<ADMIN_PANEL_URL>/confirm-email?token=...`. El token es de un solo uso y se guarda hasheado en la tabla `email_change_requests`.

Al confirmar, en una sola transacción: se cambia el email, se **cierran todas las sesiones** del alumno y se invalidan sus links de restaurar contraseña pendientes (viven en el email viejo). Se avisa al email anterior.

- `sub` no cambia nunca, por lo que las apps no pierden al usuario.
- **Limitación conocida:** los access tokens ya emitidos siguen siendo válidos hasta `JWT_ACCESS_EXPIRES_IN` (15 minutos por defecto) y `/sso/me` devuelve los datos que viajan en el token, así que las apps pueden ver el email anterior hasta entonces.
- Las solicitudes vencidas se borran con una tarea diaria (3 AM).
- Suspender o dar de baja a un alumno también cierra sus sesiones (mismo límite de 15 minutos para los access tokens).

## Panel de administración

El panel está en el repositorio **[github.com/ignamosconi/sso-itapu-front](https://github.com/ignamosconi/sso-itapu-front)**.

Permite:

- Iniciar sesión con 2FA obligatorio (TOTP).
- Gestionar administradores del sistema.
- Gestionar el padrón de usuarios: alta individual, carga masiva por Excel, edición (con la contraseña del admin), suspensión, baja y reenvío de email de bienvenida. Cada usuario puede tener varios cargos y varias especialidades.
- Configurar cargos institucionales (con sus reglas) y especialidades.
- Registrar y gestionar aplicaciones cliente OAuth.
- Regenerar client secrets y enviarlos por email con un link de un solo uso.
- Ver estadísticas del sistema en el dashboard.

(!) NOTA: El archivo de excel a subir solo podrá tener hasta 500 filas.

## Estructura del código

```
src/
├── main.ts · app.module.ts      Arranque y módulo raíz
├── config/                      Validaciones de arranque (secretos, TRUST_PROXY)
├── common/                      Piezas compartidas por todos los módulos
│   ├── guards/                  JwtGuard (alumnos), AdminJwtGuard, AppThrottlerGuard
│   ├── decorators/              @CurrentUser, @AdminThrottle
│   ├── pipes/                   ParseDbIdPipe (ids enteros válidos)
│   └── validators/              @IsRedirectUri, @IsDbIntString
├── auth/                        Flujo SSO de alumnos: login, token, refresh, logout, me, recuperar contraseña
├── code/                        Authorization codes (Redis)
├── refresh-token/               Refresh tokens: rotación y detección de reutilización
├── oauth-client/                Aplicaciones cliente OAuth
├── credential-token/            Link de un solo uso para entregar el Client Secret
├── password-reset-token/        Links de configurar / restablecer contraseña
├── student/
│   ├── student.module.ts
│   ├── students/                Padrón: alta, edición, baja, suspensión, importación por Excel
│   │   └── controllers · services · dtos · entities
│   ├── email-change/            Cambio de email de un alumno
│   └── password-attempts/       Contador de intentos de contraseña (baja y cambio de email)
├── admin/ · admin-auth/         Administradores, su login con 2FA y la confirmación con contraseña para editar usuarios
├── domain-role/ · specialty/    Cargos (con sus reglas) y especialidades
│   └── domain-role/utils/       assignment-rules.ts: ÚNICA función que valida las reglas de asignación
├── sso-info/ · stats/           Endpoints públicos de referencia y estadísticas
├── mail/ · redis/               Envío de correo y conexión a Redis
├── database/                    Migraciones y seeder
└── public/                      HTML/JS/CSS del popup de login y de la página de credenciales
```

Dentro de cada módulo: `controllers/`, `services/` (cada servicio con su `.interface.ts` y su `.spec.ts`), `dtos/` y `entities/`.

## Seguridad

El informe de la auditoría de seguridad (hallazgos, cómo se verificaron y cómo se resolvió cada uno) está en [`SECURITY-AUDIT.md`](./SECURITY-AUDIT.md). El workflow de CI corre lint, build, tests, `npm audit` y gitleaks; CodeQL y Dependabot están configurados en `.github/`.
