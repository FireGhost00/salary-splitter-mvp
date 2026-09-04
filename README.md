<div align="center">

# 💸 Splitter · AutoSaldo

### Gestor de **Presupuesto Base Cero** con reparto **50 / 30 / 20** automático

Registras un ingreso real y el motor lo fragmenta al instante —al centavo— en tus
sobres digitales: **Necesidad**, **Deseo** y **Ahorro**. Sin hojas de cálculo, sin fricción.

<br/>

![Astro](https://img.shields.io/badge/Astro-7.x_·_SSR-BC52EE?logo=astro&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres_·_Auth_·_RLS-3ECF8E?logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel_Serverless-000000?logo=vercel&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A5_22.12-5FA04E?logo=nodedotjs&logoColor=white)
![Estado](https://img.shields.io/badge/estado-MVP-orange)

</div>

---

## 📑 Contenido

- [✨ ¿Qué es?](#-qué-es)
- [🧩 Funcionalidades](#-funcionalidades)
- [🛠️ Stack tecnológico](#️-stack-tecnológico)
- [🏛️ Arquitectura y decisiones clave](#️-arquitectura-y-decisiones-clave)
- [📁 Estructura del proyecto](#-estructura-del-proyecto)
- [🚀 Instalación local](#-instalación-local)
- [☁️ Despliegue en Vercel](#️-despliegue-en-vercel)
- [✅ Integración continua](#-integración-continua)
- [📐 Convenciones](#-convenciones)
- [📄 Licencia](#-licencia)

---

## ✨ ¿Qué es?

**Splitter** convierte la clásica "hoja maestra" de Excel de un presupuesto personal en
una app automatizada y en la nube. Su método es un **Presupuesto Base Cero** apoyado en
el reparto **50 / 30 / 20**, que aquí es **fijo y no editable** (`MASTER_SPLIT` en
`src/lib/budget.js`):

| Sobre | % del ingreso | Qué incluye |
| :-- | :--: | :-- |
| 🏠 **Necesidad** | **50 %** | Gastos fijos y esenciales. **Absorbe** la cuota de **Deuda** y la **Provisión Mensual** (rubros anuales ÷ 12). |
| 🎉 **Deseo** | **30 %** | Ocio, restaurantes, suscripciones, caprichos. |
| 💰 **Ahorro** | **20 %** | Fondo de emergencia, inversiones, metas. Recibe además el **residuo** de los redondeos. |

### Cómo reparte un ingreso

1. El ingreso se divide **50 / 30 / 20** sobre centavos enteros con `Math.floor()`.
2. Dentro del **50 % de Necesidad** se abona primero a **Deuda** y a **Provisión Mensual**
   (solo lo que aún falta cubrir este mes; el resto queda como *Necesidad libre*).
3. **Abono parcial:** si ese 50 % no alcanza para toda la cuota fija del mes, se reparte
   íntegro entre Deuda y Provisión de forma proporcional, *Necesidad libre* queda en `$0`
   y **nunca se bloquea** el registro del ingreso.
4. Se hace un **INSERT masivo**: una transacción de tipo `ingreso` por cada sobre tocado,
   todas con el mismo `group_id` para poder deshacer el bloque desde el Historial.

---

## 🧩 Funcionalidades

- 🔐 **Autenticación** con Supabase Auth: email + contraseña **y** Google OAuth (flujo PKCE, sesión en cookies).
- 🧑‍🚀 **Onboarding** mínimo con *seed* idempotente del perfil y un diccionario base de subcategorías.
- ⚙️ **Configuración del presupuesto:** activar/desactivar **Deuda** (pago mensual fijo) y **Provisiones** (rubros anuales), más subcategorías propias dentro de cada sobre maestro.
- 💵 **Registrar ingreso** → distribución automática 50/30/20 con absorción de Deuda y Provisión.
- 🧾 **Gasto rápido** contra cualquier sobre o subcategoría, con la fecha de hoy.
- 📊 **Dashboard:** saldo disponible, saldo diferido, barras por categoría, seguimiento de deudas y provisiones, quincena (Q1 / Q2) y movimientos recientes.
- 🗓️ **Mes Ideal:** simulador que muestra el reparto de un ingreso mensual esperado, con alerta de déficit.
- 📈 **Resumen Anual (motor analítico):** ingresos vs. salidas por mes, crecimiento de provisiones y balance neto.
- 🕓 **Historial** paginado con borrado de movimientos individuales o por bloque (`group_id`).
- 🌒 **Modo Oscuro** de punta a punta, *mobile-first*, con barra de navegación superior fija.

---

## 🛠️ Stack tecnológico

| Capa | Tecnología |
| :-- | :-- |
| **Framework / Enrutamiento** | [Astro](https://astro.build/) `^7.2.9` — SSR *on-demand* (`prerender = false`) |
| **Interactividad** | [React](https://react.dev/) `19` como **Astro Islands** (`client:load`), solo para estado |
| **Estilos** | [Tailwind CSS](https://tailwindcss.com/) `4` vía `@tailwindcss/vite` |
| **Backend / DB / Auth** | [Supabase](https://supabase.com/) — PostgreSQL + Row Level Security + Auth |
| **Cliente Supabase** | `@supabase/supabase-js` + `@supabase/ssr` (sesión en cookies, servidor y navegador) |
| **Despliegue** | [Vercel](https://vercel.com/) mediante el adaptador `@astrojs/vercel` (funciones serverless) |
| **Runtime** | Node.js **≥ 22.12** |

> El stack está fijado en [`CONVENCIONES.md`](./CONVENCIONES.md) y no debe cambiarse sin justificarlo.

---

## 🏛️ Arquitectura y decisiones clave

### 1. 🪙 El Patrón *Money* (integridad matemática)

JavaScript pierde precisión con decimales (`0.1 + 0.2 !== 0.3`), inaceptable en una app
financiera. Por eso:

- **Todos los montos** se guardan, calculan y transmiten como **enteros de centavos**
  (`$1,500.50` → `150050`; columnas `*_cents` en PostgreSQL).
- El fraccionamiento multiplica sobre enteros y aplica `Math.floor()` / `Math.round()`
  explícitos; el **residuo** se suma a la categoría de mayor prioridad (Ahorro) para que
  la suma cuadre **exacta** con el ingreso.
- La **división entre 100** y el formateo a moneda ocurren **solo en el render**, con
  `Intl.NumberFormat` en [`src/lib/money.ts`](./src/lib/money.ts).

### 2. 🔒 Autenticación SSR con cookies + middleware

- [`src/lib/supabase.js`](./src/lib/supabase.js) crea un cliente de **servidor por
  petición** con `createServerClient()`, conectado a `Astro.cookies` (`getAll` / `setAll`):
  lee la sesión entrante y reescribe los tokens renovados como `Set-Cookie`.
- [`src/lib/supabase-browser.js`](./src/lib/supabase-browser.js) crea el cliente de
  **navegador** (solo para `signInWithOAuth` con Google).
- [`src/middleware.js`](./src/middleware.js) protege `/dashboard`, `/configuracion`,
  `/mes-ideal`, `/resumen-anual`, `/perfil`, `/historial` y `/api/*`: sin sesión →
  `302 /login` (o `401 JSON` para las APIs). También canjea el `?code=` de Google.
- **Row Level Security** en Supabase: cada usuario solo ve y modifica sus propias filas.
  Ver [`docs/INFRAESTRUCTURA.md`](./docs/INFRAESTRUCTURA.md) para el diagrama completo.

### 3. 🧮 Motor de reparto centralizado

[`src/lib/budget.js`](./src/lib/budget.js) es la única fuente de verdad del presupuesto:

- `MASTER_SPLIT` — el 50/30/20 **congelado** (`Object.freeze`).
- `splitIncome(incomeCents, { debtCents, provisionCents })` — reparte un ingreso con
  abono parcial y detección de déficit.
- `monthlyProvisionCents(items)` — suma de rubros anuales ÷ 12, en centavos enteros.
- Categorías del sistema (`Necesidad`, `Deseo`, `Ahorro`, `Deuda`, `Provisiones`) y el
  diccionario base de subcategorías para el *seed*.

El endpoint `POST /api/register-income` consume este motor; `POST /api/save-budget-config`
persiste la configuración de Deuda y Provisiones y siembra las categorías del sistema.

---

## 📁 Estructura del proyecto

```text
src/
├── pages/
│   ├── index.astro           → redirige a /login
│   ├── login.astro           → email + contraseña · botón de Google
│   ├── onboarding.astro      → alta de perfil + seed de categorías
│   ├── dashboard.astro       → saldo, sobres, gráficas, quincena, movimientos
│   ├── configuracion.astro   → Deuda, Provisiones y subcategorías
│   ├── mes-ideal.astro       → simulador de ingreso mensual
│   ├── resumen-anual.astro   → motor analítico del año
│   ├── historial.astro       → todos los movimientos (paginado)
│   ├── perfil.astro          → nombre y salario de referencia
│   ├── about.astro           → acerca de la app
│   └── api/                  → endpoints SSR
│       ├── register-income.js    · reparto 50/30/20 de un ingreso
│       ├── save-budget-config.js · config de Deuda + Provisiones
│       ├── expense.js            · registrar un gasto
│       ├── add-category.js       · crear subcategoría
│       ├── seed-account.js       · sembrar cuenta nueva (idempotente)
│       ├── get-history.js        · historial paginado
│       ├── delete-transaction.js · borrar movimiento / bloque
│       └── auth/                 · callback y signout de OAuth
├── components/               → Astro (UI estática) + React (islas interactivas)
├── layouts/BaseLayout.astro  → <html class="dark"> + <Navbar>
├── middleware.js             → guardián de sesión y callback OAuth
├── lib/                      → money.ts · budget.js · supabase.js · supabase-browser.js
└── styles/global.css

docs/
├── INFRAESTRUCTURA.md        → diagrama Mermaid de la arquitectura SSR
└── sql/                      → schema.sql + migraciones 0001…0005

CONVENCIONES.md               → reglas de arquitectura (no modificar)
astro.config.mjs              → integraciones React + Tailwind + adaptador Vercel
```

---

## 🚀 Instalación local

### Prerrequisitos

- **Node.js ≥ 22.12** y npm.
- Un proyecto de **Supabase** (plan gratuito sirve) con la base de datos creada.

### 1. Clonar e instalar

```bash
git clone https://github.com/FireGhost00/salary-splitter-mvp.git
cd salary-splitter-mvp
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env
```

> [!WARNING]
> **Nunca subas tus credenciales al repositorio.**
> El archivo **`.env` está protegido por [`.gitignore`](./.gitignore)** (reglas
> `.env` y `.env.*`, con la excepción `!.env.example`) y **debe permanecer así**.
> `SUPABASE_URL` y `SUPABASE_ANON_KEY` viven **únicamente en tu `.env` local** y, en
> producción, en el panel de variables de entorno de Vercel.
> Lo único que se versiona es **`.env.example`**, que trae las claves **sin valores**.

Rellena `.env` con los datos de tu proyecto (Supabase → **Project Settings → API**):

```dotenv
# Servidor (SSR / endpoints)
SUPABASE_URL="https://TU-PROYECTO.supabase.co"
SUPABASE_ANON_KEY="tu-anon-key"

# Navegador (login con Google en el cliente). Mismos valores;
# el prefijo PUBLIC_ es lo que Astro expone al bundle del navegador.
PUBLIC_SUPABASE_URL="https://TU-PROYECTO.supabase.co"
PUBLIC_SUPABASE_ANON_KEY="tu-anon-key"

# Rate limiting (opcional en local) — ver más abajo.
UPSTASH_REDIS_REST_URL="https://tu-db.upstash.io"
UPSTASH_REDIS_REST_TOKEN="tu-token"
```

> ℹ️ Usa siempre la **anon key**, nunca la `service_role`. La seguridad la da el JWT del
> usuario junto con las políticas RLS.

**Rate limiting (Upstash Redis).** [`src/lib/rate-limit.js`](./src/lib/rate-limit.js)
limita `register-income`, `expense` y `save-budget-config` a 20 peticiones por usuario
cada 60 s (ventana deslizante), con [Upstash](https://upstash.com/) como store
compartido entre las funciones serverless de Vercel. Para obtener las claves:

1. Crea una cuenta gratuita en [upstash.com](https://upstash.com/) → **Create Database**
   (tipo *Redis*, cualquier región cercana a tu deploy de Vercel).
2. En el panel de la base de datos, pestaña **REST API**, copia **`UPSTASH_REDIS_REST_URL`**
   y **`UPSTASH_REDIS_REST_TOKEN`** a tu `.env`.

Son **opcionales en local**: si no están configuradas, el rate limiting queda
desactivado (deja pasar todo) en vez de romper la app o bloquear peticiones — solo
hacen falta antes de desplegar a producción (ver *Despliegue en Vercel* más abajo).

### 3. Base de datos

En el **SQL Editor** de Supabase:

- Proyecto limpio → ejecuta [`docs/sql/schema.sql`](./docs/sql/schema.sql).
- Proyecto con tablas previas → aplica en orden las migraciones
  `docs/sql/0001…0005_*.sql`.
- Crea también la vista **`monthly_balances`** (definición de referencia al final de
  `schema.sql`).

En **Authentication → Providers**, habilita **Google** y añade la Redirect URL de
desarrollo: `http://localhost:4321/dashboard`.

### 4. Arrancar

```bash
npm run dev      # http://localhost:4321
npm run build    # build de producción (adaptador Vercel)
npm run preview  # sirve el build localmente
```

---

## ☁️ Despliegue en Vercel

El proyecto usa el adaptador **`@astrojs/vercel`** (SSR serverless), declarado en
[`astro.config.mjs`](./astro.config.mjs). Al importar el repo, Vercel detecta Astro
automáticamente (build: `npm run build`, sin configuración extra).

1. **Variables de entorno** — *Project → Settings → Environment Variables*: añade las
   **cuatro** claves de Supabase para *Production* (y *Preview* si lo usas):
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`.
   Añade también `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` — **sin ellas el
   rate limiting queda desactivado en producción** (no rompe el deploy, pero deja de
   proteger `register-income` / `expense` / `save-budget-config`).
2. **Google OAuth** — en Supabase, añade la Redirect URL de producción:
   `https://TU-DOMINIO.vercel.app/dashboard` (además de la de localhost).
3. **Salida de build** — el adaptador escribe en `.vercel/output/`, ya ignorado por
   `.gitignore`. No hay que commitearlo.
4. **Ruta raíz** — `/` redirige a `/login`, así que el dominio base nunca da 404.
5. Cada `git push` a la rama conectada dispara un *deploy*; cada PR genera un *Preview*.

---

## ✅ Integración continua

Cada `push` y cada `pull_request` hacia **`main`** dispara el workflow
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml), que sobre Node ≥ 22.12:

1. instala las dependencias con `npm ci`,
2. ejecuta las pruebas unitarias con `npm test` (176 casos: motor 50/30/20,
   formateo de moneda, validación de payloads, logging, rate limiting),
3. compila el proyecto con `npm run build`.

Es **solo verificación**: no despliega (de eso se encarga Vercel) y no usa
ningún secreto — ni las cuatro claves de Supabase ni las de Upstash hacen
falta en build time.

---

## 📐 Convenciones

Las reglas de arquitectura —stack inquebrantable, Patrón *Money*, guía de diseño (Modo
Oscuro, fricción cero) y SRP— están en **[`CONVENCIONES.md`](./CONVENCIONES.md)**.
Todo cambio debe respetarlas; ese archivo no se modifica ni se elimina.

---

## 📄 Licencia

Proyecto personal en fase **MVP**. Todos los derechos reservados.

<!-- build: refresh vercel cache -->

