# Panel de Control Financiero - Guía de Despliegue

Sigue estos pasos para configurar y desplegar la aplicación web utilizando Firebase para la base de datos y Netlify para el hosting.

### Paso 1: Configurar Firebase

1.  **Crear un Proyecto en Firebase:**
    * Ve a la [Consola de Firebase](https://console.firebase.google.com/).
    * Haz clic en **"Agregar proyecto"** y sigue los pasos. Dale un nombre como "panel-financiero".

2.  **Crear una Aplicación Web:**
    * Dentro del panel de tu nuevo proyecto, haz clic en el ícono de web (`</>`) para registrar una nueva aplicación.
    * Dale un apodo (ej. "Mi Panel") y haz clic en **"Registrar app"**.
    * Firebase te mostrará tus credenciales de configuración en un objeto `firebaseConfig`. **Copia este objeto completo**, lo necesitarás para el despliegue en Netlify.

3.  **Habilitar Autenticación Anónima:**
    * En el menú de la izquierda, ve a **Compilación > Authentication**.
    * Haz clic en la pestaña **"Sign-in method"** (Método de inicio de sesión).
    * En la lista de proveedores, busca **"Anónimo"**, haz clic en el lápiz para editarlo, habilítalo y guarda. Esto es necesario para que las reglas de seguridad funcionen.

4.  **Configurar Firestore Database:**
    * En el menú de la izquierda, ve a **Compilación > Firestore Database**.
    * Haz clic en **"Crear base de datos"**.
    * Inicia en **modo de producción** y haz clic en "Siguiente".
    * Elige una ubicación para tus servidores (puedes dejar la opción predeterminada).
    * Haz clic en **"Habilitar"**.

5.  **Añadir Datos Iniciales a Firestore:**
    * Una vez en la base de datos, ve a la pestaña **"Datos"**.
    * Haz clic en **"+ Iniciar colección"**. Nómbrala `items`.
    * Ahora, agrega un documento para cada ítem financiero. Para cada uno, haz clic en **"+ Agregar documento"**, usa un ID automático y añade los siguientes campos:
        * `nombre` (Tipo: string)
        * `tipo` (Tipo: string, debe ser `activo` o `pasivo`)
        * `valor` (Tipo: number)

    * **Crea los siguientes documentos:**
        * **Documento 1:** `nombre`: "Saldos Bancos", `tipo`: "activo", `valor`: 1250000
        * **Documento 2:** `nombre`: "Saldos Caja Efectivo", `tipo`: "activo", `valor`: 85000
        * **Documento 3:** `nombre`: "Cheques a Cobrar", `tipo`: "activo", `valor`: 320000
        * **Documento 4:** `nombre`: "Cheques en Cartera", `tipo`: "activo", `valor`: 150000
        * **Documento 5:** `nombre`: "Clientes a Cobrar", `tipo`: "activo", `valor`: 780000
        * **Documento 6:** `nombre`: "Órdenes a Facturar", `tipo`: "activo", `valor`: 450000
        * **Documento 7:** `nombre`: "Cheques a Pagar", `tipo`: "pasivo", `valor`: 410000
        * **Documento 8:** `nombre`: "Deudas Proveedores", `tipo`: "pasivo", `valor`: 950000

6.  **Configurar Reglas de Seguridad:**
    * Ve a la pestaña **"Reglas"** de Firestore.
    * Reemplaza el contenido con las siguientes reglas. Estas permiten la lectura y escritura solo a usuarios que se hayan autenticado (incluyendo los anónimos que habilitamos antes).
        ```
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /items/{itemId} {
              allow read, write: if request.auth != null;
            }
          }
        }
        ```
    * Haz clic en **"Publicar"**.

### Paso 2: Preparar y Subir el Código a GitHub

1.  **Crear Archivos Locales:**
    * En tu computadora, crea una carpeta para el proyecto (ej. `panel-financiero`).
    * Dentro de esa carpeta, crea tres archivos: `index.html`, `style.css` y `script.js`.
    * Copia y pega el código que te proporcioné para cada uno de estos archivos.

2.  **Crear un Repositorio en GitHub:**
    * Ve a [GitHub](https://github.com/) y crea un nuevo repositorio.
    * Sigue las instrucciones que te da GitHub para "push an existing repository from the command line" y sube tu carpeta con los tres archivos.

### Paso 3: Desplegar en Netlify

1.  **Crear un Nuevo Sitio desde Git:**
    * Regístrate e inicia sesión en [Netlify](https://app.netlify.com/).
    * En tu panel de control, haz clic en **"Add new site" > "Import an existing project"**.
    * Elige **"Deploy with GitHub"** y autoriza el acceso.
    * Selecciona el repositorio de tu panel financiero.

2.  **Configurar el Despliegue y las Variables de Entorno:**
    * Netlify detectará que es un sitio estático, por lo que la configuración básica de compilación es correcta. No necesitas cambiar nada ahí.
    * Antes de hacer el despliegue final, ve a **"Site configuration" > "Environment variables"**.
    * Haz clic en **"Add a variable"** y crea una por una las siguientes variables. Usa los valores que copiaste del objeto `firebaseConfig` en el **Paso 1.2**.
        * `VITE_API_KEY`: `tu-api-key`
        * `VITE_AUTH_DOMAIN`: `tu-auth-domain`
        * `VITE_PROJECT_ID`: `tu-project-id`
        * `VITE_STORAGE_BUCKET`: `tu-storage-bucket`
        * `VITE_MESSAGING_SENDER_ID`: `tu-messaging-sender-id`
        * `VITE_APP_ID`: `tu-app-id`

3.  **Realizar el Despliegue:**
    * Una vez guardadas las variables, ve a la sección **"Deploys"** y haz clic en **"Trigger deploy" > "Deploy site"**.
    * Netlify construirá y desplegará tu sitio. En unos minutos, te dará una URL pública (ej: `https://nombre-aleatorio.netlify.app`) donde tu panel financiero estará funcionando y conectado a tu base de datos de Firebase.

¡Listo! Con estos pasos, tu aplicación estará en línea, será segura y se actualizará en tiempo real.
