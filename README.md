# 🏦 AutoSaldo MVP

AutoSaldo es una aplicación web progresiva (PWA) de gestión financiera personal diseñada bajo una filosofía de **fricción cero**. Funciona como un motor de distribución salarial automatizado: ingresas tu salario, y el sistema lo fragmenta instantáneamente en "sobres" digitales basados en reglas porcentuales predefinidas, eliminando la ansiedad del presupuesto manual.

Este proyecto está desplegado en un entorno Serverless y es accesible vía: [autosaldo.ngomez.dev](https://autosaldo.ngomez.dev)

## 🏗 Arquitectura y Stack Tecnológico

El proyecto está construido bajo el enfoque "Serverless Monorepo", priorizando la velocidad de carga y la integridad absoluta de los datos.

*   **Framework Frontend:** [Astro](https://astro.build/) (Renderizado estático estricto + SSR).
*   **Interactividad:** React (implementado exclusivamente como "Astro Islands" para formularios).
*   **Estilos:** Tailwind CSS (Diseño Mobile-first, UI minimalista oscura).
*   **Backend & Autenticación:** [Supabase](https://supabase.com/) (PostgreSQL + Auth SSR con cookies HTTP-Only).
*   **Despliegue:** Vercel (Edge Network).

## 🧠 Decisiones Técnicas Críticas

### 1. El Patrón "Money" (Integridad Matemática)
Para evitar la pérdida de precisión por coma flotante inherente a JavaScript (`0.1 + 0.2 = 0.30000000000000004`), **todos los montos financieros en esta aplicación se almacenan, calculan y transmiten en centavos enteros (`INTEGER`)**.
*   Un ingreso de `$1,500.50` se procesa como `150050`.
*   El formateo visual (división entre 100) ocurre única y exclusivamente en el último paso del renderizado de la UI.

### 2. Delegación Analítica a la Base de Datos
Las sumatorias de saldos no se realizan en el cliente mediante iteraciones pesadas (`.reduce()`). El servidor de Astro consulta Vistas SQL dedicadas en PostgreSQL que consolidan los saldos de los ingresos (positivos) y gastos (negativos) en tiempo real, garantizando tiempos de respuesta < 500ms.

### 3. Agent-Driven Development
Este código base está fuertemente co-desarrollado utilizando herramientas de interfaz de línea de comandos basadas en LLMs (Claude Code), guiadas mediante restricciones de arquitectura estrictas documentadas en el archivo `CONVENCIONES.md`.

## 🚀 Configuración Local (Desarrollo)

### Prerrequisitos
*   Node.js (v18 o superior)
*   Una instancia activa de Supabase.

### Pasos
1. Clona el repositorio:
   ```bash
   git clone [https://github.com/tu-usuario/autosaldo-mvp.git](https://github.com/tu-usuario/autosaldo-mvp.git)
   cd autosaldo-mvp

Instala las dependencias:

Bash
npm install
Configura las variables de entorno. Crea un archivo .env en la raíz (está excluido por .gitignore) y añade tus credenciales de Supabase:

Code snippet
PUBLIC_SUPABASE_URL="[https://tu-id-proyecto.supabase.co](https://tu-id-proyecto.supabase.co)"
PUBLIC_SUPABASE_ANON_KEY="tu-anon-key"
Inicia el servidor de desarrollo:

Bash
npm run dev
Abre http://localhost:4321 en tu navegador.

📝 Licencia
Este es un proyecto personal de código cerrado para la fase MVP.