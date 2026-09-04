# 🏗️ Infraestructura y Arquitectura SSR

Documento de referencia sobre cómo fluye una petición en **Splitter · AutoSaldo**,
desde el navegador hasta la base de datos, y dónde se aplica la seguridad.

- **Renderizado:** Astro en modo *Server-Side Rendering* (`prerender = false` en todas
  las rutas de app), desplegado como **funciones serverless en Vercel** (`@astrojs/vercel`).
- **Sesión:** cookies HTTP gestionadas por `@supabase/ssr` a través de `Astro.cookies`.
- **Aislamiento de datos:** *Row Level Security* (RLS) en PostgreSQL — la seguridad
  vive en la base de datos, no en la aplicación.

---

## 📊 Diagrama de flujo (SSR)

```mermaid
flowchart TD
    subgraph client["🖥️ Cliente"]
        Browser["Navegador / Celular<br/>Astro Islands · React 19"]
    end

    subgraph vercel["☁️ Vercel · Función Serverless (Astro SSR)"]
        MW["src/middleware.js — onRequest()<br/>Guardián de rutas protegidas"]
        SB["src/lib/supabase.js<br/>createServerClient() · lee y escribe Astro.cookies"]
        Pages["Páginas .astro + Endpoints /api/*<br/>(prerender = false)"]
    end

    subgraph supabaseCloud["🗄️ Supabase Cloud"]
        Auth["Supabase Auth<br/>valida el JWT de sesión"]
        DB[("PostgreSQL<br/>+ Row Level Security")]
    end

    Browser -- "HTTPS · envía cookies de sesión<br/>sb-access-token / sb-refresh-token" --> MW

    MW -- "¿ruta protegida?<br/>supabase.auth.getSession() lee la cookie" --> SB
    SB -- "verifica el token" --> Auth
    Auth -- "sesión válida / inválida" --> SB
    SB -- "resultado de sesión" --> MW

    MW -- "❌ sin sesión → 302 /login<br/>❌ API sin sesión → 401 JSON" --> Browser
    MW -- "✅ con sesión → context.locals.user" --> Pages
    MW -. "OAuth: ?code= de Google<br/>exchangeCodeForSession()" .-> SB

    Pages -- "consultas con el token del usuario" --> SB
    SB -- "SQL — RLS filtra por auth.uid()" --> DB
    DB -- "solo las filas del usuario" --> SB
    SB -- "datos" --> Pages

    Pages -- "HTML renderizado + Set-Cookie<br/>(tokens de sesión renovados)" --> Browser
```

---

## 📝 Explicación

### 1. El Cliente (Navegador / Celular)
La app es *mobile-first* y en Modo Oscuro. El HTML llega ya renderizado desde el
servidor; React solo se hidrata en islas puntuales (`client:load`) para formularios
y modales. En **cada petición** el navegador adjunta automáticamente las cookies de
sesión de Supabase (`sb-access-token`, `sb-refresh-token`).

### 2. El servidor de Vercel (Astro SSR)
Cada ruta de la aplicación declara `export const prerender = false`, por lo que Vercel
la ejecuta como una **función serverless** en cada request. Antes de renderizar nada,
Astro invoca `src/middleware.js`.

### 3. `src/middleware.js` — protección de rutas
`onRequest()` es el guardián central:

- Para prefijos protegidos (`/dashboard`, `/configuracion`, `/mes-ideal`,
  `/resumen-anual`, `/perfil`, `/historial`, `/api/*`) exige sesión.
- **Sin sesión:** redirige con `302` a `/login`; si la ruta es una API, responde
  `401 JSON` (no un redirect HTML).
- **Con sesión:** expone el usuario en `context.locals.user` y deja pasar la petición.
- **Callback OAuth:** si Google devuelve `?code=` en `/dashboard`, el middleware lo
  canjea por una sesión (`exchangeCodeForSession`) y limpia la URL antes de renderizar.

