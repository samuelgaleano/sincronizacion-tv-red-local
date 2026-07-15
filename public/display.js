(function () {
  const stage = document.getElementById('stage');
  const emptyEl = document.getElementById('empty');
  const clockEl = document.getElementById('clock');

  const match = window.location.pathname.match(/\/display\/(\w+)/);
  const screenId = match ? match[1] : '1';

  let images = [];
  let intervalSeconds = 8;
  let currentIndex = -1;
  let timer = null;
  let slideEls = [];
  let activeSlot = 0;

  function updateClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
  }
  updateClock();
  setInterval(updateClock, 15000);

  function ensureSlideEls() {
    if (slideEls.length) return;
    for (let i = 0; i < 2; i++) {
      const div = document.createElement('div');
      div.className = 'slide';
      stage.appendChild(div);
      slideEls.push(div);
    }
  }

  function preload(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  async function showNext() {
    if (images.length === 0) {
      emptyEl.style.display = 'flex';
      return;
    }
    emptyEl.style.display = 'none';
    ensureSlideEls();

    currentIndex = (currentIndex + 1) % images.length;
    const url = images[currentIndex].url;
    await preload(url);

    const nextSlot = 1 - activeSlot;
    const incoming = slideEls[nextSlot];
    const outgoing = slideEls[activeSlot];

    incoming.style.backgroundImage = `url("${url}")`;
    incoming.classList.add('active');
    outgoing.classList.remove('active');

    activeSlot = nextSlot;
  }

  function restartTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(showNext, Math.max(2, intervalSeconds) * 1000);
  }

  function applyState(state) {
    const previousFirstUrl = images[0] ? images[0].url : null;
    images = state.images || [];
    intervalSeconds = state.interval || 8;
    document.title = state.name || 'Senalizacion';

    if (images.length === 0) {
      emptyEl.style.display = 'flex';
      if (timer) clearInterval(timer);
      return;
    }

    const newFirstUrl = images[0].url;
    const shouldRestartFromZero = previousFirstUrl !== newFirstUrl && currentIndex === -1;

    if (currentIndex === -1 || shouldRestartFromZero) {
      currentIndex = -1;
      showNext();
    } else if (currentIndex >= images.length) {
      currentIndex = -1;
      showNext();
    }
    restartTimer();
  }

  // ---------- Conexion en tiempo real ----------
  const socket = io();

  socket.on('connect', () => {
    socket.emit('display:join', screenId);
  });

  socket.on('screen:update', (state) => {
    applyState(state);
  });

  socket.on('disconnect', () => {
    // El navegador del TV reintentara la conexion automaticamente
  });

  // Permite forzar pantalla completa con un clic/control remoto
  document.addEventListener('click', () => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
  });
})();
