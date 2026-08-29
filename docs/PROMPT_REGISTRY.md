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

Crea el Issue y genera el Ingreso:

"Claude, crea el componente IncomeModal.jsx. Debe ser similar al QuickExpenseModal pero para ingresos. Incluye un selector para 'Quincena 1' o 'Quincena 2'. Al enviar, debe hacer un POST a /api/distribute con el monto ingresado. Coloca el botón para abrir este modal en la parte superior del Dashboard, cerca del saldo total."

Construye el Historial (Ledger):

"Claude, crea un componente estático TransactionList.astro. Debe consultar la tabla transactions en Supabase, ordenar por created_at DESC y limitar a 7 resultados. Renderiza una tabla minimalista con bordes sutiles border-slate-800. Colócalo debajo del EnvelopeGrid en el dashboard. Recuerda dividir el monto entre 100 para mostrarlo."

Claude, ejecuta la Historia de Usuario [US-10]. 1. Crea el endpoint en /api/transaction/delete.js asegurando la validación del usuario vía SSR. 2. Crea un componente en React llamado DeleteTransactionButton.jsx con un ícono de papelera y un window.confirm simple. 3. Integra este botón en tu componente de lista de transacciones actual pasando el ID correspondiente. Confirma cuando esté listo para probar en local.




Claude, ejecuta la Historia de Usuario [US-11]. Añade un pequeño formulario GET encima del historial en TransactionList.astro con dos <select>: uno para filtrar por tipo (Todos, Ingresos, Gastos) y otro para ordenar (Recientes, Antiguos). Haz que los selects tengan onchange='this.form.submit()'. En la parte superior del archivo (frontmatter), captura Astro.url.searchParams y modifica dinámicamente la consulta de Supabase aplicando .gt() o .lt() según el tipo, y ajustando el flag ascending del .order() según corresponda. Mantén el diseño minimalista de Tailwind."


Claude, ejecuta la Historia de Usuario [US-12]. Implementa paginación mediante SSR en TransactionList.astro. Lee el parámetro page de la URL. Calcula los índices from y to (10 items por página) y reemplaza .limit() por .range(from, to) en la llamada a Supabase. Al final de la lista, añade botones 'Anterior' y 'Siguiente' con Tailwind. Asegúrate de que los enlaces de estos botones clonen los searchParams actuales para que no se pierdan los filtros que implementamos antes al cambiar de página."


Claude, ejecuta la US-13. Modifica IncomeModal.jsx para asegurarte de que envíe la quincena seleccionada ('Q1' o 'Q2') en el payload. Luego, actualiza /api/distribute.js para capturar este valor. Dentro del map/bucle de inserción, cambia el label estático por uno dinámico usando template literals, con el formato: 'Distribución [Q1/Q2] - [Nombre de la Categoría]'. Asegúrate de que las celdas de texto en TransactionList.astro tengan la clase truncate de Tailwind para evitar desbordamientos visuales.


Claude, revisa el componente IncomeModal.jsx. Asegúrate de que el formulario tenga un input o selector para la quincena (Q1/Q2) y que su valor se incluya en el cuerpo (body) de la petición POST que va hacia /api/distribute. Muéstrame cómo quedó la función de envío.


Claude, ahora revisa /api/distribute.js. Verifica que extraiga cycle del request. Al momento de armar el array para insertar en Supabase, la propiedad label no debe ser un texto estático. Cámbiala para que use template literals y quede exactamente con este formato: `Distribución ${cycle} - ${categoryName}`. Si no tienes el nombre de la categoría a la mano, modifícalo para que al menos diga `Distribución ${cycle}`.

Claude, ejecuta la US-14. Abre TransactionList.astro. En el frontmatter, toma el array de transacciones de Supabase y agrúpalo por fecha local usando reduce(). Crea una función de ayuda que compare la fecha de la transacción con la fecha actual del sistema: si es el mismo día, la llave será 'Hoy'; si fue el día anterior, 'Ayer'; de lo contrario, formatea como 'DD MMM' (ej. '26 ago'). Modifica el HTML de la tabla para iterar sobre este nuevo objeto agrupado: renderiza una cabecera de sección (colspan completo, texto text-slate-500 pequeño en mayúsculas, fondo sutil o borde inferior) para cada fecha, y debajo las filas de transacciones correspondientes. Mantén intacta la paginación y los filtros.

Claude, ejecuta la US-15. La vista monthly_balances y la columna effective_date ya están creadas en la base de datos. Procede a actualizar IncomeModal.jsx, /api/distribute.js, /api/expense.js y TransactionList.astro según los criterios de aceptación, recordando no romper la lógica de paginación ni la de fechas relativas del historial."

Claude, ejecuta la US-15 para solucionar el error 'Could not find the table category_balances'. Realiza los cambios en este orden: 1. En dashboard.astro y cualquier otro archivo que consulte saldos, cambia supabase.from('category_balances') por supabase.from('monthly_balances'). 2. Lee el mes y año actuales usando JavaScript (o de la URL) y añade a esa consulta los filtros correspondientes para el mes. 3. En IncomeModal.jsx, añade un checkbox 'Aplicar al próximo mes' y envíalo en el payload. 4. En /api/distribute.js, si el flag es true, inserta en effective_date el día 1 del próximo mes; si es false, la fecha de hoy. 5. En /api/expense.js inserta la fecha de hoy en effective_date. 6. En TransactionList.astro, filtra las transacciones usando .gte y .lte sobre effective_date basándote en el mes actual. ¡CRÍTICO!: En TransactionList.astro, NO modifiques la lógica de paginación ni la agrupación por días.

