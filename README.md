# 💸 Splitter · AutoSaldo

> Gestor de **Presupuesto Base Cero** con reparto **50 / 30 / 20** automático.
> Registras un ingreso real y el motor lo fragmenta al instante en tus "sobres"
> digitales — sin hojas de cálculo, sin fricción.

![Astro](https://img.shields.io/badge/Astro-SSR-BC52EE?logo=astro&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres_%2B_Auth-3ECF8E?logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white)
![Estado](https://img.shields.io/badge/estado-MVP-orange)

---

## ✨ ¿Qué es?

**Splitter** replica la "hoja maestra" de Excel de un presupuesto personal, pero
automatizada y en la nube. Su método es un **Presupuesto Base Cero** apoyado en el
reparto clásico:

| Bloque | % del ingreso | Qué incluye |
| --- | --- | --- |
| 🏠 **Necesidad** | **50 %** | Gastos fijos y esenciales. Absorbe la **cuota de Deuda** y las **Provisiones mensuales**. |
| 🎉 **Deseo** | **30 %** | Ocio, restaurantes, suscripciones, caprichos. |
| 💰 **Ahorro** | **20 %** | Fondo de emergencia, inversiones, metas. |

Cada ingreso se reparte con matemática **exacta al centavo** (el residuo de los
redondeos siempre cae en Ahorro). Si la Deuda + Provisiones superan el 50 % de un
ingreso, la app muestra una **alerta de déficit** y prioriza el abono parcial.

### 🧩 Funcionalidades

- 🔐 **Autenticación** con Supabase Auth: email/contraseña **y** Google OAuth (flujo PKCE, sesión en cookies).
- 🧑‍🚀 **Onboarding** mínimo y **categorías 100 % dinámicas** (el usuario crea las suyas + subcategorías).
- 💵 **Registrar ingreso** → distribución automática en cascada (**Deuda → Provisiones → 50/30/20**).
- 🧾 **Gastos rápidos** contra cualquier sobre o subcategoría.
- 📊 **Dashboard**: saldo disponible, barras por categoría, seguimiento de deudas y provisiones.
- 🗓️ **Mes Ideal**: simulador que muestra el reparto de un ingreso mensual esperado.
- 📅 **Resumen Anual**: ingresos vs. salidas por mes, crecimiento de provisiones, balance neto.
- 🕓 **Historial** con borrado de movimientos.
- 🌒 **Modo Oscuro** de punta a punta, mobile-first, navegación inferior fija.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
| --- | --- |
| **Framework / Enrutamiento** | [Astro](https://astro.build/) `^7.2.9` — SSR *on-demand* con `@astrojs/vercel` |
| **Interactividad** | [React](https://react.dev/) `19` como **Astro Islands** (`client:load` / `client:visible`) — solo para estado |
| **Estilos** | [Tailwind CSS](https://tailwindcss.com/) `4` vía `@tailwindcss/vite` |
| **Backend / DB / Auth** | [Supabase](https://supabase.com/) — PostgreSQL + Row Level Security + Auth |
| **Cliente Supabase** | `@supabase/supabase-js` + `@supabase/ssr` (sesión en cookies, server y browser) |
| **Despliegue** | [Vercel](https://vercel.com/) (funciones serverless) |

---

## 🏗️ Arquitectura y decisiones clave

### 1. 🪙 El Patrón "Money" (integridad matemática)

JavaScript pierde precisión con decimales (`0.1 + 0.2 !== 0.3`). Por eso:

- **Todos los montos** se guardan, calculan y transmiten como **enteros de centavos**
  (`$1,500.50` → `150050`).
- El fraccionamiento usa multiplicación sobre enteros + `Math.floor()` / `Math.round()`
  explícitos; el **residuo** se suma a la categoría de mayor prioridad para que la suma
  cuadre exacta.
- La **división entre 100** y el formateo a moneda ocurren **únicamente en el render**,
  con `Intl.NumberFormat` (`src/lib/money.ts`).

### 2. 🔒 Autenticación SSR con cookies + middleware

- `src/lib/supabase.js` crea el cliente de servidor (lee/escribe las cookies de sesión);
  `src/lib/supabase-browser.js` el de navegador (para `signInWithOAuth`).
- `src/middleware.js` protege las rutas privadas (`/dashboard`, `/configuracion`,
  `/mes-ideal`, `/resumen-anual`, `/perfil`, `/historial`, `/api/*`): sin sesión → `302 /login`
  (o `401 JSON` para las APIs). También canjea el `?code=` de Google y setea las cookies.
- **Row Level Security** en Supabase: cada usuario solo ve y modifica sus propias filas.

### 3. 🧮 Lógica de reparto centralizada

`src/lib/budget.js` contiene el modelo `MASTER_SPLIT` (50/30/20 inamovible) y
`splitIncome()`, que reparte un ingreso absorbiendo Deuda y Provisión Mensual dentro
del 50 % de Necesidad, con abono parcial y detección de déficit.

---

## 📁 Estructura del proyecto

```text
src/
├── pages/
│   ├── index.astro           → redirige a /login
│   ├── login.astro           → email/contraseña + botón Google
│   ├── onboarding.astro      → alta de perfil
│   ├── dashboard.astro       → saldo, sobres, gráficas, historial
│   ├── configuracion.astro   → categorías + reglas de reparto
│   ├── mes-ideal.astro       → simulador de ingreso mensual
│   ├── resumen-anual.astro   → métricas y gráficas del año
│   ├── historial.astro       → todos los movimientos
│   ├── perfil.astro
│   └── api/                  → endpoints SSR (ingreso, gasto, categorías, borrado, OAuth…)
├── components/               → Astro (UI estática) + React (islands interactivos)
├── layouts/BaseLayout.astro  → <html> + Navbar inferior (oculta en /login y /onboarding)
├── middleware.js             → guardián de sesión / callback OAuth
└── lib/                      → money.ts · budget.js · supabase.js · supabase-browser.js
docs/sql/                     → schema.sql + migraciones numeradas
CONVENCIONES.md               → reglas de arquitectura del proyecto
```

---

## 🚀 Instalación local

### Prerrequisitos

- **Node.js ≥ 22.12** y npm.
- Un proyecto de **Supabase** (gratis) con la base de datos creada — ver más abajo.

### Pasos

```bash
# 1. Clona e instala
git clone https://github.com/FireGhost00/salary-splitter-mvp.git
cd salary-splitter-mvp
npm install

# 2. Crea el archivo de variables de entorno
cp .env.example .env
```

> [!WARNING]
> **Nunca subas tus credenciales al repositorio.** El archivo `.env` está incluido
> en `.gitignore` y **debe permanecer así**. `SUPABASE_URL` y `SUPABASE_ANON_KEY`
> viven **únicamente en tu `.env` local** (y en el panel de Vercel para producción).
> Solo se versiona `.env.example`, que va vacío.

Rellena `.env` con los datos de tu proyecto Supabase (Project Settings → API):

```dotenv
# Servidor (SSR / endpoints)
SUPABASE_URL="https://TU-PROYECTO.supabase.co"
SUPABASE_ANON_KEY="tu-anon-key"

# Navegador (necesarias para el login con Google en el cliente).
# Mismos valores; el prefijo PUBLIC_ es lo que Astro expone al bundle del cliente.
PUBLIC_SUPABASE_URL="https://TU-PROYECTO.supabase.co"
PUBLIC_SUPABASE_ANON_KEY="tu-anon-key"
```

### Base de datos

En el **SQL Editor** de Supabase, ejecuta `docs/sql/schema.sql` (proyecto limpio) o,
si ya tienes tablas, aplica en orden las migraciones `docs/sql/0001…0005_*.sql`.
Crea también la vista `monthly_balances` (definición de referencia al final de `schema.sql`).

En **Authentication → Providers**, habilita **Google** y añade la Redirect URL
`http://localhost:4321/dashboard` para desarrollo.

### Arrancar

```bash
npm run dev      # http://localhost:4321
npm run build    # build de producción (adaptador Vercel)
npm run preview  # sirve el build localmente
```

---

## ☁️ Despliegue en Vercel

El proyecto usa el adaptador **`@astrojs/vercel`** (SSR serverless), configurado en
`astro.config.mjs`. Al importar el repo en Vercel se detecta automáticamente.

1. **Variables de entorno** (Project → Settings → Environment Variables): añade las
   **cuatro** claves — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PUBLIC_SUPABASE_URL`,
   `PUBLIC_SUPABASE_ANON_KEY`.
2. **Google OAuth**: en Supabase, añade la Redirect URL de producción
   `https://TU-DOMINIO.vercel.app/dashboard` (además de la de localhost).
3. **Build**: `npm run build` (por defecto). El *output* va a `.vercel/output/` — ya
   está en `.gitignore`.
4. La ruta raíz `/` redirige a `/login`, así que **no habrá 404 en el dominio base**.

---

## 📐 Convenciones

Las reglas de arquitectura (stack inquebrantable, patrón Money, guía de diseño,
SRP) están documentadas en **[`CONVENCIONES.md`](./CONVENCIONES.md)**. Cualquier
cambio debe respetarlas.

---

## 📄 Licencia

Proyecto personal en fase MVP. Todos los derechos reservados.