### 4. `src/lib/supabase.js` — comunicación segura con cookies
Crea un cliente de Supabase **por cada petición** con `createServerClient()` de
`@supabase/ssr`, conectado a `Astro.cookies`:

- `getAll()` lee las cookies entrantes para reconstruir la sesión del usuario.
- `setAll()` vuelve a escribir en `Astro.cookies` los tokens si Supabase los renueva,
  de modo que la respuesta incluye los `Set-Cookie` actualizados.
- Usa siempre la **`SUPABASE_ANON_KEY`** (nunca la `service_role`): la autoridad real
  la da el JWT del usuario, no la clave.

El cliente de navegador equivalente (`src/lib/supabase-browser.js`) solo se usa para
iniciar el login con Google y persiste la sesión en esas mismas cookies, para que el
servidor pueda leerla en la siguiente petición.

### 5. La base de datos de Supabase (en la nube)
- **Supabase Auth** valida el JWT y gestiona el ciclo de vida de la sesión.
- **PostgreSQL con Row Level Security:** cada tabla (`profiles`, `categories`,
  `transactions`, `budget_config`, `provision_items`, …) tiene políticas
  `user_id = auth.uid()`. Aunque un endpoint tuviera un bug, la base de datos **nunca
  devuelve filas de otro usuario**. El aislamiento no depende del código de la app.

### 6. Logging estructurado y cómo consultarlo en Vercel
[`src/lib/logger.js`](../src/lib/logger.js) centraliza el logging de error de los 7
endpoints en `src/pages/api/`: cada uno envuelve su handler exportado con
`withLogging("<endpoint>", handler)`, que:

- Loguea (una línea JSON a `console.error`) toda respuesta con status `>= 500` y
  cualquier excepción no controlada (p. ej. `createSupabaseServerClient` sin
  credenciales), devolviendo en ese caso un `500 { error }` uniforme en vez del
  error genérico de Astro. Las respuestas 2xx/4xx (401, 422, 429…) no se loguean:
  son resultados esperados, no fallos a investigar.
- **Nunca** loguea cookies, `SUPABASE_ANON_KEY` / `SUPABASE_URL`, el `service_role
  key` (que este proyecto no usa en ningún lado — solo la `anon key`, ver §4) ni el
  cuerpo crudo de la petición (montos, etc.). `redact()` sustituye además cualquier
  JWT o cookie de sesión de Supabase que apareciera en un mensaje de error por
  `[redacted]`, como defensa adicional.

Cada línea tiene esta forma:

```json
{ "level": "error", "endpoint": "expense", "method": "POST", "status": 500, "user_id": "8f2c…-uuid", "error": "mensaje corto", "timestamp": "2026-09-04T13:42:00.000Z" }
```

**Cómo consultarlos en Vercel** (captura stdout/stderr de cada función serverless
sin configuración adicional):

1. Dashboard del proyecto → pestaña **Logs** (u **Observability → Logs**) → filtra
   por ruta (`/api/register-income`, `/api/expense`, …) o por texto (`"level":"error"`).
2. Desde un deploy concreto: **Deployments → (deploy) → Functions → (función) → Logs**.
3. En tiempo real por CLI, con el proyecto vinculado: `vercel logs --follow`.

Como cada línea es un JSON, se puede filtrar por `endpoint`, `status` o `user_id`
directamente en el buscador de logs de Vercel, o reenviarlo a un *log drain* si se
necesita retención más larga que la que ofrece el plan de Vercel.

### Resumen del recorrido
```
Navegador ──cookies──▶ middleware.js ──getSession()──▶ supabase.js ──▶ Supabase Auth
                             │                                              │
                   sin sesión│302 /login / 401                              │
                             ▼                                              ▼
                          Página .astro / API ──consulta (token)──▶ PostgreSQL + RLS
                             │                                              │
                             ◀──────────── solo filas del usuario ──────────┘
                             ▼
                  HTML + Set-Cookie (sesión renovada) ──▶ Navegador
```