"Claude, los saldos han desaparecido visualmente del Dashboard. Verifica los componentes donde se renderiza el total y los sobres (ej. HeroBalance y EnvelopeCard). Recuerda que la nueva vista de Supabase monthly_balances devuelve el dinero en una columna llamada balance, no en amount. Corrige el mapeo de variables en Astro para que los valores se impriman correctamente en pantalla."

Claude, en el modal 'Gasto rápido' (ExpenseModal.jsx), el selector <select> aparece completamente vacío sin opciones. Revisa cómo se obtienen las categorías: asegúrate de que en dashboard.astro se consulten directamente desde la tabla categories con supabase.from('categories').select('id, name') y se le pasen como prop al componente <ExpenseModal categories="{categories}" client:load/>. Luego, dentro de ExpenseModal.jsx, mapea esas categorías para renderizar los <option key={cat.id} value={cat.id}>{cat.name}</option>.

Claude, vamos a auditar el resto de los modales tras el cambio a la vista monthly_balances. 1. Revisa dashboard.astro: asegúrate de que <TransferModal client:load/> esté recibiendo la prop categories obtenida desde supabase.from('categories'), al igual que hicimos con los gastos. 2. Revisa TransferModal.jsx: mapea esas categorías en los selectores de origen y destino. 3. Revisa /api/transfer.js: si este endpoint valida el saldo antes de transferir, asegúrate de que consulte la nueva vista monthly_balances (columna balance) filtrando por el mes activo. 4. Revisa IncomeModal.jsx y verifica que todos sus inputs estén enviando el payload correctamente. Confirma cuando hayas terminado.


Claude, revisé el esquema y la tabla 'categories' solo tiene user_id, name y type. El error 42P16 ocurre porque ya existe una llave primaria (probablemente compuesta). Conéctate a la base de datos y ejecuta un script SQL para: 1) Hacer DROP CONSTRAINT de la llave primaria actual de la tabla categories (suele llamarse categories_pkey). 2) Añadir la columna 'id' de tipo UUID como PRIMARY KEY con DEFAULT gen_random_uuid(). Avísame cuando se ejecute con éxito.


Claude, el dashboard está arrojando un error porque intenta buscar 'category_id' en la tabla categories, pero la columna real en Supabase se llama 'id'. Por favor, actualiza la consulta en dashboard.astro para que haga el .select() correcto. Luego, revisa todos los componentes modales en React y asegúrate de que usen category.id en lugar de category_id para sus atributos key y value.



Claude, vamos a pivotar el MVP de 'Auto-Saldo' hacia un entorno multiusuario (Multi-tenant) utilizando Google OAuth y Astro SSR. Necesito que actúes como un desarrollador Full-Stack y apliques los siguientes cambios en orden estricto, deteniéndote si encuentras algún error crítico:

PASO 1: Base de Datos y RLS (Perfiles)
Crea y ejecuta un script SQL para construir la tabla de perfiles: CREATE TABLE profiles (id UUID REFERENCES auth.users NOT NULL PRIMARY KEY, first_name TEXT, base_salary DECIMAL(10,2) DEFAULT 0);. Acto seguido, habilita RLS en esta tabla (ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;) y crea las políticas necesarias para que cada usuario solo pueda hacer SELECT, INSERT y UPDATE donde auth.uid() = id.

PASO 2: UI de Autenticación (Google OAuth)
Ve al componente de React o página de Astro que renderiza el Login actual (el de email y contraseña). Elimina ese formulario manual y reemplázalo por un diseño minimalista con un único botón: 'Continuar con Google'. Este botón debe disparar supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'http://localhost:4321/api/auth/callback' } }).

PASO 3: Manejo de Sesión (Astro SSR)
Implementa el endpoint de callback en src/pages/api/auth/callback.js (o .ts). Debe capturar el parámetro code de la URL, ejecutar exchangeCodeForSession usando el paquete @supabase/ssr, y establecer las cookies de sesión de forma segura para que Astro reconozca al usuario en el servidor.

PASO 4: Flujo de Onboarding (Salario Dinámico)
Crea una nueva página src/pages/onboarding.astro. Debe contener un formulario sencillo que pida 'Nombre' y 'Salario Base (Quincenal o Mensual)'. Al enviar el formulario, inserta/actualiza estos datos en la tabla profiles para el usuario activo y redirige a /dashboard.

PASO 5: Protección de Rutas y Redirección Lógica
En el frontmatter de src/pages/dashboard.astro, implementa la siguiente lógica de control de acceso:

Si no hay sesión válida en cookies -> Redirigir a la vista de Login.

Si hay sesión, consulta la tabla profiles. Si el usuario no tiene registro allí o su base_salary es nulo/cero -> Redirigir forzosamente a /onboarding.

Si todo está correcto, pasa el base_salary como prop a los componentes <HeroBalance/> y al <QuincenaTracker/> para que los cálculos matemáticos abandonen los valores quemados (hardcoded) y usen el salario real de ese miembro de la familia.

Revisa bien el código antes de escribir en los archivos. Confírmame cuando hayas completado estos 5 pasos para realizar las pruebas locales.