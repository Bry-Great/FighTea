/* ============================================================
   FighTea — Customer Notification System  v6
   
   Changes from v5:
   - Popup is a NON-BLOCKING corner toast (bottom-right desktop,
     top-right tablet/phone) — no backdrop, no blur, no overlay
   - Bell opens a real notification panel/dropdown
   - Persistent: on login, checks for any "ready" orders that
     the user hasn't acknowledged yet (session-aware)
   - Multiple notifications stack vertically
   - Each card has an individual dismiss button and progress bar
   ============================================================ */
'use strict';

/* ── CONFIG ──────────────────────────────────────────────── */
const NOTIF_CONFIG = {
  pollInterval:    8000,    // polling fallback interval (ms)
  sseTimeout:      12000,   // switch to polling if SSE doesn't confirm
  reconnectDelay:  4000,    // base delay before SSE reconnect attempt
  maxReconnects:   5,       // give up SSE after this many failures
  autoDismiss:     30000,   // auto-remove card after 30s
};

/* ── STATE ───────────────────────────────────────────────── */
const Notif = {
  mode:             null,        // 'sse' | 'poll' | null
  eventSource:      null,
  pollTimer:        null,
  sseTimer:         null,
  reconnectTimer:   null,
  reconnectCount:   0,
  lastChecked:      null,        // ISO string — set on start/login
  seenOrders:       new Set(),   // order_numbers shown in this session
  notifications:    [],          // { id, order_number, customer, payment, time, read }
  panelOpen:        false,
};

/* ══════════════════════════════════════════════════════════
   PUBLIC API
   ════════════════════════════════════════════════════════ */

/**
 * Call after login or on page load when session exists.
 * Immediately checks for any pending "ready" orders,
 * then starts live polling / SSE.
 */
async function startNotifications() {
  if (!isLoggedIn()) return;
  if (Notif.mode) return;   // already running

  // Set lastChecked to a generous window so we catch orders
  // that became ready while the user was logged out
  Notif.lastChecked = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Immediately fetch any "ready" orders the user may have missed
  await _checkOnLogin();

  // Start live transport
  _trySSE();
}

/** Call on logout to clean up connections. */
function stopNotifications() {
  _clearSSE();
  _clearPoll();
  Notif.mode = null;
  Notif.reconnectCount = 0;
  // Do NOT clear seenOrders or notifications on logout —
  // they persist so the panel still shows history if reopened.
}

/* ══════════════════════════════════════════════════════════
   LOGIN CHECK — fetch "ready" orders immediately after login
   ════════════════════════════════════════════════════════ */
