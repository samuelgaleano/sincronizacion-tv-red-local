# Sistema de Señalización Digital para TV Samsung (vía red local)

Convierte tu PC en un servidor de "carteleras digitales" que envía imágenes a 3 TV
Samsung conectados a tu mismo WiFi, usando el navegador que ya viene integrado en
el Smart TV. No necesitas instalar nada en los TVs.

## 🚀 Desplegar la demo en línea (Render)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/samuelgaleano/sincronizacion-tv-red-local)

Servicio **Node + Express + Socket.io** dockerizado (ver `render.yaml` y `Dockerfile`), con health check en `/healthz`. Plan free de Render. El panel de administración queda en `…/admin/`.

## 1. Requisitos

- Node.js 18 o superior instalado en el PC (https://nodejs.org)
- El PC y los 3 TV Samsung conectados a la **misma red WiFi/LAN**
- Los TV deben tener la app "Internet" (navegador) — viene de fábrica en todos los Smart TV Samsung (Tizen)

## 2. Instalación

Abre una terminal dentro de esta carpeta y ejecuta:

```bash
npm install
npm start
```

Verás algo así en la consola:

```
Servidor de señalización corriendo en http://0.0.0.0:3000
Panel de administración: http://<IP-DE-TU-PC>:3000/admin
Pantalla 1: http://<IP-DE-TU-PC>:3000/display/1
```

## 3. Averigua la IP de tu PC en la red local

- **Windows**: abre `cmd` y escribe `ipconfig` → busca "Dirección IPv4" (ej: 192.168.1.50)
- **Mac**: Preferencias del Sistema → Red, o `ifconfig | grep inet` en terminal
- **Linux**: `ip addr` o `hostname -I`

> 💡 Recomendado: en la configuración de tu router, asigna una **IP fija (reservada)**
> a tu PC para que esta dirección nunca cambie. Si no lo haces, cada vez que el router
> le asigne otra IP al PC, tendrás que volver a escribir la dirección en los 3 TV.

## 4. Conectar los 3 TV Samsung

En cada televisor:

1. Enciéndelo y conéctalo al WiFi (si no lo está ya)
2. Abre la app **Internet** (el navegador del TV)
3. En la barra de direcciones escribe:
   - TV 1: `http://192.168.1.50:3000/display/1`
   - TV 2: `http://192.168.1.50:3000/display/2`
   - TV 3: `http://192.168.1.50:3000/display/3`
   
   (reemplaza `192.168.1.50` por la IP real de tu PC)
4. Pon el navegador en **pantalla completa** (normalmente hay un botón o ícono de
   expandir en el navegador del TV)
5. **Importante**: en el menú del TV, desactiva el "Protector de pantalla" / "Eco" /
   "Apagado automático" para que la imagen no se oscurezca sola tras un rato de inactividad.
   En TV Samsung suele estar en: `Configuración → General → Energía y energía` o similar
   según el modelo.

Una vez hecho esto, **no vuelvas a tocar el control del TV**. Todo lo controlas desde el PC.

## 5. Subir y controlar las imágenes desde el PC

Abre en tu navegador (del PC, celular o tablet en la misma red):

```
http://192.168.1.50:3000/admin
```

Desde ahí puedes, para cada una de las 3 pantallas, de forma independiente:

- **Arrastrar o subir** imágenes (jpg, png, webp, gif)
- **Reordenar** arrastrando las miniaturas
- **Eliminar** imágenes
- **Cambiar el nombre** de la pantalla (clic sobre el nombre)
- **Cambiar el tiempo** que cada imagen permanece en pantalla (ícono ⚙️ → segundos por imagen)
- Ver en tiempo real si cada TV está **en línea** (punto verde) o desconectado

Los cambios se reflejan en el TV correspondiente **en segundos, sin tocar el televisor**.

## 6. Encender el TV y abrir el navegador automáticamente desde el panel

Ya viene integrado: en cada tarjeta de pantalla del panel de administración hay
una sección **"Control del TV"** con:

- Campos para guardar la **IP** y la **MAC** de ese TV
- Botón **"Encender TV"** (Wake-on-LAN)
- Botón **"Abrir navegador"** (abre la app del navegador del TV)
- Botón **"Apagar TV"**

### ⚠️ Importante: configurar la página de inicio del navegador (una sola vez por TV)

En firmwares Samsung recientes, forzar una URL específica al abrir el navegador
por control remoto ya no funciona de forma confiable (es una limitación reportada
ampliamente por la comunidad, no de este sistema). La solución que sí funciona de
forma consistente: configurar la **página de inicio** del navegador del TV para
que sea la URL de esa pantalla. Así, el botón "Abrir navegador" simplemente abre
la app, y la app carga automáticamente la página correcta porque es su inicio.

Para configurarlo, **una sola vez por TV**, con el control remoto:

1. Abre la app **Internet** en el TV
2. Entra a la URL de esa pantalla manualmente (ej: `http://192.168.1.50:3000/display/1`)
3. Busca el menú de configuración del navegador (ícono ⚙️ o de tres puntos, según el modelo)
4. Busca la opción **"Establecer como página de inicio"** / "Set as homepage" / "Página de inicio"
5. Repite esto en cada uno de los 3 TV, cada uno con su propia URL (`/display/1`, `/display/2`, `/display/3`)

Después de esto, el botón "Abrir navegador" del panel funcionará de forma confiable:
abre la app y esta carga sola la pantalla correcta.

### Requisitos en cada TV (una sola vez)

1. **Activa Wake-on-LAN**: en el TV, ve a `Configuración → General → Administrador
   de dispositivos externos → Encendido con dispositivo móvil` y actívalo. Sin esto,
   el botón "Encender TV" no funcionará si el TV está completamente apagado.
2. **Anota la MAC del TV**: `Configuración → General → Acerca de este TV` (o
   `Soporte → Información del producto`), busca la dirección MAC de **Wi-Fi**.
3. **Asígnale una IP fija al TV** también en el router (igual que hiciste con el PC),
   para que no cambie.
4. **Primer emparejamiento**: la primera vez que uses cualquier botón de control, el
   TV mostrará en pantalla un mensaje pidiendo permitir la conexión — tienes **30
   segundos** para aceptarlo con el control remoto. Después de eso, el panel guarda
   un token y no se vuelve a pedir (a menos que reinicies el TV a configuración de
   fábrica).
5. Si el TV vuelve a pedir permiso todo el tiempo, revisa
   `Configuración → General → Administrador de dispositivos externos → Administrador
   de conexión de dispositivos` y pon el modo de notificación en "Primera vez" en
   lugar de "Siempre preguntar".

### Flujo recomendado para encender todo en la mañana

1. Clic en **"Encender TV"** en cada una de las 3 tarjetas
2. Espera unos 15-20 segundos a que el TV termine de arrancar
3. Clic en **"Abrir navegador"** en cada tarjeta — el TV abrirá su página de inicio
   (que ya configuraste con la URL correcta en el paso anterior)

> Nota técnica: esto se construyó hablando directamente con el protocolo websocket
> que el propio TV expone (el mismo que usa Home Assistant para esto), en vez de
> usar la librería `samsung-remote` de npm — esa librería es para TVs **anteriores
> a 2016** (protocolo viejo, puerto 55000) y no funciona en modelos actuales.

## 7. Dejar el servidor corriendo siempre

Para que el sistema funcione todo el tiempo (no solo mientras tengas la terminal abierta):

- **Windows**: usa [PM2](https://pm2.keymetrics.io/) o configura el script como tarea
  programada / servicio. Forma rápida con PM2:
  ```bash
  npm install -g pm2
  pm2 start server.js --name senalizacion
  pm2 save
  pm2 startup
  ```
- **Mac/Linux**: igual con PM2, o un servicio `systemd`.

## Estructura del proyecto

```
tv-signage/
├── server.js              Servidor Express + Socket.io
├── tv-control.js          Control de TV: encender (WOL) y abrir navegador
├── package.json
├── config/screens.json    Nombre, intervalo, orden de imágenes e IP/MAC/token por pantalla
├── uploads/
│   ├── screen1/           Imágenes de la pantalla 1
│   ├── screen2/           Imágenes de la pantalla 2
│   └── screen3/           Imágenes de la pantalla 3
└── public/
    ├── display.html/js    Página que se abre en el navegador del TV
    └── admin/              Panel de control (index.html, app.js, style.css)
```

## Solución de problemas

- **El TV no carga la página**: verifica que el PC y el TV estén en la misma red, que
  el firewall del PC permita conexiones al puerto 3000, y que la IP escrita sea correcta.
- **Las imágenes no cambian en el TV pero sí en el admin**: revisa el punto verde de
  "en línea" en el panel — si está apagado, el navegador del TV perdió la conexión;
  vuelve a abrir la URL en el TV.
- **El TV se pone en negro o muestra el protector de pantalla**: desactiva el ahorro
  de energía / protector de pantalla en la configuración del TV.
