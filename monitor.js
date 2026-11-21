(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nowTime = () => new Date().toLocaleTimeString('es-VE', { hour12: false });
  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const locations = ['Centro de Datos', 'Caracas Norte', 'Puerto Principal', 'Subestación Este', 'Perímetro Norte', 'Centro Histórico', 'Enlace Andino', 'Bóveda Central', 'Helipuerto', 'Sede Central'];
  const nodes = locations.map((location, i) => ({ id: `NOD-${String(i + 1).padStart(2, '0')}`, location, status: i === 3 ? 'warn' : 'online', latency: 8 + (i * 7) % 19, cpu: 24 + (i * 13) % 56 }));
  const alerts = [
    { id: 1, severity: 'critical', title: 'Intento de acceso no autorizado', detail: 'Múltiples credenciales fallidas · NOD-04', time: nowTime(), acknowledged: false, resolved: false },
    { id: 2, severity: 'warning', title: 'Latencia elevada en enlace troncal', detail: 'Pico de 84 ms · NOD-07', time: nowTime(), acknowledged: false, resolved: false },
    { id: 3, severity: 'info', title: 'Rotación de claves completada', detail: 'Cifrado TLS 1.3 · NOD-02', time: nowTime(), acknowledged: true, resolved: true }
  ];
  const feeds = [
    ['CAM-01', 'Acceso Principal', 'OPTICAL'], ['CAM-02', 'Sala de Servidores', 'THERMAL'], ['LIDAR-03', 'Perímetro Norte', 'LIDAR'],
    ['TERM-04', 'Subestación', 'THERMAL'], ['CAM-05', 'Bóveda Central', 'OPTICAL'], ['SENS-06', 'Helipuerto', 'LIDAR']
  ].map((x, i) => ({ id: x[0], name: x[1], mode: x[2], alert: i === 3 }));
  let currentNodeFilter = 'all', currentAlertFilter = 'all', currentFeedFilter = 'all', query = '';
  let telemetryTimer = 0, toastTimer = 0, raf = 0, lastFrame = 0, frameDelta = 0;
  let scanPulse = 0, alertPulse = 0, mapHover = -1, mapSelection = -1, feedModalIndex = -1;
  let autoScan = true, visible = !document.hidden;
  let mapCanvas, chartCanvas, mapCtx, chartCtx, mapSize = { w: 0, h: 0, dpr: 1 };
  const points = nodes.map((_, i) => ({ x: 0.1 + ((i * 37) % 79) / 100, y: 0.13 + ((i * 53) % 72) / 100, phase: i * 1.7 }));
  const history = Array.from({ length: 48 }, (_, i) => ({ a: .48 + Math.sin(i * .29) * .14, b: .31 + Math.cos(i * .23) * .12 }));

  function toast(message) {
    const el = $('#monitor-toast'); if (!el) return;
    el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function activeAlerts() { return alerts.filter(a => !a.resolved); }
  function updateStatus() {
    const critical = activeAlerts().some(a => a.severity === 'critical');
    const pill = $('#global-status-pill'), text = $('#global-status-text');
    if (pill) pill.classList.toggle('alert-mode', critical);
    if (text) text.textContent = critical ? 'ALERTA ACTIVA' : 'SISTEMA ÓPTIMO';
    const badge = $('#nav-alert-badge');
    if (badge) { const count = activeAlerts().length; badge.textContent = String(count); badge.classList.toggle('hidden', count === 0); }
    const threats = $('#kpi-threats'); if (threats) threats.textContent = String(24 + alerts.length - 3);
  }
  function nodeMarkup(n) {
    const state = n.status === 'warn' ? 'Advertencia' : n.status === 'isolated' ? 'Aislado' : 'En línea';
    return `<tr data-node-row="${escapeHTML(n.id)}"><td><strong>${escapeHTML(n.id)}</strong></td><td>${escapeHTML(n.location)}</td><td><span class="state-badge ${n.status}">${state}</span></td><td>${n.latency} ms</td><td>${n.cpu}%</td><td><div class="alert-actions"><button class="chip-btn" data-node-action="ping" data-node="${n.id}">Ping</button><button class="chip-btn" data-node-action="toggle" data-node="${n.id}">${n.status === 'isolated' ? 'Reactivar' : 'Aislar'}</button><button class="chip-btn" data-node-action="restart" data-node="${n.id}">Reiniciar</button></div></td></tr>`;
  }
  function renderNodes() {
    const body = $('#nodes-tbody'); if (!body) return;
    body.innerHTML = nodes.filter(n => (currentNodeFilter === 'all' || n.status === currentNodeFilter) && `${n.id} ${n.location} ${n.status}`.toLowerCase().includes(query)).map(nodeMarkup).join('') || '<tr><td colspan="6">Sin nodos coincidentes</td></tr>';
  }
  function alertMarkup(a, compact = false) {
    const label = { critical: 'CRÍTICA', warning: 'ADVERTENCIA', info: 'INFO' }[a.severity];
    const actions = a.resolved ? '<span class="alert-meta">RESUELTA</span>' : `<div class="alert-actions">${a.acknowledged ? '<span class="alert-meta">RECONOCIDA</span>' : `<button class="chip-btn" data-alert-action="ack" data-alert="${a.id}">Reconocer</button>`}<button class="chip-btn danger" data-alert-action="resolve" data-alert="${a.id}">Resolver</button></div>`;
    return `<article class="alert-item ${a.severity}${a.resolved ? ' resolved' : ''}" data-alert-row="${a.id}"><div class="alert-main"><div class="alert-title">${escapeHTML(a.title)}</div><div class="alert-meta">${label} · ${escapeHTML(a.time)}${compact ? '' : ` · ${escapeHTML(a.detail)}`}</div></div>${actions}</article>`;
  }
  function renderAlerts() {
    const full = $('#alerts-full-list');
    if (full) full.innerHTML = alerts.filter(a => (currentAlertFilter === 'all' || a.severity === currentAlertFilter) && `${a.title} ${a.detail} ${a.severity}`.toLowerCase().includes(query)).map(a => alertMarkup(a)).join('') || '<div class="alert-meta">No hay alertas coincidentes</div>';
    const recent = $('#overview-alerts-list');
    if (recent) recent.innerHTML = [...alerts].slice(-4).reverse().map(a => alertMarkup(a, true)).join('');
    updateStatus();
  }
  function renderFeeds() {
    const grid = $('#feeds-grid'); if (!grid) return;
    grid.innerHTML = feeds.map((f, i) => `<article class="feed-card${f.alert ? ' alert' : ''}" data-feed-card="${i}"><div class="feed-canvas-wrap"><canvas data-feed-canvas="${i}" aria-label="${escapeHTML(f.mode)} ${escapeHTML(f.name)}"></canvas><span class="feed-rec">● REC</span><span class="feed-clock" data-feed-clock="${i}"></span></div><div class="feed-body"><div><div class="feed-name">${escapeHTML(f.id)} ${escapeHTML(f.name)}</div><div class="feed-loc">${f.alert ? 'ALERTA · ' : 'EN LÍNEA · '}${f.mode}</div></div><button class="chip-btn" data-open-feed="${i}">Ampliar</button></div></article>`).join('');
    applyFeedFilter();
  }
  function applyFeedFilter() {
    $$('[data-feed-card]').forEach(card => { const f = feeds[Number(card.dataset.feedCard)]; card.hidden = (currentFeedFilter === 'alert' && !f.alert) || (currentFeedFilter === 'ok' && f.alert); });
  }
  function renderKpis() {
    const online = nodes.filter(n => n.status === 'online').length;
    const k = $('#kpi-nodes'); if (k) k.textContent = `${online} / ${nodes.length}`;
    const l = $('#kpi-latency'); if (l) l.textContent = `${Math.round(nodes.reduce((s, n) => s + n.latency, 0) / nodes.length)} ms`;
    const health = { cpu: 28 + Math.round(Math.random() * 24), mem: 52 + Math.round(Math.random() * 12), net: 24 + Math.round(Math.random() * 20), enc: 99 + Math.round(Math.random()) };
    Object.entries(health).forEach(([key, val]) => { const bar = $(`#health-${key}`), txt = $(`#health-${key}-val`); if (bar) bar.style.width = `${val}%`; if (txt) txt.textContent = `${val}%`; });
    if ($('#chart-throughput')) $('#chart-throughput').textContent = `${(4.2 + Math.random() * 1.2).toFixed(1)} Gbps`;
    if ($('#chart-packets')) $('#chart-packets').textContent = `${(16 + Math.random() * 5).toFixed(1)}k`;
    if ($('#chart-anomalies')) $('#chart-anomalies').textContent = `${(Math.random() * .08).toFixed(2)}%`;
    history.push({ a: .43 + Math.random() * .28, b: .23 + Math.random() * .25 }); history.shift();
    nodes.forEach(n => { if (n.status !== 'isolated') { n.latency = Math.max(5, Math.min(96, n.latency + Math.round(Math.random() * 8 - 4))); n.cpu = Math.max(12, Math.min(94, n.cpu + Math.round(Math.random() * 10 - 5))); } });
    renderNodes();
  }
  function canvasSetup(canvas) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (rect.width < 1 || rect.height < 1) return null;
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: rect.height, dpr };
  }
  function resizeCanvases() {
    const m = canvasSetup(mapCanvas); if (m) { mapCtx = m.ctx; mapSize = m; }
    const c = canvasSetup(chartCanvas); if (c) chartCtx = c.ctx;
    $$('[data-feed-canvas]').forEach(canvasSetup);
    if ($('#modal-feed-canvas')) canvasSetup($('#modal-feed-canvas'));
  }
  function drawMap(t) {
    if (!mapCtx || !mapSize.w) return;
    const { w, h } = mapSize, ctx = mapCtx, accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#10e89a';
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#050a11'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(80,150,160,.10)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const cx = w * .5, cy = h * .5, radar = Math.min(w, h) * (.15 + ((t % 9000) / 9000) * .8);
    ctx.strokeStyle = 'rgba(16,232,154,.15)'; ctx.beginPath(); ctx.arc(cx, cy, radar, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(16,232,154,.14)';
    nodes.forEach((n, i) => { const p = points[i], q = points[(i + 1) % points.length]; if (i % 2 === 0) { ctx.beginPath(); ctx.moveTo(p.x * w, p.y * h); ctx.lineTo(q.x * w, q.y * h); ctx.stroke(); } });
    nodes.forEach((n, i) => {
      const p = points[i], x = p.x * w, y = p.y * h, color = n.status === 'warn' ? '#fbbf24' : n.status === 'isolated' ? '#f43f5e' : accent;
      const pulse = 3 + (reducedMotion ? 0 : (Math.sin(t / 480 + p.phase) + 1) * 1.2);
      if (i === mapHover || i === mapSelection) { ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fillStyle = `${color}30`; ctx.fill(); }
      ctx.beginPath(); ctx.arc(x, y, pulse, 0, 7); ctx.fillStyle = color; ctx.shadowBlur = 12; ctx.shadowColor = color; ctx.fill(); ctx.shadowBlur = 0;
      if (i === mapHover || i === mapSelection) { ctx.fillStyle = '#d8e6ef'; ctx.font = '10px monospace'; ctx.fillText(n.id, x + 9, y - 8); }
    });
    if (scanPulse > 0) { const progress = 1 - scanPulse; ctx.beginPath(); ctx.arc(cx, cy, progress * Math.max(w, h), 0, 7); ctx.strokeStyle = `rgba(16,232,154,${Math.max(0, .7 * scanPulse)})`; ctx.lineWidth = 2; ctx.stroke(); if (!reducedMotion) scanPulse = Math.max(0, scanPulse - .008); }
    if (alertPulse > 0) { ctx.fillStyle = `rgba(244,63,94,${alertPulse * .13})`; ctx.fillRect(0, 0, w, h); if (!reducedMotion) alertPulse = Math.max(0, alertPulse - .012); }
  }
  function drawChart() {
    if (!chartCtx || !chartCanvas) return;
    const { w, h } = canvasSetup(chartCanvas) || {}; if (!w || !h) return;
    const ctx = chartCtx; ctx.clearRect(0, 0, w, h); ctx.strokeStyle = 'rgba(148,163,184,.12)'; ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) { const y = h * i / 5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const drawLine = (key, color, offset) => {
      const pts = history.map((v, i) => ({ x: i * w / (history.length - 1), y: h * (.12 + (1 - v[key]) * .76) + offset }));
      const grad = ctx.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, `${color}55`); grad.addColorStop(1, `${color}00`);
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowBlur = 8; ctx.shadowColor = color; ctx.stroke(); ctx.shadowBlur = 0;
    };
    drawLine('a', getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#10e89a', 0); drawLine('b', '#38bdf8', 0);
  }
  function drawFeed(canvas, index, t) {
    const size = canvasSetup(canvas); if (!size) return;
    const { ctx, w, h } = size, feed = feeds[index]; ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, feed.mode === 'THERMAL' ? '#26151b' : '#071927'); g.addColorStop(1, '#03070c'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(70,190,180,.14)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const scanY = (t / (feed.mode === 'LIDAR' ? 8 : 15) + index * 23) % h;
    ctx.fillStyle = feed.mode === 'THERMAL' ? 'rgba(255,90,55,.15)' : 'rgba(16,232,154,.16)'; ctx.fillRect(0, scanY, w, 2);
    for (let i = 0; i < 9; i++) { const x = (i * 83 + index * 29) % w, y = (i * 41 + index * 17) % h; ctx.fillStyle = `rgba(${feed.mode === 'THERMAL' ? '255,130,60' : '70,220,180'},${.12 + .12 * Math.sin(t / 400 + i)})`; ctx.fillRect(x, y, 3, 3); }
    ctx.fillStyle = '#e2e8f0'; ctx.font = '10px monospace'; ctx.fillText(feed.mode, 10, 16);
    const clock = $(`[data-feed-clock="${index}"]`); if (clock) clock.textContent = nowTime();
  }
  function animate(t) {
    if (!visible) { raf = 0; return; }
    if (!reducedMotion || t - lastFrame > 1000) {
      if (t - lastFrame > 1000) resizeCanvases();
      drawMap(t); drawChart();
      $$('[data-feed-canvas]').forEach(c => drawFeed(c, Number(c.dataset.feedCanvas), reducedMotion ? t - (t % 1000) : t));
      if (feedModalIndex >= 0) drawFeed($('#modal-feed-canvas'), feedModalIndex, reducedMotion ? t - (t % 1000) : t);
      lastFrame = t;
    }
    raf = requestAnimationFrame(animate);
  }
  function startAnimation() { if (visible && !raf) raf = requestAnimationFrame(animate); }
  function startScan() { scanPulse = 1; toast('Escaneo táctico iniciado'); }
  function simulateAlert() {
    const critical = Math.random() > .48, node = nodes[Math.floor(Math.random() * nodes.length)];
    alerts.push({ id: Date.now(), severity: critical ? 'critical' : 'warning', title: critical ? 'Actividad anómala detectada' : 'Umbral de carga superado', detail: `${critical ? 'Tráfico cifrado no habitual' : 'Carga de CPU elevada'} · ${node.id}`, time: nowTime(), acknowledged: false, resolved: false });
    if (alerts.length > 80) alerts.shift();
    alertPulse = 1; renderAlerts(); renderKpis(); toast(`Nueva alerta ${critical ? 'crítica' : 'de advertencia'} · ${node.id}`);
  }
  function setTheme(theme) {
    if (!['emerald', 'gold', 'cyan'].includes(theme)) return;
    document.documentElement.dataset.theme = theme === 'emerald' ? '' : theme;
    if (theme === 'emerald') document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('monitor_theme', theme); } catch (_) { /* storage may be unavailable */ }
    $$('[data-accent-theme]').forEach(b => b.classList.toggle('active', b.dataset.accentTheme === theme));
    drawMap(performance.now());
  }
  function applySearch() {
    query = ($('#global-search')?.value || '').trim().toLowerCase(); renderNodes(); renderAlerts();
  }
  function openFeed(index) {
    feedModalIndex = index; const modal = $('#modal-feed'); if (!modal) return;
    $('#modal-feed-title').textContent = `${feeds[index].id} · ${feeds[index].name}`;
    $('#modal-feed-meta').textContent = `${feeds[index].mode} · EN LÍNEA · 60 FPS`;
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); resizeCanvases(); startAnimation();
    $('[data-close-modal="modal-feed"]')?.focus();
  }
  function closeModal(modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); feedModalIndex = -1; }
  function exportReport() {
    const report = { generatedAt: new Date().toISOString(), operator: $('#op-name')?.textContent || 'admin', kpis: { nodes: $('#kpi-nodes')?.textContent, threats: $('#kpi-threats')?.textContent, latency: $('#kpi-latency')?.textContent, uptime: $('#kpi-uptime')?.textContent }, nodes, alerts };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-'); a.href = url; a.download = `reporte_monitoreo_${stamp}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Reporte JSON descargado');
  }
  function init() {
    let username = 'admin'; try { username = localStorage.getItem('monitor_login_user') || 'admin'; } catch (_) { /* storage may be unavailable */ }
    if ($('#op-name')) $('#op-name').textContent = username;
    if ($('#op-avatar')) $('#op-avatar').textContent = username.trim().split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase() || 'AD';
    $('#live-clock') && ($('#live-clock').textContent = nowTime()); setInterval(() => { const c = $('#live-clock'); if (c) c.textContent = nowTime(); }, 1000);
    try { setTheme(localStorage.getItem('monitor_theme') || 'emerald'); } catch (_) { setTheme('emerald'); }
    mapCanvas = $('#tactical-map-canvas'); chartCanvas = $('#telemetry-chart-canvas'); resizeCanvases();
    if (window.ResizeObserver) { const ro = new ResizeObserver(resizeCanvases); [mapCanvas, chartCanvas, $('#feeds-grid')].filter(Boolean).forEach(el => ro.observe(el)); }
    renderNodes(); renderAlerts(); renderFeeds(); renderKpis(); startAnimation();
    $$('[data-view]').forEach(btn => btn.addEventListener('click', () => { const view = btn.dataset.view; $$('[data-view]').forEach(b => b.classList.toggle('active', b === btn)); $$('.view-section').forEach(s => s.classList.toggle('active', s.id === `view-${view}`)); setTimeout(resizeCanvases, 20); }));
    $$('[data-view-jump]').forEach(btn => btn.addEventListener('click', () => $(`[data-view="${btn.dataset.viewJump}"]`)?.click()));
    $('#btn-logout-monitor')?.addEventListener('click', () => { window.location.href = 'index.html'; });
    $('#btn-sim-alert')?.addEventListener('click', simulateAlert); $('#btn-export-report')?.addEventListener('click', exportReport); $('#btn-map-scan')?.addEventListener('click', startScan);
    $('#global-search')?.addEventListener('input', applySearch);
    $$('[data-node-filter]').forEach(b => b.addEventListener('click', () => { currentNodeFilter = b.dataset.nodeFilter; $$('[data-node-filter]').forEach(x => x.classList.toggle('active', x === b)); renderNodes(); }));
    $$('[data-alert-filter]').forEach(b => b.addEventListener('click', () => { currentAlertFilter = b.dataset.alertFilter; $$('[data-alert-filter]').forEach(x => x.classList.toggle('active', x === b)); renderAlerts(); }));
    $$('[data-feed-filter]').forEach(b => b.addEventListener('click', () => { currentFeedFilter = b.dataset.feedFilter; $$('[data-feed-filter]').forEach(x => x.classList.toggle('active', x === b)); applyFeedFilter(); }));
    $$('[data-accent-theme]').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.accentTheme)));
    $('#select-refresh-rate')?.addEventListener('change', e => { clearInterval(telemetryTimer); telemetryTimer = setInterval(renderKpis, Number(e.target.value) || 2000); });
    telemetryTimer = setInterval(renderKpis, Number($('#select-refresh-rate')?.value) || 2000);
    $('#chk-auto-scan')?.addEventListener('change', e => { autoScan = e.target.checked; });
    setInterval(() => { if (autoScan && visible) startScan(); }, 18000);
    $('#nodes-tbody')?.addEventListener('click', e => { const b = e.target.closest('[data-node-action]'); if (!b) return; const n = nodes.find(x => x.id === b.dataset.node); if (!n) return;
      if (b.dataset.nodeAction === 'ping') { n.latency = 5 + Math.floor(Math.random() * 15); toast(`Ping ${n.id}: ${n.latency} ms`); }
      if (b.dataset.nodeAction === 'toggle') { n.status = n.status === 'isolated' ? 'online' : 'isolated'; toast(`${n.id} ${n.status === 'isolated' ? 'aislado' : 'reactivado'}`); }
      if (b.dataset.nodeAction === 'restart') { n.status = 'online'; n.latency = 9 + Math.floor(Math.random() * 12); toast(`${n.id} reiniciado correctamente`); }
      renderNodes(); renderKpis(); });
    const alertAction = e => { const b = e.target.closest('[data-alert-action]'); if (!b) return; const a = alerts.find(x => String(x.id) === b.dataset.alert); if (!a) return;
      if (b.dataset.alertAction === 'ack') { a.acknowledged = true; toast('Alerta reconocida'); } else { a.resolved = true; toast('Alerta resuelta'); } renderAlerts(); };
    $('#alerts-full-list')?.addEventListener('click', alertAction); $('#overview-alerts-list')?.addEventListener('click', alertAction);
    $('#btn-resolve-all')?.addEventListener('click', () => { activeAlerts().forEach(a => { a.resolved = true; }); renderAlerts(); toast('Todas las alertas activas fueron resueltas'); });
    $('#feeds-grid')?.addEventListener('click', e => { const b = e.target.closest('[data-open-feed]'); if (b) openFeed(Number(b.dataset.openFeed)); });
    $$('[data-close-modal]').forEach(b => b.addEventListener('click', () => { const modal = $(`#${b.dataset.closeModal}`); if (modal) closeModal(modal); }));
    $('#modal-feed')?.addEventListener('click', e => { if (e.target.id === 'modal-feed') closeModal(e.currentTarget); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { const modal = $('#modal-feed.open'); if (modal) closeModal(modal); } });
    mapCanvas?.addEventListener('pointermove', e => { const rect = mapCanvas.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top; mapHover = points.findIndex(p => Math.hypot(p.x * rect.width - x, p.y * rect.height - y) < 16); mapCanvas.style.cursor = mapHover >= 0 ? 'pointer' : 'crosshair'; });
    mapCanvas?.addEventListener('pointerleave', () => { mapHover = -1; });
    mapCanvas?.addEventListener('click', e => { const rect = mapCanvas.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top, idx = points.findIndex(p => Math.hypot(p.x * rect.width - x, p.y * rect.height - y) < 18); if (idx < 0) return; mapSelection = idx; const n = nodes[idx], r = $('#map-node-readout'); if (r) r.textContent = `${n.id} · ${n.location} · ${n.status.toUpperCase()} · ${n.latency} ms · CPU ${n.cpu}%`; });
    document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) { lastFrame = 0; startAnimation(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