async function _checkOnLogin() {
  if (isAdmin()) return;  // admin/staff don't get customer popups
  const token = localStorage.getItem('fightea_token');
  if (!token) return;

  try {
    const base = window.FIGHTEA_API_BASE || 'http://localhost:4000/api';
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `${base}/notifications/poll?since=${encodeURIComponent(since)}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!res.ok) return;
    const data = await res.json();
    Notif.lastChecked = new Date().toISOString();

    // Show any "ready" orders that we haven't shown yet
    for (const ev of (data.events || [])) {
      if (ev.type === 'order_ready') {
        _handleOrderReady(ev.data, true /* persistent — from login check */);
      }
    }
  } catch (_) {
    // silently fail — non-critical
  }
}

/* ══════════════════════════════════════════════════════════
   SSE TRANSPORT
   ════════════════════════════════════════════════════════ */
function _trySSE() {
  if (!window.EventSource) { _startPolling(); return; }

  const token = localStorage.getItem('fightea_token');
  if (!token) { _startPolling(); return; }

  const base = window.FIGHTEA_API_BASE || 'http://localhost:4000/api';
  const url  = `${base}/notifications/stream?token=${encodeURIComponent(token)}`;

  try {
    const es = new EventSource(url, { withCredentials: false });
    Notif.eventSource = es;

    Notif.sseTimer = setTimeout(() => {
      _clearSSE();
      _startPolling();
    }, NOTIF_CONFIG.sseTimeout);

    es.addEventListener('connected', () => {
      clearTimeout(Notif.sseTimer);
      Notif.mode = 'sse';
      Notif.reconnectCount = 0;
    });

    es.addEventListener('order_ready', (e) => {
      try { _handleOrderReady(JSON.parse(e.data)); } catch (_) {}
    });

    es.addEventListener('queue_updated', () => {
      // Auto-refresh admin queue panel if it's open
      if (isAdmin() && App.currentView === 'admin') {
        const f = document.querySelector('.queue-filter.active')?.dataset.filter || 'active';
        if (typeof renderQueue === 'function') renderQueue(f);
      }
    });

    es.onerror = () => {
      clearTimeout(Notif.sseTimer);
      _clearSSE();
      if (Notif.reconnectCount < NOTIF_CONFIG.maxReconnects) {
        Notif.reconnectCount++;
        Notif.reconnectTimer = setTimeout(() => {
          if (isLoggedIn()) _trySSE();
        }, NOTIF_CONFIG.reconnectDelay * Notif.reconnectCount);
      } else {
        _startPolling();
      }
    };
  } catch (_) {
    _startPolling();
  }
}

function _clearSSE() {
  clearTimeout(Notif.sseTimer);
  clearTimeout(Notif.reconnectTimer);
  if (Notif.eventSource) { Notif.eventSource.close(); Notif.eventSource = null; }
  if (Notif.mode === 'sse') Notif.mode = null;
}

/* ══════════════════════════════════════════════════════════
   POLLING FALLBACK
   ════════════════════════════════════════════════════════ */
function _startPolling() {
  if (Notif.pollTimer) return;
  Notif.mode = 'poll';
  _poll();
  Notif.pollTimer = setInterval(_poll, NOTIF_CONFIG.pollInterval);
}

function _clearPoll() {
  if (Notif.pollTimer) { clearInterval(Notif.pollTimer); Notif.pollTimer = null; }
  if (Notif.mode === 'poll') Notif.mode = null;
}

async function _poll() {
  if (!isLoggedIn()) return;
  const token = localStorage.getItem('fightea_token');
  if (!token) return;

  try {
    const base = window.FIGHTEA_API_BASE || 'http://localhost:4000/api';
    const since = Notif.lastChecked || new Date(Date.now() - 30000).toISOString();
    const res = await fetch(
      `${base}/notifications/poll?since=${encodeURIComponent(since)}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!res.ok) return;
    const data = await res.json();
    Notif.lastChecked = new Date().toISOString();

    for (const ev of (data.events || [])) {
      if (ev.type === 'order_ready') _handleOrderReady(ev.data);
      if (ev.type === 'queue_updated' && isAdmin() && App.currentView === 'admin') {
        const f = document.querySelector('.queue-filter.active')?.dataset.filter || 'active';
        if (typeof renderQueue === 'function') renderQueue(f);
      }
    }
  } catch (_) { /* silent — retry next interval */ }
}

/* ══════════════════════════════════════════════════════════
   EVENT HANDLER
   ════════════════════════════════════════════════════════ */
function _handleOrderReady(data, fromLoginCheck = false) {
  if (!data?.order_number) return;
  if (isAdmin()) return;   // admin/staff don't get customer popup

  // Deduplicate within this session
  if (Notif.seenOrders.has(data.order_number)) return;
  Notif.seenOrders.add(data.order_number);

  // Add to notification history
  const notif = {
    id:           'n-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    order_number: data.order_number,
    customer:     data.customer || 'You',
    payment:      data.payment,
    time:         new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
    read:         false,
  };
  Notif.notifications.unshift(notif);

  // Show the corner toast
  _showToastCard(notif);

  // Update bell badge
  _bumpBell();

  // Update the panel if it's open
  if (Notif.panelOpen) _renderPanel();

  // Chime + title flash
  _playChime();
  _flashTitle('✅ Order Ready! — FighTea');
}

