Prompt 0: Inicialización del Proyecto

"Lee el archivo CONVENCIONES.md. Tu primera tarea es inicializar un proyecto Astro vacío en este directorio, configurar Tailwind CSS e instalar la librería de @supabase/supabase-js. Asegúrate de configurar el gitignore para proteger el archivo .env. Confirma cuando esté listo."

Prompt 1: Componentes Base de Visualización

"Claude, basándote en las reglas de CONVENCIONES.md, crea tres componentes estáticos en Astro dentro de src/components/dashboard/:

HeroBalance.astro: Recibe una prop amountInCents (entero). Formatea y divide el valor entre 100 para mostrarlo como moneda en formato grande, usando fuentes monoespaciadas y un estilo terminal oscuro.

QuincenaTracker.astro: Un indicador visual simple con dos estados (Q1 y Q2). Usa Tailwind para resaltar visualmente cuál es la quincena actual basada en la fecha del sistema.

EnvelopeCard.astro: Una tarjeta de categoría que recibe title, type y balanceInCents. Usa bordes sutiles y fondo oscuro profundo (slate-900).
Crea también datos falsos (mock data) en centavos para previsualizar los componentes."

Prompt 2: Maquetación del Dashboard

"Ahora, crea la página principal en src/pages/dashboard.astro. Importa HeroBalance, QuincenaTracker y EnvelopeCard. Construye un Layout responsivo (Mobile-first). En móviles, las tarjetas de EnvelopeCard deben ir en una sola columna. En escritorio, usa un CSS Grid de 3 columnas. Utiliza la mock data para renderizar un saldo total de $1,250.00 y tres sobres: 'Vivienda', 'Salidas' y 'Ahorro'."

Prompt 3: Interactividad (Astro Island)

"Crea un componente interactivo de React llamado QuickExpenseModal.jsx. Debe ser un botón flotante (FAB) que al hacer clic abra un pequeño modal. El modal debe tener un <select> para elegir la categoría, un <input type='number'> para el monto, y un botón de 'Descontar'. Por ahora, haz que solo imprima un console.log del gasto. Asegúrate de importar este componente en dashboard.astro usando la directiva client:load."




#Fase 2

CPrompt 1 (Motor Salarial):

"Claude, implementa el endpoint en src/pages/api/distribute.js. Debe recibir un POST con el salario. Conviértelo a centavos (x100). Consulta las reglas del usuario en Supabase, calcula las fracciones usando Math.floor() e inserta las transacciones en bloque. Calcula el residuo sobrante y súmaselo al sobre con mayor porcentaje para que cuadre exacto. No uses coma flotante."

Prompt 2 (Motor de Gastos):

"Crea el endpoint src/pages/api/expense.js. Recibirá un monto y una categoría. Convierte el monto a centavos y multiplícalo por -1 para guardarlo como entero negativo en la tabla transactions. Actualiza el componente QuickExpenseModal.jsx para que haga el fetch a este endpoint."

Prompt 3 (Integración UI):

"Modifica dashboard.astro para que consulte la vista SQL category_balances de Supabase. Suma los resultados para el <HeroBalance/> y distribúyelos en los <EnvelopeCard/>. Divide entre 100 solo al renderizar."