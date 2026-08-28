# 🤖 CONVENCIONES DEL PROYECTO (AUTO-SALDO MVP)
**INSTRUCCIÓN ESTRICTA PARA EL AGENTE DE IA (CLAUDE CODE):** 
Debes leer y obedecer estas reglas antes de ejecutar cualquier comando, crear componentes o modificar la arquitectura. Si una solicitud del usuario contradice estas reglas, debes advertirle antes de proceder.

## 1. Stack Tecnológico Inquebrantable
- **Frontend / Enrutamiento:** Astro (`.astro`). Utiliza el modelo de renderizado estático por defecto.
- **Interactividad:** Solo usa componentes de React (`.jsx` / `.tsx`) mediante "Astro Islands" (`client:load` o `client:visible`) cuando sea estrictamente necesario para el estado (ej. formularios complejos, sliders). Para UI estática, usa solo Astro.
- **Estilos:** Tailwind CSS. 
- **Backend / Base de Datos:** Supabase (SDK oficial `@supabase/supabase-js`).
- **Autenticación:** Supabase Auth.

## 2. Regla Crítica de Dominio: El Patrón Money (Manejo de Dinero)
Esta es una aplicación financiera. La pérdida de precisión por coma flotante en JavaScript es inaceptable.
- **Base de Datos:** TODOS los montos (ingresos, gastos, saldos) se guardan en PostgreSQL como tipo `INTEGER` representando **centavos**.
- **Lógica de Negocio:** Un monto de `$1,500.50` debe ser manejado en la lógica, estado y base de datos como `150050`.
- **Cálculo de Porcentajes:** Al fraccionar el dinero, realiza multiplicaciones sobre los centavos enteros y utiliza `Math.floor()` o `Math.round()` de forma explícita para evitar decimales. El remanente (residuo) de redondeos debe sumarse siempre a la categoría con mayor prioridad (ej. Ahorro) para que la suma total sea matemáticamente exacta al monto original.
- **Renderizado (UI):** La división entre `100` y el formateo a moneda (ej. `$ USD`) ocurre **ÚNICA Y EXCLUSIVAMENTE** en el último paso, justo antes de renderizar el valor en la pantalla (usando `Intl.NumberFormat`).

## 3. Guía de Diseño (UI/UX)
- **Tema:** Minimalista, limpio y moderno. Privilegia el Modo Oscuro (Dark Mode) por defecto.
- **Componentes:** Crea componentes modulares y reutilizables en la carpeta `src/components`.
- **Fricción Cero:** Los formularios deben requerir la mínima cantidad de clics posibles.

## 4. Reglas Operativas para el Agente (Git y Archivos)
- NUNCA elimines ni modifiques este archivo `CONVENCIONES.md`.
- Mantén las funciones pequeñas y con un solo propósito (Single Responsibility Principle).
- Las credenciales (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) siempre deben ir en un `.env` local, el cual debe estar en el `.gitignore`.

---
*Agente: Si has leído y entendido estas reglas, estás listo para comenzar a procesar los micro-prompts del usuario.*