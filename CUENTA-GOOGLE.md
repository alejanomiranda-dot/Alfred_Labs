# Entrar con Google y «Mis diseños» en Google Drive

Con la cuenta abierta, Alfred copia cada diseño en el Google Drive de esa persona, en la carpeta oculta de la app. Solo Alfred ve esa carpeta: no aparece entre los archivos de Drive y Alfred no puede leer nada más del Drive. No hay servidor ni base de datos propios, así que no tiene costo.

Se configura una sola vez. Lo único que necesita Alfred es el **ID de cliente**; el «secreto» de Google no se usa.

## 1. Crear el acceso en Google Cloud

1. Entrá a [console.cloud.google.com](https://console.cloud.google.com) con tu cuenta de Google y creá un proyecto llamado **Alfred Labs**.
2. **APIs y servicios → Biblioteca**: buscá **Google Drive API** y tocá **Habilitar**.
3. **Google Auth Platform → Descripción general → Comenzar**:
   - Nombre de la app: **Alfred Labs**. Correo de asistencia: el tuyo.
   - Público: **Externo**.
   - Datos de contacto: tu correo. Aceptá la política y creá.
4. **Acceso a los datos → Agregar o quitar permisos**. Marcá estos cuatro y guardá:
   - `.../auth/drive.appdata` (ver, crear y borrar sus propios datos de configuración en tu Google Drive)
   - `openid`, `.../auth/userinfo.email` y `.../auth/userinfo.profile`
5. **Público → Publicar app**. Estos permisos son «no sensibles», así que Google no pide revisión. Si preferís dejarla en prueba, agregá en «Usuarios de prueba» cada correo que vaya a entrar.
6. **Clientes → Crear cliente**:
   - Tipo: **Aplicación web**. Nombre: **Alfred web**.
   - **Orígenes autorizados de JavaScript**: `https://alfredlabs.vercel.app` y `http://127.0.0.1:5173`
   - No hace falta poner URI de redireccionamiento.
7. Copiá el **ID de cliente**. Termina en `.apps.googleusercontent.com`.

## 2. Activarlo en Alfred

- **En Vercel**: variable `VITE_GOOGLE_CLIENT_ID` con ese valor, en Production y Preview, y volver a publicar. El ID de cliente es público: se puede compartir sin riesgo.
- **En esta computadora**: la misma línea en `.env.local` (`VITE_GOOGLE_CLIENT_ID=...`) y reiniciar el taller.

Sin esa variable, el botón «Entrar» no aparece y Alfred guarda solo en el navegador, como antes.

## Cómo se comporta

- La primera vez que entrás, los diseños que ya tenías en ese navegador se suben a tu Drive.
- En otra computadora, al entrar, «Mis diseños» muestra los mismos diseños con su miniatura. Cada uno se descarga completo al abrirlo.
- Lo que guardás o borrás en una computadora se refleja en las otras.
- El permiso de Google dura una hora. Al abrir «Mis diseños» se renueva solo; a veces aparece por un instante la ventana de Google. Mientras tanto, lo que guardás queda en el navegador y sube en la próxima sincronización.
- Cerrar la sesión (tocando tu nombre arriba) saca los diseños de ese navegador; siguen en tu Drive.
- Google solo acepta los orígenes escritos en el paso 6: las vistas previas de Vercel con otra dirección no pueden entrar con Google.
- Para quitarle el permiso a Alfred: [myaccount.google.com/connections](https://myaccount.google.com/connections). Los datos de la carpeta oculta se borran desde Drive → Configuración → Administrar apps → Alfred Labs → Borrar datos ocultos de la app.
