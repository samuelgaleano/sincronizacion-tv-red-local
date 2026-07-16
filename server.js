const express = require('express');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const os = require('os');
const tvControl = require('./tv-control');

const PORT = process.env.PORT || 3000;
const SCREEN_IDS = ['1', '2', '3'];
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const CONFIG_PATH = path.join(__dirname, 'config', 'screens.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ---------- Config persistente (nombre, intervalo y orden de imagenes por pantalla) ----------
function defaultConfig() {
  const cfg = {};
  SCREEN_IDS.forEach((id, i) => {
    cfg[id] = {
      name: `Pantalla ${i + 1}`,
      interval: 8,
      order: [],
      tv: { ip: '', mac: '', token: null },
    };
  });
  return cfg;
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const fallback = defaultConfig();
    // asegurar que existan todas las pantallas y todos los campos esperados
    SCREEN_IDS.forEach((id) => {
      if (!parsed[id]) {
        parsed[id] = fallback[id];
      } else if (!parsed[id].tv) {
        parsed[id].tv = fallback[id].tv;
      }
    });
    return parsed;
  } catch (e) {
    return defaultConfig();
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

let config = loadConfig();

// ---------- Utilidades ----------
function screenDir(id) {
  return path.join(UPLOADS_DIR, `screen${id}`);
}

function isValidScreen(id) {
  return SCREEN_IDS.includes(id);
}

function syncOrderWithDisk(id) {
  const dir = screenDir(id);
  const filesOnDisk = fs.readdirSync(dir).filter((f) => !f.startsWith('.'));
  let order = config[id].order.filter((f) => filesOnDisk.includes(f));
  filesOnDisk.forEach((f) => {
    if (!order.includes(f)) order.push(f);
  });
  config[id].order = order;
  return order;
}

function getServerLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

function getScreenState(id) {
  const order = syncOrderWithDisk(id);
  const tv = config[id].tv || { ip: '', mac: '', token: null };
  return {
    id,
    name: config[id].name,
    interval: config[id].interval,
    images: order.map((filename) => ({
      filename,
      url: `/images/screen${id}/${filename}`,
    })),
    tv: {
      ip: tv.ip || '',
      mac: tv.mac || '',
      paired: !!tv.token,
    },
  };
}

function broadcastScreenUpdate(id) {
  const state = getScreenState(id);
  io.to(`screen-${id}`).emit('screen:update', state);
  io.to('admin').emit('screen:update', state);
}

// ---------- Middlewares ----------
app.use(express.json());
// Health check para el proveedor de hosting (Render): responde 200 sin tocar estado.
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));
app.use('/images', express.static(UPLOADS_DIR));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const id = req.params.id;
    cb(null, screenDir(id));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 60);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${safeBase}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB por imagen
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imagenes (jpg, png, gif, webp)'));
    }
  },
});

function checkScreenParam(req, res, next) {
  if (!isValidScreen(req.params.id)) {
    return res.status(404).json({ error: 'Pantalla no encontrada' });
  }
  next();
}