/* ══════════════════════════════════════════════════════════
   CORNER TOAST CARD (non-blocking)
   ════════════════════════════════════════════════════════ */
function _showToastCard(notif) {
  // Ensure the container exists
  let container = document.getElementById('order-ready-popup');
  if (!container) {
    container = document.createElement('div');
    container.id = 'order-ready-popup';
    document.body.appendChild(container);
  }

  const isCash = notif.payment === 'cash';
  const payNote = isCash
    ? 'Come to the counter to pay and collect.'
    : 'Payment confirmed. Come collect your order.';

  const card = document.createElement('div');
  card.className = 'orpop-card';
  card.dataset.notifId = notif.id;
  card.setAttribute('role', 'alert');
  card.setAttribute('aria-live', 'assertive');
  card.style.setProperty('--orpop-duration', NOTIF_CONFIG.autoDismiss / 1000 + 's');

  card.innerHTML = `
    <div class="orpop-progress"></div>
    <div class="orpop-inner">
      <div class="orpop-icon-wrap" aria-hidden="true">
        <span class="orpop-check">✓</span>
      </div>
      <div class="orpop-content">
        <div class="orpop-title">Your Order is Ready!</div>
        <div class="orpop-order-num">${notif.order_number}</div>
        <div class="orpop-subtitle">For: <strong>${notif.customer}</strong></div>
        <div class="orpop-pay-note">${payNote}</div>
      </div>
      <button class="orpop-close" aria-label="Dismiss" onclick="_dismissCard('${notif.id}')">✕</button>
    </div>
    <div class="orpop-footer">
      <button class="orpop-cta" onclick="_dismissCard('${notif.id}')">
        🧋 Got it!
      </button>
    </div>`;

  container.appendChild(card);

  // Trigger slide-in animation
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('orpop-in')));

  // Auto-dismiss
  card._autoTimer = setTimeout(() => _dismissCard(notif.id), NOTIF_CONFIG.autoDismiss);

  // Keyboard: Escape dismisses the most recent card
  const keyHandler = (e) => { if (e.key === 'Escape') _dismissCard(notif.id); };
  card._keyHandler = keyHandler;
  document.addEventListener('keydown', keyHandler, { once: true });
}

function _dismissCard(notifId) {
  const card = document.querySelector(`.orpop-card[data-notif-id="${notifId}"]`);
  if (!card) return;
  clearTimeout(card._autoTimer);
  if (card._keyHandler) document.removeEventListener('keydown', card._keyHandler);

  card.classList.remove('orpop-in');
  card.classList.add('orpop-out');
  setTimeout(() => {
    card.remove();
    // Mark as read in history
    const n = Notif.notifications.find(n => n.id === notifId);
    if (n) n.read = true;
    if (Notif.panelOpen) _renderPanel();
  }, 350);
}

/* ══════════════════════════════════════════════════════════
   BELL + NOTIFICATION PANEL
   ════════════════════════════════════════════════════════ */
function _bumpBell() {
  const unread = Notif.notifications.filter(n => !n.read).length;
  const badge  = document.getElementById('notif-badge');
  if (!badge) return;
  badge.textContent   = unread > 9 ? '9+' : String(unread);
  badge.style.display = unread > 0 ? 'flex' : 'none';
  badge.classList.add('notif-badge-pulse');
  setTimeout(() => badge.classList.remove('notif-badge-pulse'), 600);
}

function _updateBellBadge() {
  const unread = Notif.notifications.filter(n => !n.read).length;
  const badge  = document.getElementById('notif-badge');
  if (!badge) return;
  badge.textContent   = unread > 9 ? '9+' : String(unread);
  badge.style.display = unread > 0 ? 'flex' : 'none';
}

