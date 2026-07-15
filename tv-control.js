/**
 * Control de TV Samsung (modelos 2016+, Tizen) por red local.
 *
 * Usa directamente el protocolo websocket que el propio TV expone
 * (puerto 8002, wss) en lugar de una libreria de terceros, porque las
 * librerias npm disponibles para esto (samsung-remote, samsung-tv-control)
 * o bien son para modelos viejos (puerto 55000, anteriores a 2016) o tienen
 * bugs conocidos en llamadas sucesivas. Este es el mismo mecanismo que usa
 * Home Assistant para controlar TVs Samsung modernos.
 *
 * Flujo:
 *  1. wakeTv(mac)            -> enciende el TV por Wake-on-LAN
 *  2. openBrowserToUrl(...)  -> abre el navegador del TV en una URL
 *
 * La primera vez que se llama a openBrowserToUrl, el TV mostrara una
 * ventana emergente pidiendo permitir la conexion. Hay que aceptarla
 * UNA vez; despues de eso se guarda un "token" y no se vuelve a pedir.
 */

const WebSocket = require('ws');
const wol = require('wol');

const WS_PORT = 8002;
const APP_NAME = 'TV Signage Controller';
const CONNECT_TIMEOUT_MS = 30000;

function encodeName() {
  return Buffer.from(APP_NAME).toString('base64');
}

/**
 * Enciende el TV enviando un paquete magico Wake-on-LAN a su direccion MAC.
 * Requiere que el TV tenga activada la opcion "Encendido con dispositivo
 * movil" / "Wake on LAN" en Configuracion > General > Administrador de
 * dispositivos externos.
 */
function wakeTv(mac) {
  return new Promise((resolve, reject) => {
    if (!mac || !mac.trim()) {
      return reject(new Error('Falta la direccion MAC del TV'));
    }
    wol.wake(mac.trim(), (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Abre una conexion websocket con el TV, envia (opcionalmente) un comando,
 * y resuelve con el token de autorizacion que el TV entrega.
 */
function connectAndSend(ip, token, payload) {
  return new Promise((resolve, reject) => {
    if (!ip || !ip.trim()) {
      return reject(new Error('Falta la IP del TV'));
    }

    const name = encodeName();
    let wsUrl = `wss://${ip.trim()}:${WS_PORT}/api/v2/channels/samsung.remote.control?name=${name}`;
    if (token) wsUrl += `&token=${encodeURIComponent(token)}`;

    const socket = new WebSocket(wsUrl, { rejectUnauthorized: false });
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.terminate();
      reject(new Error('No se pudo conectar al TV en 30 segundos. Verifica que este encendido, en la misma red, y que aceptaste el permiso en pantalla a tiempo.'));
    }, CONNECT_TIMEOUT_MS);

    function finish(err, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(result);
      setTimeout(() => {
        try { socket.close(); } catch (e) { /* noop */ }
      }, 400);
    }

    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (e) {
        return;
      }

      if (msg.event === 'ms.channel.connect') {
        const newToken = (msg.data && msg.data.token) || token || null;
        if (payload) {
          socket.send(JSON.stringify(payload));
        }
        finish(null, newToken);
      } else if (msg.event === 'ms.channel.unauthorized' || msg.event === 'ms.channel.timeOut') {
        finish(new Error('Conexion rechazada por el TV. Revisa el control remoto: debe aparecer un mensaje en pantalla pidiendo permitir la conexion, acéptalo y vuelve a intentar.'));
      }
    });

    socket.on('error', (err) => {
      finish(new Error(`No se pudo conectar al TV: ${err.message}`));
    });

    socket.on('close', (code) => {
      if (settled) return;
      finish(new Error(
        `El TV cerró la conexión antes de responder (código ${code}). ` +
        'Esto suele pasar cuando el token guardado ya no es valido. ' +
        'Usa "Olvidar emparejamiento" y vuelve a intentar, vigilando la pantalla del TV ' +
        'por si aparece un mensaje pidiendo permitir la conexión.'
      ));
    });
  });
}

/** Solo conecta y devuelve el token (sirve para "emparejar" el TV la primera vez). */
function pair(ip, token) {
  return connectAndSend(ip, token, null);
}

/**
 * Pide al TV la lista de apps instaladas (con sus appId reales). Sirve para
 * diagnosticar cual es el identificador correcto de la app del navegador en
 * un modelo/firmware especifico, ya que no siempre es "org.tizen.browser".
 */
function getInstalledApps(ip, token) {
  return new Promise((resolve, reject) => {
    if (!ip || !ip.trim()) {
      return reject(new Error('Falta la IP del TV'));
    }

    const name = encodeName();
    let wsUrl = `wss://${ip.trim()}:${WS_PORT}/api/v2/channels/samsung.remote.control?name=${name}`;
    if (token) wsUrl += `&token=${encodeURIComponent(token)}`;

    const socket = new WebSocket(wsUrl, { rejectUnauthorized: false });
    let settled = false;
    let connected = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.terminate();
      reject(new Error('Tiempo agotado esperando la lista de apps del TV.'));
    }, CONNECT_TIMEOUT_MS);

    function finish(err, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(result);
      setTimeout(() => {
        try { socket.close(); } catch (e) { /* noop */ }
      }, 400);
    }

    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (e) {
        return;
      }

      if (msg.event === 'ms.channel.connect' && !connected) {
        connected = true;
        socket.send(JSON.stringify({
          method: 'ms.channel.emit',
          params: { event: 'ed.installedApp.get', to: 'host' },
        }));
      } else if (msg.event === 'ed.installedApp.get') {
        const apps = (msg.data && msg.data.data) || [];
        finish(null, apps.map((a) => ({ appId: a.appId, name: a.name })));
      } else if (msg.event === 'ms.channel.unauthorized') {
        finish(new Error('Conexion rechazada por el TV. Acepta el permiso en pantalla y vuelve a intentar.'));
      }
    });

    socket.on('error', (err) => finish(new Error(`No se pudo conectar al TV: ${err.message}`)));
    socket.on('close', (code) => {
      if (!settled) finish(new Error(`El TV cerro la conexion (codigo ${code}) antes de responder con la lista de apps.`));
    });
  });
}