// Pagina que se abre en el navegador del TV
app.get('/display/:id', (req, res) => {
  if (!isValidScreen(req.params.id)) {
    return res.status(404).send('Pantalla no encontrada. Usa /display/1, /display/2 o /display/3');
  }
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

// ---------- Control del TV (encender por red, abrir navegador) ----------

// Guardar IP y MAC del TV de esta pantalla
app.post('/api/screens/:id/tv/settings', checkScreenParam, (req, res) => {
  const { id } = req.params;
  const { ip, mac } = req.body;
  config[id].tv = config[id].tv || { ip: '', mac: '', token: null };
  if (typeof ip === 'string') config[id].tv.ip = ip.trim();
  if (typeof mac === 'string') config[id].tv.mac = mac.trim();
  saveConfig(config);
  res.json(getScreenState(id));
});

// Encender el TV por Wake-on-LAN
app.post('/api/screens/:id/tv/wake', checkScreenParam, async (req, res) => {
  const { id } = req.params;
  try {
    await tvControl.wakeTv(config[id].tv.mac);
    res.json({ ok: true, message: 'Senal de encendido enviada' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Abrir el navegador del TV (la URL debe quedar configurada como pagina de inicio en el TV, ver README)
app.post('/api/screens/:id/tv/open-browser', checkScreenParam, async (req, res) => {
  const { id } = req.params;
  const tv = config[id].tv || {};
  const lanIp = getServerLanIp();
  const targetUrl = lanIp ? `http://${lanIp}:${PORT}/display/${id}` : null;
  try {
    const result = await tvControl.openBrowserToUrl(tv.ip, tv.token);
    if (result.token) {
      config[id].tv.token = result.token;
      saveConfig(config);
    }
    res.json({
      ok: true,
      url: targetUrl,
      via: result.method,
      message: 'Navegador abierto. Si la pagina de inicio del TV no esta configurada con esta URL, configurala una vez en el navegador del TV.',
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, url: targetUrl });
  }
});

// Apagar el TV (envia la tecla de encendido/apagado)
app.post('/api/screens/:id/tv/power-off', checkScreenParam, async (req, res) => {
  const { id } = req.params;
  const tv = config[id].tv || {};
  try {
    const newToken = await tvControl.sendKey(tv.ip, tv.token, 'KEY_POWER');
    config[id].tv.token = newToken;
    saveConfig(config);
    res.json({ ok: true, message: 'Senal de apagado enviada' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Olvidar el emparejamiento (borra el token guardado para forzar uno nuevo)
app.post('/api/screens/:id/tv/forget', checkScreenParam, (req, res) => {
  const { id } = req.params;
  config[id].tv = config[id].tv || { ip: '', mac: '', token: null };
  config[id].tv.token = null;
  saveConfig(config);
  res.json(getScreenState(id));
});

// Diagnostico: listar apps instaladas en el TV (para encontrar el appId real del navegador)
app.post('/api/screens/:id/tv/list-apps', checkScreenParam, async (req, res) => {
  const { id } = req.params;
  const tv = config[id].tv || {};
  try {
    const apps = await tvControl.getInstalledApps(tv.ip, tv.token);
    res.json({ ok: true, apps });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ---------- API ----------

// Listado de todas las pantallas
app.get('/api/screens', (req, res) => {
  const all = {};
  SCREEN_IDS.forEach((id) => {
    all[id] = getScreenState(id);
  });
  res.json(all);
});

// Estado de una pantalla
app.get('/api/screens/:id', checkScreenParam, (req, res) => {
  res.json(getScreenState(req.params.id));
});

// Subir una o varias imagenes
app.post(
  '/api/screens/:id/images',
  checkScreenParam,
  upload.array('images', 30),
  (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se recibieron archivos' });
    }
    const id = req.params.id;
    req.files.forEach((f) => config[id].order.push(f.filename));
    saveConfig(config);
    broadcastScreenUpdate(id);
    res.json(getScreenState(id));
  }
);

// Borrar una imagen
app.delete('/api/screens/:id/images/:filename', checkScreenParam, (req, res) => {
  const { id, filename } = req.params;
  const safeFilename = path.basename(filename);
  const filePath = path.join(screenDir(id), safeFilename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  config[id].order = config[id].order.filter((f) => f !== safeFilename);
  saveConfig(config);
  broadcastScreenUpdate(id);
  res.json(getScreenState(id));
});

// Reordenar imagenes
app.post('/api/screens/:id/reorder', checkScreenParam, (req, res) => {
  const { id } = req.params;
  const { order } = req.body;
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'order debe ser un arreglo' });
  }
  const current = syncOrderWithDisk(id);
  const validOrder = order.filter((f) => current.includes(f));
  current.forEach((f) => {
    if (!validOrder.includes(f)) validOrder.push(f);
  });
  config[id].order = validOrder;
  saveConfig(config);
  broadcastScreenUpdate(id);
  res.json(getScreenState(id));
});

// Configuracion (nombre, intervalo en segundos)
app.post('/api/screens/:id/settings', checkScreenParam, (req, res) => {
  const { id } = req.params;
  const { name, interval } = req.body;
  if (typeof name === 'string' && name.trim()) {
    config[id].name = name.trim().slice(0, 40);
  }
  if (typeof interval === 'number' && interval >= 2 && interval <= 300) {
    config[id].interval = interval;
  }
  saveConfig(config);
  broadcastScreenUpdate(id);
  res.json(getScreenState(id));
});

// ---------- Estado de conexion de cada pantalla (online/offline) ----------
const connectedDisplays = {}; // id -> count de sockets conectados

function broadcastStatus() {
  const status = {};
  SCREEN_IDS.forEach((id) => {
    status[id] = (connectedDisplays[id] || 0) > 0;
  });
  io.to('admin').emit('status:update', status);
}

io.on('connection', (socket) => {
  socket.on('display:join', (id) => {
    if (!isValidScreen(id)) return;
    socket.data.screenId = id;
    socket.join(`screen-${id}`);
    connectedDisplays[id] = (connectedDisplays[id] || 0) + 1;
    broadcastStatus();
    socket.emit('screen:update', getScreenState(id));
  });

  socket.on('admin:join', () => {
    socket.join('admin');
    broadcastStatus();
  });

  socket.on('disconnect', () => {
    const id = socket.data.screenId;
    if (id && connectedDisplays[id]) {
      connectedDisplays[id] -= 1;
      broadcastStatus();
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getServerLanIp();
  console.log(`Servidor de senalizacion corriendo en http://0.0.0.0:${PORT}`);
  if (lanIp) {
    console.log(`IP detectada en la red local: ${lanIp}`);
    console.log(`Panel de administracion: http://${lanIp}:${PORT}/admin`);
    SCREEN_IDS.forEach((id) => {
      console.log(`Pantalla ${id}: http://${lanIp}:${PORT}/display/${id}`);
    });
  } else {
    console.log('No se pudo detectar automaticamente la IP de red local.');
    console.log(`Panel de administracion: http://<IP-DE-TU-PC>:${PORT}/admin`);
  }
});