/** Called when user clicks the bell icon. */
function toggleNotifPanel() {
  Notif.panelOpen = !Notif.panelOpen;

  let panel = document.getElementById('notif-panel');
  if (!panel) {
    panel = _createPanel();
    document.body.appendChild(panel);
  }

  if (Notif.panelOpen) {
    _renderPanel();
    panel.classList.add('open');
    // Mark all as read when panel opens
    Notif.notifications.forEach(n => { n.read = true; });
    _updateBellBadge();
    // Close panel on outside click
    setTimeout(() => {
      document.addEventListener('click', _outsidePanelClick, { once: true });
    }, 50);
  } else {
    panel.classList.remove('open');
  }
}

function _outsidePanelClick(e) {
  const panel = document.getElementById('notif-panel');
  const bell  = document.getElementById('notif-bell');
  if (panel && !panel.contains(e.target) && bell && !bell.contains(e.target)) {
    closeNotifPanel();
  }
}

function closeNotifPanel() {
  Notif.panelOpen = false;
  document.getElementById('notif-panel')?.classList.remove('open');
}

function _createPanel() {
  const panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.innerHTML = `
    <div class="notif-panel-header">
      <span class="notif-panel-title">🔔 Notifications</span>
      <button class="notif-panel-close" onclick="closeNotifPanel()" aria-label="Close">✕</button>
    </div>
    <div class="notif-panel-body" id="notif-panel-body"></div>
    <div class="notif-panel-footer">
      <button class="notif-panel-clear" onclick="clearAllNotifications()">Clear all</button>
    </div>`;
  return panel;
}

function _renderPanel() {
  const body = document.getElementById('notif-panel-body');
  if (!body) return;

  if (Notif.notifications.length === 0) {
    body.innerHTML = `<div class="notif-panel-empty">No notifications yet.<br>We'll let you know when your order is ready!</div>`;
    return;
  }

  body.innerHTML = Notif.notifications.map(n => {
    const isCash = n.payment === 'cash';
    const sub    = isCash ? 'Come to the counter to pay & collect.' : 'Payment confirmed — come collect!';
    return `
      <div class="notif-item${n.read ? '' : ' unread'}">
        <div class="notif-item-icon">✓</div>
        <div class="notif-item-body">
          <div class="notif-item-title">Order Ready: ${n.order_number}</div>
          <div class="notif-item-sub">${sub}</div>
          <div class="notif-item-time">${n.time}</div>
        </div>
      </div>`;
  }).join('');
}

function clearAllNotifications() {
  Notif.notifications = [];
  Notif.seenOrders.clear();
  _renderPanel();
  _updateBellBadge();
  closeNotifPanel();
}

/* Legacy function — kept for backward compat if called elsewhere */
function clearNotificationBadge() {
  Notif.notifications.forEach(n => { n.read = true; });
  _updateBellBadge();
}

/* ══════════════════════════════════════════════════════════
   CHIME — Web Audio API  (no file needed)
   ════════════════════════════════════════════════════════ */
function _playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const note = (freq, start, dur, vol) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.start(start); osc.stop(start + dur + 0.05);
    };
    const t = ctx.currentTime;
    note(880,  t,        0.30, 0.4);
    note(1108, t + 0.22, 0.45, 0.28);
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch (_) { /* autoplay blocked — silent */ }
}

/* ══════════════════════════════════════════════════════════
   PAGE TITLE FLASH
   ════════════════════════════════════════════════════════ */
let _titleTimer    = null;
let _originalTitle = document.title;

function _flashTitle(text, ms = 12000) {
  clearInterval(_titleTimer);
  let tog = true;
  _titleTimer = setInterval(() => {
    document.title = tog ? text : _originalTitle;
    tog = !tog;
  }, 1200);
  setTimeout(() => {
    clearInterval(_titleTimer);
    _titleTimer = null;
    document.title = _originalTitle;
  }, ms);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && _titleTimer) {
    clearInterval(_titleTimer);
    _titleTimer = null;
    document.title = _originalTitle;
  }
});

/* ══════════════════════════════════════════════════════════
   COMPATIBILITY ALIASES
   ════════════════════════════════════════════════════════ */
const connectNotifications    = startNotifications;
const disconnectNotifications = stopNotifications;