/**
 * Abre una app del TV usando el protocolo DIAL: una simple peticion HTTP
 * POST al puerto 8001, sin necesidad de websocket ni token. Es el metodo
 * mas confiable encontrado para forzar el lanzamiento de una app (lo usan
 * herramientas como samsungctl), independientemente de si la app ya esta
 * en pantalla o no.
 */
async function openAppViaDial(ip, appId = 'org.tizen.browser') {
  if (!ip || !ip.trim()) {
    throw new Error('Falta la IP del TV');
  }
  const url = `http://${ip.trim()}:8001/api/v2/applications/${appId}`;
  let response;
  try {
    response = await fetch(url, { method: 'POST' });
  } catch (err) {
    throw new Error(`No se pudo contactar al TV por HTTP (DIAL): ${err.message}`);
  }
  if (!response.ok && response.status !== 201) {
    throw new Error(`El TV respondio con estado ${response.status} al intentar abrir la app (DIAL).`);
  }
  return true;
}

/**
 * Abre el navegador del TV. Intenta primero el metodo DIAL (mas confiable);
 * si falla, recurre al metodo por websocket (DEEP_LINK) como respaldo.
 *
 * NOTA IMPORTANTE: en muchos modelos con firmware reciente, lanzar el
 * navegador forzando una URL especifica (el parametro "metaTag") ya no
 * funciona de forma confiable (es un problema reportado ampliamente por la
 * comunidad, no un bug de este codigo). Lo que SI funciona de forma
 * confiable es abrir la app del navegador sin URL, y dejar que cargue su
 * "pagina de inicio". Por eso hay que configurar UNA VEZ, manualmente con
 * el control remoto, la pagina de inicio del navegador para que sea la URL
 * de esta pantalla (ver README, seccion "Configurar la pagina de inicio").
 */
async function openBrowserToUrl(ip, token) {
  try {
    await openAppViaDial(ip, 'org.tizen.browser');
    return { method: 'dial', token };
  } catch (dialErr) {
    // Respaldo: intentamos por websocket
    const payload = {
      method: 'ms.channel.emit',
      params: {
        event: 'ed.apps.launch',
        to: 'host',
        data: {
          appId: 'org.tizen.browser',
          action_type: 'DEEP_LINK',
        },
      },
    };
    try {
      const newToken = await connectAndSend(ip, token, payload);
      return { method: 'websocket', token: newToken };
    } catch (wsErr) {
      throw new Error(`DIAL: ${dialErr.message} | Websocket: ${wsErr.message}`);
    }
  }
}

/** Envia una tecla de control remoto (ej: KEY_HOME, KEY_POWER, KEY_ENTER). */
function sendKey(ip, token, key) {
  const payload = {
    method: 'ms.remote.control',
    params: {
      Cmd: 'Click',
      DataOfCmd: key,
      Option: 'false',
      TypeOfRemote: 'SendRemoteKey',
    },
  };
  return connectAndSend(ip, token, payload);
}

module.exports = { wakeTv, pair, openBrowserToUrl, sendKey, getInstalledApps };
