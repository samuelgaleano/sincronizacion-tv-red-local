(function () {
  const SCREEN_IDS = ['1', '2', '3'];
  const grid = document.getElementById('screensGrid');
  const cardTemplate = document.getElementById('screenCardTemplate');
  const thumbTemplate = document.getElementById('thumbTemplate');
  const toastEl = document.getElementById('toast');
  const countOnlineEl = document.getElementById('countOnline');

  const cards = {}; // id -> { el, currentImageFilename }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function buildDisplayUrl(id) {
    return `${window.location.origin}/display/${id}`;
  }

  function createCard(id) {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.screenId = id;
    node.querySelector('.screen-num').textContent = id;
    node.querySelector('.display-url').textContent = buildDisplayUrl(id);

    grid.appendChild(node);
    cards[id] = { el: node, currentImageFilename: null };
    wireCardEvents(id, node);
    return node;
  }

  function wireCardEvents(id, node) {
    const settingsBtn = node.querySelector('.settings-btn');
    const settingsPanel = node.querySelector('.settings-panel');
    const saveBtn = node.querySelector('.save-settings-btn');
    const nameInput = node.querySelector('.screen-name-input');
    const intervalInput = node.querySelector('.interval-input');
    const dropzone = node.querySelector('.dropzone');
    const fileInput = node.querySelector('.file-input');
    const imageGrid = node.querySelector('.image-grid');

    settingsBtn.addEventListener('click', () => {
      settingsPanel.classList.toggle('hidden');
    });

    saveBtn.addEventListener('click', async () => {
      await fetch(`/api/screens/${id}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameInput.value,
          interval: parseInt(intervalInput.value, 10),
        }),
      });
      settingsPanel.classList.add('hidden');
      showToast(`Pantalla ${id} actualizada`);
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveBtn.click();
    });

    dropzone.addEventListener('click', () => fileInput.click());

    // ---------- Control del TV ----------
    const tvIpInput = node.querySelector('.tv-ip-input');
    const tvMacInput = node.querySelector('.tv-mac-input');
    const tvSaveBtn = node.querySelector('.tv-save-btn');
    const tvWakeBtn = node.querySelector('.tv-wake-btn');
    const tvOpenBtn = node.querySelector('.tv-open-btn');
    const tvPowerOffBtn = node.querySelector('.tv-power-off-btn');
    const tvForgetBtn = node.querySelector('.tv-forget-btn');
    const tvListAppsBtn = node.querySelector('.tv-list-apps-btn');
    const tvAppsResult = node.querySelector('.tv-apps-result');
    const tvStatusText = node.querySelector('.tv-status-text');

    function setTvStatus(message, kind) {
      tvStatusText.textContent = message;
      tvStatusText.classList.remove('error', 'success');
      if (kind) tvStatusText.classList.add(kind);
    }

    tvSaveBtn.addEventListener('click', async () => {
      await fetch(`/api/screens/${id}/tv/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: tvIpInput.value, mac: tvMacInput.value }),
      });
      setTvStatus('IP y MAC guardadas', 'success');
    });

    tvWakeBtn.addEventListener('click', async () => {
      setTvStatus('Enviando senal de encendido...');
      try {
        const res = await fetch(`/api/screens/${id}/tv/wake`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Error desconocido');
        setTvStatus('Encendido enviado. Espera ~15s y luego usa "Abrir navegador".', 'success');
      } catch (e) {
        setTvStatus(e.message, 'error');
      }
    });

    tvOpenBtn.addEventListener('click', async () => {
      setTvStatus('Abriendo el navegador...');
      try {
        const res = await fetch(`/api/screens/${id}/tv/open-browser`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Error desconocido');
        setTvStatus(`Comando enviado: ${data.url}`, 'success');
      } catch (e) {
        setTvStatus(`${e.message} (revisa el TV: puede pedirte aceptar la conexion la primera vez)`, 'error');
      }
    });

    tvPowerOffBtn.addEventListener('click', async () => {
      setTvStatus('Conectando... si el TV pide permiso, acéptalo con el control (tienes 30s).');
      try {
        const res = await fetch(`/api/screens/${id}/tv/power-off`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Error desconocido');
        setTvStatus('Senal de apagado enviada', 'success');
      } catch (e) {
        setTvStatus(e.message, 'error');
      }
    });

    tvForgetBtn.addEventListener('click', async () => {
      setTvStatus('Olvidando emparejamiento...');
      try {
        await fetch(`/api/screens/${id}/tv/forget`, { method: 'POST' });
        setTvStatus('Emparejamiento olvidado. Intenta "Abrir navegador" de nuevo y vigila el TV.', 'success');
      } catch (e) {
        setTvStatus(e.message, 'error');
      }
    });

    tvListAppsBtn.addEventListener('click', async () => {
      setTvStatus('Pidiendo lista de apps al TV... si pide permiso, acéptalo (30s).');
      tvAppsResult.classList.add('hidden');
      try {
        const res = await fetch(`/api/screens/${id}/tv/list-apps`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Error desconocido');
        const lines = data.apps
          .map((a) => `${a.appId}  ->  ${a.name}`)
          .sort()
          .join('\n');
        tvAppsResult.textContent = lines || '(el TV no devolvio apps)';
        tvAppsResult.classList.remove('hidden');
        setTvStatus(`Se encontraron ${data.apps.length} apps. Busca la del navegador en la lista de abajo.`, 'success');
      } catch (e) {
        setTvStatus(e.message, 'error');
      }
    });

    fileInput.addEventListener('change', () => {
      uploadFiles(id, fileInput.files);
      fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      })
    );
    ['dragleave', 'drop'].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      })
    );
    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length) uploadFiles(id, files);
    });

    // Reordenar arrastrando dentro del grid de miniaturas
    imageGrid.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = imageGrid.querySelector('.thumb.dragging');
      if (!dragging) return;
      const target = closestThumb(imageGrid, e.clientX, e.clientY);
      if (target && target !== dragging) {
        const rect = target.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        imageGrid.insertBefore(dragging, before ? target : target.nextSibling);
      }
    });
    imageGrid.addEventListener('drop', () => persistOrder(id, imageGrid));
  }

  function closestThumb(container, x, y) {
    const thumbs = [...container.querySelectorAll('.thumb:not(.dragging)')];
    let closest = null;
    let minDist = Infinity;
    thumbs.forEach((t) => {
      const rect = t.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < minDist) {
        minDist = dist;
        closest = t;
      }
    });
    return closest;
  }

  async function persistOrder(id, imageGrid) {
    const order = [...imageGrid.querySelectorAll('.thumb')].map((t) => t.dataset.filename);
    await fetch(`/api/screens/${id}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
  }

  async function uploadFiles(id, fileList) {
    const formData = new FormData();
    [...fileList].forEach((f) => formData.append('images', f));
    showToast(`Subiendo ${fileList.length} imagen(es) a pantalla ${id}...`);
    try {
      const res = await fetch(`/api/screens/${id}/images`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('fallo la subida');
      showToast(`Imagenes agregadas a pantalla ${id}`);
    } catch (e) {
      showToast('Error al subir imagenes');
    }
  }

  async function deleteImage(id, filename) {
    await fetch(`/api/screens/${id}/images/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
  }

  function renderScreen(state) {
    const { id } = state;
    if (!cards[id]) createCard(id);
    const node = cards[id].el;

    const nameInput = node.querySelector('.screen-name-input');
    const intervalInput = node.querySelector('.interval-input');
    const imageGrid = node.querySelector('.image-grid');
    const emptyHint = node.querySelector('.empty-hint');

    if (document.activeElement !== nameInput) nameInput.value = state.name;
    if (document.activeElement !== intervalInput) intervalInput.value = state.interval;

    const tvIpInput = node.querySelector('.tv-ip-input');
    const tvMacInput = node.querySelector('.tv-mac-input');
    const tvPairedPill = node.querySelector('.tv-paired-pill');
    if (state.tv) {
      if (document.activeElement !== tvIpInput) tvIpInput.value = state.tv.ip || '';
      if (document.activeElement !== tvMacInput) tvMacInput.value = state.tv.mac || '';
      tvPairedPill.classList.toggle('hidden', !state.tv.paired);
    }

    imageGrid.innerHTML = '';
    if (!state.images.length) {
      emptyHint.classList.remove('hidden');
    } else {
      emptyHint.classList.add('hidden');
      state.images.forEach((img) => {
        const thumb = thumbTemplate.content.firstElementChild.cloneNode(true);
        thumb.dataset.filename = img.filename;
        thumb.querySelector('.thumb-img').src = img.url;

        thumb.addEventListener('dragstart', () => thumb.classList.add('dragging'));
        thumb.addEventListener('dragend', () => thumb.classList.remove('dragging'));

        thumb.querySelector('.thumb-delete').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteImage(id, img.filename);
        });

        imageGrid.appendChild(thumb);
      });
    }
  }

  function renderStatus(status) {
    let online = 0;
    SCREEN_IDS.forEach((id) => {
      const isOnline = !!status[id];
      if (isOnline) online += 1;
      const card = cards[id];
      if (!card) return;
      const pill = card.el.querySelector('.status-pill');
      const dot = pill.querySelector('.dot');
      const text = pill.querySelector('.status-text');
      pill.classList.toggle('online', isOnline);
      pill.classList.toggle('offline', !isOnline);
      dot.classList.toggle('dot-pulse', isOnline);
      text.textContent = isOnline ? 'en linea' : 'sin conexion';
    });
    countOnlineEl.textContent = online;
  }

  async function init() {
    SCREEN_IDS.forEach(createCard);
    const res = await fetch('/api/screens');
    const all = await res.json();
    SCREEN_IDS.forEach((id) => renderScreen(all[id]));

    const socket = io();
    socket.on('connect', () => socket.emit('admin:join'));
    socket.on('screen:update', renderScreen);
    socket.on('status:update', renderStatus);
  }

  init();
})();
