/* ============================================================
   FighTea — Admin Dashboard  (admin.js)  v6
   All data (queue, users, analytics, menu) via real API calls.
   No local ORDERS/USERS arrays — everything is fetched live.
   ============================================================ */
'use strict';

/* ── PERMISSIONS ─────────────────────────────────────────── */
function canManageMenu()  { return isStrictAdmin(); }
function canEditOrders()  { return isAdmin(); }
function canManageUsers() { return isStrictAdmin(); }

/* ── DASHBOARD INIT ──────────────────────────────────────── */
function renderAdminDashboard() {
  if (!isAdmin()) { showToast('Access denied.', 'error'); showView('home'); return; }
  document.querySelectorAll('.admin-nav-item[data-tab="menu"],.admin-nav-item[data-tab="users"],.admin-nav-item[data-tab="promos"]')
    .forEach(el => el.classList.toggle('locked', !isStrictAdmin()));
  const lbl = document.getElementById('admin-user-label');
  if (lbl) lbl.textContent = `${App.currentUser.name} (${capitalise(App.currentUser.role)})`;
  adminTab('queue');
}

function adminTab(tab) {
  if (['menu','users','promos'].includes(tab) && !canManageMenu()) {
    showToast('Admin access required.', 'error'); return;
  }
  // Stop queue polling when leaving queue tab
  if (tab !== 'queue') stopQueuePolling();

  document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('admin-' + tab)?.classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  const titles = { queue:'Order Queue', menu:'Menu Manager', analytics:'Analytics',
                   users:'User Management', settings:'Settings', promos:'Promo Manager' };
  const el = document.getElementById('admin-page-title');
  if (el) el.textContent = titles[tab] || 'Dashboard';
  if (tab === 'queue')     loadAndRenderQueue();
  if (tab === 'analytics') loadAndRenderAnalytics();
  if (tab === 'menu')      renderMenuManager();
  if (tab === 'users')     loadAndRenderUsers();
  if (tab === 'promos')    loadAndRenderPromos();
  if (tab === 'settings')  loadAndRenderSettings();
}

/* ══════════════════════════════════════════════════════════
   ORDER QUEUE  — fetches live from API
   ════════════════════════════════════════════════════════ */
let _currentQueueFilter = 'active';

/* ── RECEIPT FULLSCREEN VIEWER ───────────────────────────── */
function viewReceiptFullscreen(dbId) {
  const card = document.getElementById(`ocard-${dbId}`);
  const img  = card?.querySelector('img[alt="GCash Receipt"]');
  if (!img) return;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,.88);
    display:flex;align-items:center;justify-content:center;
    padding:20px;cursor:zoom-out;
  `;
  overlay.innerHTML = `
    <div style="position:relative;max-width:100%;max-height:100%">
      <img src="${img.src}" style="max-width:90vw;max-height:90vh;object-fit:contain;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.5)" alt="GCash Receipt"/>
      <button onclick="this.closest('[style*=fixed]').remove()"
              style="position:absolute;top:-12px;right:-12px;width:32px;height:32px;
                     border-radius:50%;background:#fff;border:none;font-size:16px;
                     cursor:pointer;display:flex;align-items:center;justify-content:center;
                     box-shadow:0 2px 8px rgba(0,0,0,.3)">✕</button>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}


async function confirmClearHistory() {
  if (!confirm('Remove all completed and cancelled orders from the queue view?\n\nThis deletes them from the database permanently.')) return;
  try {
    // Use the analytics reset endpoint scoped to completed/cancelled only
    await apiFetch('/analytics/orders/clear-history', { method: 'DELETE' });
    showToast('History cleared.', 'success');
    loadAndRenderQueue();
  } catch (err) {
    showToast('Clear failed: ' + err.message, 'error');
  }
}

/* ── QUEUE AUTO-REFRESH POLLING ─────────────────────────── */
let _queuePollTimer = null;

function startQueuePolling() {
  stopQueuePolling();
  // Poll every 10 seconds while admin is on the queue tab
  _queuePollTimer = setInterval(() => {
    if (App.currentView === 'admin' && _currentQueueFilter !== null) {
      _silentRefreshQueue();
    }
  }, 10000);
}

function stopQueuePolling() {
  if (_queuePollTimer) { clearInterval(_queuePollTimer); _queuePollTimer = null; }
}

// Silently refreshes queue without showing the loading spinner
// Only adds new cards and updates stats — does not flash the whole grid
async function _silentRefreshQueue() {
  try {
    const [orders, all] = await Promise.all([
      fetchOrders(_currentQueueFilter),
      fetchOrders('all'),
    ]);
    _updateStats(all);
    _patchQueueDOM(orders);
  } catch (_) { /* silent */ }
}

function _updateStats(all) {
  const pending   = document.getElementById('stat-pending');
  const preparing = document.getElementById('stat-preparing');
  const ready     = document.getElementById('stat-ready');
  const revenue   = document.getElementById('stat-revenue');
  if (pending)   pending.textContent   = all.filter(o => o.status === 'pending').length;
  if (preparing) preparing.textContent = all.filter(o => o.status === 'preparing').length;
  if (ready)     ready.textContent     = all.filter(o => o.status === 'ready').length;
  if (revenue)   revenue.textContent   = formatCurrency(
    all.filter(o => o.paymentStatus === 'paid').reduce((s, o) => s + o.total, 0)
  );
}

// Smart DOM patch: add new cards, remove gone ones, update changed ones
// Never re-renders cards that haven't changed — no flicker
function _patchQueueDOM(orders) {
  const gridEl = document.getElementById('queue-grid'); if (!gridEl) return;

  // Build a map of current order IDs in the grid
  const existingIds = new Set(
    [...gridEl.querySelectorAll('.order-card')].map(el => el.id.replace('ocard-', ''))
  );
  const newIds = new Set(orders.map(o => String(o.dbId)));

  // Remove cards that are no longer in the filtered view
  existingIds.forEach(id => {
    if (!newIds.has(id)) {
      const el = document.getElementById(`ocard-${id}`);
      if (el) {
        el.style.transition = 'opacity .3s, transform .3s';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.95)';
        setTimeout(() => el.remove(), 300);
      }
    }
  });

  orders.forEach(order => {
    const existing = document.getElementById(`ocard-${order.dbId}`);
    const newHTML  = orderCardHTML(order);

    if (!existing) {
      // New order — slide it in at the top
      const div = document.createElement('div');
      div.innerHTML = newHTML;
      const card = div.firstElementChild;
      card.style.opacity = '0';
      card.style.transform = 'translateY(-12px)';
      card.style.transition = 'opacity .4s, transform .4s';
      // Remove empty state if present
      gridEl.querySelector('.empty-state')?.remove();
      gridEl.prepend(card);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }));
    } else {
      // Existing card — only update if status changed (check badge text)
      const currentStatus = existing.querySelector('.badge')?.className.replace('badge badge-', '');
      if (currentStatus !== order.status) {
        existing.outerHTML = newHTML;
      }
    }
  });

  // Show empty state if nothing left
  if (orders.length === 0 && !gridEl.querySelector('.order-card')) {
    gridEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">✅</div><h4>No orders here</h4><p>All clear!</p></div>`;
  }
}

async function loadAndRenderQueue(filterStatus) {
  if (filterStatus) _currentQueueFilter = filterStatus;
  const f = _currentQueueFilter;

  document.querySelectorAll('.queue-filter').forEach(b =>
    b.classList.toggle('active', b.dataset.filter === f)
  );

  const gridEl = document.getElementById('queue-grid');
  if (!gridEl) return;
  gridEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon" style="font-size:36px">⏳</div><p style="color:#BBA882">Loading orders…</p></div>`;

  try {
    const [orders, all] = await Promise.all([
      fetchOrders(f),
      fetchOrders('all'),
    ]);
    _updateStats(all);

    if (orders.length === 0) {
      gridEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">✅</div><h4>No orders here</h4><p>All clear!</p></div>`;
      return;
    }
    gridEl.innerHTML = orders.map(orderCardHTML).join('');

    // Start auto-polling now that queue is loaded
    startQueuePolling();
  } catch (err) {
    gridEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">⚠️</div><h4>Could not load orders</h4><p>${err.message}</p></div>`;
  }
}

function renderQueue(f) {
  // Called by SSE/polling notification — use silent refresh to avoid flicker
  if (f) _currentQueueFilter = f;
  _silentRefreshQueue();
}

function orderCardHTML(order) {
  const actions = {
    pending:   `<button class="act-btn act-prepare"  onclick="doUpdateStatus('${order.dbId}','preparing')">Start Prep</button>
                <button class="act-btn act-cancel"   onclick="doUpdateStatus('${order.dbId}','cancelled')">Cancel</button>
                <button class="act-btn act-edit"     onclick="openEditOrder('${order.dbId}','${order.id}')">Edit</button>`,
    preparing: `<button class="act-btn act-ready"    onclick="doUpdateStatus('${order.dbId}','ready')">Mark Ready</button>
                <button class="act-btn act-edit"     onclick="openEditOrder('${order.dbId}','${order.id}')">Edit</button>`,
    ready:     `<button class="act-btn act-complete" onclick="doUpdateStatus('${order.dbId}','completed')">Complete</button>
                <button class="act-btn act-edit"     onclick="openEditOrder('${order.dbId}','${order.id}')">Edit</button>`,
    completed: `<span style="font-size:12px;color:var(--teal)">✓ Completed</span>`,
    cancelled: `<span style="font-size:12px;color:#C62828">✕ Cancelled</span>`,
  };

  const payBadge = order.payment === 'gcash'
    ? `<span class="gcash-badge">💙 GCash — Verify Receipt</span>`
    : `<span class="cash-badge">💵 Cash on Pickup</span>`;

  // GCash receipt image — shown only for GCash orders that have a receipt
  const receiptHTML = (order.payment === 'gcash' && order.gcashReceipt)
    ? `<div style="margin:8px 0">
        <p style="font-size:11px;color:#9A7A5A;margin-bottom:4px;font-weight:600">📄 GCash Receipt (verify before preparing):</p>
        <img src="${order.gcashReceipt}" alt="GCash Receipt"
             style="width:100%;max-height:200px;object-fit:contain;border-radius:var(--r-sm);
                    border:1.5px solid var(--teal);background:var(--cream);cursor:pointer"
             onclick="viewReceiptFullscreen('${order.dbId}')"
             title="Click to view full size"/>
        <p style="font-size:10px;color:#BBA882;margin-top:3px;text-align:center">Tap image to view full size</p>
       </div>`
    : (order.payment === 'gcash'
        ? `<div style="margin:8px 0;padding:8px;background:#FFF3E0;border-radius:var(--r-sm);border-left:3px solid #E65100">
            <p style="font-size:11px;color:#E65100;font-weight:600">⚠️ No receipt uploaded</p>
           </div>`
        : '');

  const itemsList = order.items.map(i => {
    const opts = [i.variety, i.size, i.ice].filter(Boolean).join(', ');
    const tops = i.toppings?.length ? ` + ${i.toppings.join(', ')}` : '';
    return `${i.emoji || '🧋'} ${i.name} ×${i.qty}${opts ? ' (' + opts + ')' : ''}${tops}`;
  }).join('\n');

  return `<div class="order-card" id="ocard-${order.dbId}">
    <div class="order-card-head"><span class="order-card-num">${order.id}</span><span class="order-card-time">${order.time}</span></div>
    <div class="order-card-name">${order.customer}</div>
    <div style="margin:4px 0">${payBadge}</div>
    ${receiptHTML}
    <div class="order-card-items" style="white-space:pre-line">${itemsList || 'No items'}</div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <span class="badge badge-${order.status}">${capitalise(order.status)}</span>
      <span class="order-card-total">${formatCurrency(order.total)}</span>
    </div>
    ${order.notes ? `<div style="font-size:11px;color:#9A7A5A;padding:6px 8px;background:var(--cream);border-radius:6px">📝 ${order.notes}</div>` : ''}
    <div class="order-card-actions">${actions[order.status] || ''}</div>
  </div>`;
}

async function doUpdateStatus(dbId, newStatus) {
  // Optimistically update the card immediately — no full reload
  const card = document.getElementById(`ocard-${dbId}`);
  if (card) {
    const badge = card.querySelector('.badge');
    if (badge) {
      badge.className = `badge badge-${newStatus}`;
      badge.textContent = capitalise(newStatus);
    }
    const actionsEl = card.querySelector('.order-card-actions');
    if (actionsEl) actionsEl.innerHTML = `<span style="font-size:12px;color:#BBA882">Updating…</span>`;
  }

  try {
    await updateOrderStatusAPI(dbId, newStatus);
    const msgs = {
      preparing: 'Order is being prepared.',
      ready:     'Order is ready for pickup! 🎉',
      completed: 'Order completed.',
      cancelled: 'Order cancelled.',
    };
    showToast(msgs[newStatus] || `Status: ${newStatus}`, newStatus === 'cancelled' ? 'error' : 'success');
    // Silent refresh updates the card with correct action buttons
    await _silentRefreshQueue();
  } catch (err) {
    showToast('Failed to update status: ' + err.message, 'error');
    // On failure, fully reload to restore correct state
    loadAndRenderQueue();
  }
}


let _editingDbId = null;

function openEditOrder(dbId, orderNum) {
  _editingDbId = dbId;
  document.getElementById('edit-order-id').textContent = orderNum;
  document.getElementById('edit-customer').value = '';
  document.getElementById('edit-notes').value    = '';
  document.getElementById('edit-payment').value  = 'cash';
  document.getElementById('edit-items-list').innerHTML = '<p style="color:#BBA882;font-size:13px">Edit customer name, notes, or payment method above.</p>';
  openModal('edit-order-modal');
}

async function saveEditOrder() {
  if (!_editingDbId) return;
  try {
    await apiFetch(`/orders/${_editingDbId}`, {
      method: 'PUT',
      body: JSON.stringify({
        customer_name:  document.getElementById('edit-customer').value.trim(),
        notes:          document.getElementById('edit-notes').value.trim(),
        payment_method: document.getElementById('edit-payment').value,
      }),
    });
    closeModal('edit-order-modal');
    showToast('Order updated.', 'success');
    loadAndRenderQueue();
  } catch (err) {
    showToast('Failed to update order: ' + err.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════════
   ANALYTICS — fetches from API
   ════════════════════════════════════════════════════════ */
async function loadAndRenderAnalytics() {
  // Staff cannot access analytics — enforced by API too, but show message immediately
  if (!isStrictAdmin()) {
    const el = document.getElementById('analytics-content');
    if (el) el.innerHTML = `<div class="perm-notice">⚠️ Only Admins can view and manage analytics. Staff accounts do not have access to this section.</div>`;
    return;
  }
  const el = document.getElementById('analytics-content'); if (!el) return;
  el.innerHTML = `<div class="empty-state"><div class="empty-state-icon" style="font-size:36px">⏳</div><p style="color:#BBA882">Loading analytics…</p></div>`;
  try {
    const a = await getAnalyticsFromAPI();
    el.innerHTML = `
      <!-- Stats summary -->
      <div class="stats-grid" style="margin-bottom:24px">
        <div class="stat-card accent"><div class="stat-label">Total Revenue (Paid)</div><div class="stat-value">${formatCurrency(a.total_revenue)}</div><div class="stat-sub">all time</div></div>
        <div class="stat-card"><div class="stat-label">Today's Revenue</div><div class="stat-value">${formatCurrency(a.today_revenue)}</div><div class="stat-sub">${a.today_orders} orders today</div></div>
        <div class="stat-card"><div class="stat-label">Total Orders</div><div class="stat-value">${a.total_orders}</div><div class="stat-sub">${a.completed} completed</div></div>
        <div class="stat-card"><div class="stat-label">Avg Order</div><div class="stat-value">${formatCurrency(a.avg_order)}</div><div class="stat-sub">per transaction</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:24px">
        <div class="stat-card"><div class="stat-label">GCash Orders</div><div class="stat-value">${a.gcash_count}</div><div class="stat-sub">${a.cash_count} cash</div></div>
        <div class="stat-card"><div class="stat-label">Pending Cash</div><div class="stat-value">${formatCurrency(a.pending_revenue)}</div><div class="stat-sub">unpaid</div></div>
      </div>
      <!-- Top sellers + status breakdown -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px">
        <div class="table-wrapper" style="padding:20px">
          <h4 style="margin-bottom:16px;font-family:var(--font-display)">Top Sellers</h4>
          ${a.top_items && a.top_items.length
            ? `<ul class="top-items-list">${a.top_items.map((i,idx) => `
                <li class="top-item">
                  <div class="top-item-rank ${idx===0?'gold':''}">${idx+1}</div>
                  <span class="top-item-name">${i.emoji||'🧋'} ${i.name}</span>
                  <div style="text-align:right"><div class="top-item-count">${i.count} sold</div><div style="font-size:11px;color:#9A7A5A">${formatCurrency(i.revenue)}</div></div>
                </li>`).join('')}</ul>`
            : '<p style="color:#BBA882;font-size:13px">No sales data yet.</p>'}
        </div>
        <div class="table-wrapper" style="padding:20px">
          <h4 style="margin-bottom:16px;font-family:var(--font-display)">Order Status</h4>
          ${_renderStatusBreakdown(a.by_status || {}, a.total_orders)}
        </div>
      </div>
      <!-- Completed Order Log — admin editable -->
      <div id="order-log-section"></div>
      <!-- Danger Zone -->
      <div class="table-wrapper" style="padding:20px;border-left:4px solid #C62828;margin-top:8px">
        <h4 style="font-family:var(--font-display);color:#C62828;margin-bottom:8px">⚠️ Danger Zone</h4>
        <p style="font-size:13px;color:#9A7A5A;margin-bottom:16px">
          Reset all analytics data permanently. This removes every order record from the database.
          Use this to clear test orders before going live. <strong>This cannot be undone.</strong>
        </p>
        <button class="btn" style="background:#C62828;color:#fff;border:none;padding:10px 22px;border-radius:var(--r-sm);font-size:13px;cursor:pointer"
                onclick="confirmResetAnalytics()">
          🗑 Reset All Analytics Data
        </button>
      </div>`;

    // Load order log section
    await loadOrderLog();
  } catch (err) {
    el.innerHTML = `<div class="perm-notice">⚠️ Could not load analytics: ${err.message}</div>`;
  }
}

function renderAnalytics() { loadAndRenderAnalytics(); }  // alias

/* ── ORDER LOG ────────────────────────────────────────────── */
let _orderLogPage = 0;
const ORDER_LOG_PAGE_SIZE = 20;

async function loadOrderLog(page = 0) {
  _orderLogPage = page;
  const section = document.getElementById('order-log-section'); if (!section) return;
  section.innerHTML = `<div class="table-wrapper" style="padding:20px;margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h4 style="font-family:var(--font-display)">Completed & Cancelled Order Log</h4>
      <p style="font-size:12px;color:#BBA882">Admin only — remove test orders or dummy data</p>
    </div>
    <div class="empty-state"><div class="empty-state-icon" style="font-size:28px">⏳</div><p style="color:#BBA882;font-size:13px">Loading…</p></div>
  </div>`;

  try {
    const data = await apiFetch(
      `/analytics/orders?limit=${ORDER_LOG_PAGE_SIZE}&offset=${page * ORDER_LOG_PAGE_SIZE}`
    );
    const { orders, total_count } = data;
    const totalPages = Math.ceil(total_count / ORDER_LOG_PAGE_SIZE);

    section.innerHTML = `<div class="table-wrapper" style="padding:20px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <h4 style="font-family:var(--font-display)">Completed & Cancelled Order Log</h4>
          <p style="font-size:12px;color:#BBA882;margin-top:3px">${total_count} total records — Admin only</p>
        </div>
        ${totalPages > 1 ? `<div style="display:flex;gap:8px;align-items:center">
          <button class="act-btn" style="padding:5px 12px" ${page===0?'disabled':''} onclick="loadOrderLog(${page-1})">← Prev</button>
          <span style="font-size:12px;color:#9A7A5A">Page ${page+1} / ${totalPages}</span>
          <button class="act-btn" style="padding:5px 12px" ${page>=totalPages-1?'disabled':''} onclick="loadOrderLog(${page+1})">Next →</button>
        </div>` : ''}
      </div>
      ${orders.length === 0
        ? `<div class="empty-state" style="padding:20px 0"><p style="color:#BBA882;font-size:13px">No completed or cancelled orders yet.</p></div>`
        : `<div style="overflow-x:auto"><table class="data-table">
            <thead><tr>
              <th>Order #</th><th>Customer</th><th>Items</th>
              <th>Total</th><th>Payment</th><th>Status</th><th>Date</th>
              <th>Action</th>
            </tr></thead>
            <tbody>
              ${orders.map(o => `<tr id="log-row-${o.id}">
                <td><code style="font-size:11px">${o.order_number}</code></td>
                <td style="font-size:13px">${o.customer_name}</td>
                <td style="font-size:12px;color:#9A7A5A">${o.item_count} item${o.item_count!==1?'s':''}</td>
                <td style="font-weight:600;font-size:13px">${formatCurrency(o.total)}</td>
                <td><span class="${o.payment_method==='gcash'?'gcash-badge':'cash-badge'}" style="font-size:11px">${o.payment_method}</span></td>
                <td><span class="badge badge-${o.status}" style="font-size:11px">${capitalise(o.status)}</span></td>
                <td style="font-size:11px;color:#9A7A5A">${(()=>{ const d=_toManila(o.created_at); return d.toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Manila'}); })()}</td>
                <td><button class="act-btn act-cancel" style="padding:4px 10px;font-size:11px"
                            onclick="confirmDeleteOrderLog(${o.id},'${o.order_number}')">🗑 Remove</button></td>
              </tr>`).join('')}
            </tbody>
          </table></div>`}
    </div>`;
  } catch (err) {
    section.innerHTML = `<div class="perm-notice">⚠️ Could not load order log: ${err.message}</div>`;
  }
}

async function confirmDeleteOrderLog(dbId, orderNum) {
  if (!confirm(`Remove order ${orderNum} from logs?\n\nThis permanently deletes it from the database and will affect analytics totals.`)) return;
  try {
    await apiFetch(`/analytics/orders/${dbId}`, { method: 'DELETE' });
    showToast(`Order ${orderNum} removed from logs.`, 'success');
    // Reload both analytics summary and log
    loadAndRenderAnalytics();
  } catch (err) {
    showToast('Failed to remove order: ' + err.message, 'error');
  }
}

async function confirmResetAnalytics() {
  const confirmed = prompt(
    'WARNING: This will permanently delete ALL order data and reset analytics to zero.\n\n' +
    'This cannot be undone. Type "RESET" to confirm:'
  );
  if (confirmed !== 'RESET') {
    showToast('Reset cancelled.', 'info'); return;
  }
  try {
    await apiFetch('/analytics/reset', { method: 'DELETE' });
    showToast('All analytics data has been reset.', 'success');
    setTimeout(loadAndRenderAnalytics, 500);
  } catch (err) {
    showToast('Reset failed: ' + err.message, 'error');
  }
}

function _renderStatusBreakdown(byStatus, total) {
  const statuses = ['pending','preparing','ready','completed','cancelled'];
  const colors   = { pending:'#E65100', preparing:'#1565C0', ready:'#2E7D32', completed:'#6A1B9A', cancelled:'#C62828' };
  const t = total || 1;
  return `<div style="display:flex;flex-direction:column;gap:8px">${statuses.map(s => {
    const n = byStatus[s] || 0;
    const pct = Math.round(n / t * 100);
    return `<div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span>${capitalise(s)}</span><span style="font-weight:600">${n}</span>
      </div>
      <div style="background:var(--beige);border-radius:4px;height:6px">
        <div style="background:${colors[s]};width:${pct}%;height:100%;border-radius:4px;transition:width .5s"></div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

/* ══════════════════════════════════════════════════════════
   MENU MANAGER  — all CRUD via API, local arrays as cache
   ════════════════════════════════════════════════════════ */
function renderMenuManager() {
  if (!canManageMenu()) {
    document.getElementById('admin-menu').innerHTML =
      `<div class="perm-notice">⚠️ Only Admins can manage the menu. Staff can only edit orders in the queue.</div>`;
    return;
  }
  renderMenuGrid();
  renderCategoriesPanel();
  renderSizesPanel();
  renderToppingsPanel();
}

/* ── ITEM GRID ───────────────────────────────────────────── */
function renderMenuGrid(filter = '') {
  const grid = document.getElementById('admin-menu-grid'); if (!grid) return;
  const q = filter.toLowerCase();
  const items = q ? MENU_ITEMS.filter(i => i.name.toLowerCase().includes(q) || i.cat.toLowerCase().includes(q)) : MENU_ITEMS;
  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🧋</div><h4>No items yet</h4><p>Click "+ Add Item" to add your first menu item.</p></div>`;
    return;
  }
  grid.innerHTML = items.map(item => {
    const hv = item.varieties && item.varieties.length > 0;
    const priceLabel = hv ? `From ${formatCurrency(Math.min(...item.varieties.map(v => v.price)))}` : formatCurrency(item.basePrice);
    return `<div class="product-admin-card" id="pcard-${item.id}">
      <div class="product-admin-thumb">${drinkImg(item,'','width:100%;height:100%;object-fit:cover')}</div>
      <div class="product-admin-body">
        <h4>${item.name}</h4>
        <p style="font-size:11px;color:#9A7A5A;margin:3px 0 2px">${item.cat}</p>
        ${hv ? `<p style="font-size:10px;color:var(--teal);margin-bottom:4px">${item.varieties.length} varieties</p>` : ''}
        ${item.hasSizes ? `<p style="font-size:10px;color:var(--brown-light);margin-bottom:4px">Has sizes</p>` : ''}
        <div class="price">${priceLabel}</div>
        <label class="availability-toggle">
          <label class="toggle-switch">
            <input type="checkbox" ${item.available?'checked':''} onchange="toggleItemAvailability(${item.id},this.checked)">
            <span class="toggle-track"></span><span class="toggle-thumb"></span>
          </label>
          <span id="avail-label-${item.id}">${item.available?'Available':'Unavailable'}</span>
        </label>
        <div class="product-admin-actions">
          <button class="act-btn act-edit"   style="padding:7px 10px;font-size:12px" onclick="openEditItem(${item.id})">✏️ Edit</button>
          <button class="act-btn act-cancel" style="padding:7px 10px;font-size:12px" onclick="confirmRemoveItem(${item.id})">🗑 Remove</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function toggleItemAvailability(id, val) {
  const item = MENU_ITEMS.find(i => i.id === id); if (!item) return;
  item.available = val;
  document.getElementById(`avail-label-${id}`).textContent = val ? 'Available' : 'Unavailable';
  showToast(`${item.name} marked as ${val?'available':'unavailable'}.`, val?'success':'info');
  try {
    await apiFetch(`/menu/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: item.name, category_id: _getCatId(item.cat),
        description: item.desc, base_price: item.basePrice,
        image_url: item.image, emoji: item.emoji,
        is_bestseller: item.bestseller, is_available: val, has_sizes: item.hasSizes,
        varieties: item.varieties,
      }),
    });
  } catch (err) { showToast('API save failed: ' + err.message, 'error'); }
  if (App.currentView === 'menu') renderMenuPage(App.activeFilter);
  if (App.currentView === 'home') renderBestsellers();
}

function _getCatId(catName) {
  // Best effort — backend will validate; send 0 if not found and let server reject
  return 0;  // replaced by full object in openAddItem / saveItemForm flows
}

/* ── CATEGORIES ──────────────────────────────────────────── */
function renderCategoriesPanel() {
  const el = document.getElementById('admin-categories-list'); if (!el) return;
  if (MENU_CATEGORIES.length === 0) {
    el.innerHTML = `<p style="font-size:13px;color:#BBA882;padding:12px 0">No categories yet. Add one to start building your menu.</p>`;
    return;
  }
  el.innerHTML = MENU_CATEGORIES.map((cat, idx) => `
    <div class="manage-row">
      <span class="manage-row-name">${cat}</span>
      <div class="manage-row-actions">
        <button class="act-btn act-edit"   style="padding:5px 10px;font-size:12px" onclick="openEditCategory(${idx})">✏️</button>
        <button class="act-btn act-cancel" style="padding:5px 10px;font-size:12px" onclick="confirmRemoveCategory(${idx})">🗑</button>
      </div>
    </div>`).join('');
}

let _editingCatIdx = null;
let _catIdMap = {};  // name → db id

async function _refreshCategories() {
  try {
    const cats = await apiFetch('/menu/categories');
    MENU_CATEGORIES = cats.map(c => c.name);
    _catIdMap = {};
    cats.forEach(c => { _catIdMap[c.name] = c.id; });
  } catch (_) {}
}

function openAddCategory() {
  _editingCatIdx = null;
  document.getElementById('cat-modal-title').textContent = 'Add Category';
  document.getElementById('cat-form-name').value = '';
  openModal('cat-modal');
}
function openEditCategory(idx) {
  _editingCatIdx = idx;
  document.getElementById('cat-modal-title').textContent = 'Edit Category';
  document.getElementById('cat-form-name').value = MENU_CATEGORIES[idx] || '';
  openModal('cat-modal');
}
async function saveCategoryForm() {
  const name = document.getElementById('cat-form-name').value.trim();
  if (!name) { showToast('Category name required.', 'error'); return; }
  try {
    if (_editingCatIdx !== null) {
      const catId = _catIdMap[MENU_CATEGORIES[_editingCatIdx]];
      await apiFetch(`/menu/categories/${catId}`, { method: 'PUT', body: JSON.stringify({ name }) });
      showToast(`Category renamed to "${name}".`, 'success');
    } else {
      await apiFetch('/menu/categories', { method: 'POST', body: JSON.stringify({ name }) });
      showToast(`Category "${name}" added.`, 'success');
    }
    await _refreshCategories();
    closeModal('cat-modal');
    renderMenuManager();
    if (App.currentView === 'menu') renderMenuPage(App.activeFilter);
  } catch (err) { showToast(err.message, 'error'); }
}
async function confirmRemoveCategory(idx) {
  const name = MENU_CATEGORIES[idx];
  if (MENU_ITEMS.some(i => i.cat === name)) {
    showToast(`Cannot remove "${name}" — items still assigned.`, 'error'); return;
  }
  if (!confirm(`Remove category "${name}"?`)) return;
  try {
    const catId = _catIdMap[name];
    await apiFetch(`/menu/categories/${catId}`, { method: 'DELETE' });
    await _refreshCategories();
    showToast(`"${name}" removed.`, 'info');
    renderMenuManager();
    if (App.currentView === 'menu') renderMenuPage('All');
  } catch (err) { showToast(err.message, 'error'); }
}

/* ── SIZES ───────────────────────────────────────────────── */
function renderSizesPanel() {
  const el = document.getElementById('admin-sizes-list'); if (!el) return;
  if (GLOBAL_SIZES.length === 0) {
    el.innerHTML = `<p style="font-size:13px;color:#BBA882;padding:12px 0">No sizes yet. Sizes added here apply to drink items with "Enable Sizes" checked.</p>`;
    return;
  }
  el.innerHTML = GLOBAL_SIZES.map(s => `
    <div class="manage-row">
      <span class="manage-row-name">${s.label}</span>
      <span class="manage-row-price">${s.priceAdd > 0 ? '+₱' + s.priceAdd : 'Base'}</span>
      <div class="manage-row-actions">
        <button class="act-btn act-edit"   style="padding:5px 10px;font-size:12px" onclick="openEditGlobalSize(${s.id})">✏️</button>
        <button class="act-btn act-cancel" style="padding:5px 10px;font-size:12px" onclick="confirmRemoveGlobalSize(${s.id})">🗑</button>
      </div>
    </div>`).join('');
}

let _editingSizeId = null;
function openAddGlobalSize() {
  _editingSizeId = null;
  document.getElementById('gsize-modal-title').textContent = 'Add Size';
  document.getElementById('gsize-form-label').value = '';
  document.getElementById('gsize-form-priceadd').value = '0';
  openModal('gsize-modal');
}
function openEditGlobalSize(id) {
  const s = GLOBAL_SIZES.find(s => s.id === id); if (!s) return;
  _editingSizeId = id;
  document.getElementById('gsize-modal-title').textContent = 'Edit Size';
  document.getElementById('gsize-form-label').value = s.label;
  document.getElementById('gsize-form-priceadd').value = s.priceAdd;
  openModal('gsize-modal');
}
async function saveGlobalSizeForm() {
  const label    = document.getElementById('gsize-form-label').value.trim();
  const priceAdd = parseFloat(document.getElementById('gsize-form-priceadd').value) || 0;
  if (!label) { showToast('Size label required.', 'error'); return; }
  try {
    if (_editingSizeId !== null) {
      await apiFetch(`/menu/sizes/${_editingSizeId}`, { method: 'PUT', body: JSON.stringify({ label, price_add: priceAdd }) });
      showToast(`${label} updated.`, 'success');
    } else {
      await apiFetch('/menu/sizes', { method: 'POST', body: JSON.stringify({ label, price_add: priceAdd }) });
      showToast(`${label} added.`, 'success');
    }
    const sizes = await apiFetch('/menu/sizes');
    GLOBAL_SIZES = sizes.map(s => ({ id: s.id, label: s.label, priceAdd: parseFloat(s.price_add) }));
    closeModal('gsize-modal');
    renderSizesPanel();
  } catch (err) { showToast(err.message, 'error'); }
}
async function confirmRemoveGlobalSize(id) {
  const s = GLOBAL_SIZES.find(s => s.id === id); if (!s) return;
  if (!confirm(`Remove size "${s.label}"?`)) return;
  try {
    await apiFetch(`/menu/sizes/${id}`, { method: 'DELETE' });
    GLOBAL_SIZES = GLOBAL_SIZES.filter(s => s.id !== id);
    showToast(`${s.label} removed.`, 'info');
    renderSizesPanel();
  } catch (err) { showToast(err.message, 'error'); }
}

/* ── TOPPINGS ────────────────────────────────────────────── */
function renderToppingsPanel() {
  const el = document.getElementById('admin-toppings-list'); if (!el) return;
  if (TOPPINGS.length === 0) {
    el.innerHTML = `<p style="font-size:13px;color:#BBA882;padding:12px 0">No toppings yet.</p>`;
    return;
  }
  el.innerHTML = TOPPINGS.map(t => `
    <div class="manage-row">
      <span class="manage-row-emoji">${t.emoji || '•'}</span>
      <span class="manage-row-name">${t.name}</span>
      <span class="manage-row-price">₱${t.price}</span>
      <div class="manage-row-actions">
        <button class="act-btn act-edit"   style="padding:5px 10px;font-size:12px" onclick="openEditTopping(${t.id})">✏️</button>
        <button class="act-btn act-cancel" style="padding:5px 10px;font-size:12px" onclick="confirmRemoveTopping(${t.id})">🗑</button>
      </div>
    </div>`).join('');
}

let _editingToppingId = null;
function openAddTopping() {
  _editingToppingId = null;
  document.getElementById('topping-modal-title').textContent = 'Add Topping';
  ['topping-form-name','topping-form-emoji'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('topping-form-price').value = '15';
  openModal('topping-modal');
}
function openEditTopping(id) {
  const t = TOPPINGS.find(t => t.id === id); if (!t) return;
  _editingToppingId = id;
  document.getElementById('topping-modal-title').textContent = 'Edit Topping';
  document.getElementById('topping-form-name').value  = t.name;
  document.getElementById('topping-form-emoji').value = t.emoji || '';
  document.getElementById('topping-form-price').value = t.price;
  openModal('topping-modal');
}
async function saveToppingForm() {
  const name  = document.getElementById('topping-form-name').value.trim();
  const emoji = document.getElementById('topping-form-emoji').value.trim() || '•';
  const price = parseFloat(document.getElementById('topping-form-price').value);
  if (!name || isNaN(price) || price < 0) { showToast('Name and valid price required.', 'error'); return; }
  try {
    if (_editingToppingId !== null) {
      await apiFetch(`/menu/toppings/${_editingToppingId}`, { method: 'PUT', body: JSON.stringify({ name, emoji, price }) });
      showToast(`${name} updated.`, 'success');
    } else {
      await apiFetch('/menu/toppings', { method: 'POST', body: JSON.stringify({ name, emoji, price }) });
      showToast(`${name} added.`, 'success');
    }
    const tops = await apiFetch('/menu/toppings');
    TOPPINGS = tops.map(t => ({ id: t.id, name: t.name, emoji: t.emoji || '•', price: parseFloat(t.price) }));
    closeModal('topping-modal');
    renderToppingsPanel();
  } catch (err) { showToast(err.message, 'error'); }
}
async function confirmRemoveTopping(id) {
  const t = TOPPINGS.find(t => t.id === id); if (!t) return;
  if (!confirm(`Remove topping "${t.name}"?`)) return;
  try {
    await apiFetch(`/menu/toppings/${id}`, { method: 'DELETE' });
    TOPPINGS = TOPPINGS.filter(t => t.id !== id);
    showToast(`${t.name} removed.`, 'info');
    renderToppingsPanel();
  } catch (err) { showToast(err.message, 'error'); }
}

/* ── ADD / EDIT ITEM ─────────────────────────────────────── */
let _editingItemId     = null;
let _editingVarieties  = [];
let _pendingImgDataUrl = null;

function buildVarietiesUI(varieties) {
  const cont = document.getElementById('varieties-container'); if (!cont) return;
  _editingVarieties = varieties.map(v => ({ ...v }));
  cont.innerHTML = _editingVarieties.map((v, idx) => `
    <div class="variety-row" data-idx="${idx}">
      <input class="form-input" style="flex:1" type="text"   placeholder="e.g. Cheesy Fries" value="${v.name}"
             oninput="_editingVarieties[${idx}].name=this.value">
      <input class="form-input" style="width:110px" type="number" min="0" placeholder="Price ₱" value="${v.price}"
             oninput="_editingVarieties[${idx}].price=parseFloat(this.value)||0">
      <button type="button" style="background:#FFEBEE;color:#C62828;border:none;border-radius:var(--r-sm);padding:8px 10px;cursor:pointer;font-size:14px"
              onclick="removeVariety(${idx})">✕</button>
    </div>`).join('');
}
function addVariety()  { buildVarietiesUI([..._editingVarieties, {id:0, name:'', price:0}]); }
function removeVariety(idx) { _editingVarieties.splice(idx,1); buildVarietiesUI(_editingVarieties); }

function openAddItem() {
  if (MENU_CATEGORIES.length === 0) { showToast('Please add at least one category first.', 'error'); return; }
  _pendingImgDataUrl = null; _editingItemId = null;
  document.getElementById('item-modal-title').textContent = 'Add New Item';
  ['item-form-id','item-form-name','item-form-price','item-form-desc','item-form-image-url'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('item-form-bestseller').checked = false;
  document.getElementById('item-form-has-sizes').checked  = false;
  const preview = document.getElementById('item-form-image-preview');
  if (preview) preview.style.display = 'none';
  document.getElementById('item-form-cat').innerHTML = MENU_CATEGORIES.map(c => `<option>${c}</option>`).join('');
  buildVarietiesUI([]);
  openModal('item-modal');
}

function openEditItem(id) {
  if (MENU_CATEGORIES.length === 0) { showToast('Please add at least one category first.', 'error'); return; }
  const item = MENU_ITEMS.find(i => i.id === id); if (!item) return;
  _pendingImgDataUrl = null; _editingItemId = id;
  document.getElementById('item-modal-title').textContent = 'Edit Item';
  document.getElementById('item-form-id').value         = item.id;
  document.getElementById('item-form-name').value        = item.name;
  document.getElementById('item-form-price').value       = item.basePrice;
  document.getElementById('item-form-desc').value        = item.desc || '';
  document.getElementById('item-form-bestseller').checked = !!item.bestseller;
  document.getElementById('item-form-has-sizes').checked  = !!item.hasSizes;
  document.getElementById('item-form-image-url').value   = item.image || '';
  document.getElementById('item-form-cat').innerHTML     = MENU_CATEGORIES.map(c =>
    `<option${c === item.cat ? ' selected' : ''}>${c}</option>`).join('');
  const preview = document.getElementById('item-form-image-preview');
  if (preview && item.image) { preview.src = item.image; preview.style.display = 'block'; }
  else if (preview) preview.style.display = 'none';
  buildVarietiesUI(item.varieties || []);
  openModal('item-modal');
}

async function saveItemForm() {
  const name     = document.getElementById('item-form-name').value.trim();
  const catName  = document.getElementById('item-form-cat').value;
  const price    = parseFloat(document.getElementById('item-form-price').value);
  const desc     = document.getElementById('item-form-desc').value.trim();
  const best     = document.getElementById('item-form-bestseller').checked;
  const hasSizes = document.getElementById('item-form-has-sizes').checked;
  const urlVal   = document.getElementById('item-form-image-url').value.trim();
  const image    = _pendingImgDataUrl || urlVal || DEFAULT_IMG;
  const catId    = _catIdMap[catName] || null;

  if (!name || isNaN(price) || price < 0) { showToast('Name and valid price required.', 'error'); return; }
  if (!catId) { showToast('Invalid category. Please refresh and try again.', 'error'); return; }

  // Read varieties from DOM inputs (live values)
  const vRows = document.querySelectorAll('.variety-row');
  const varieties = [];
  vRows.forEach((row) => {
    const nameInp  = row.querySelector('input[type="text"]');
    const priceInp = row.querySelector('input[type="number"]');
    const vName = (nameInp?.value || '').trim();
    const vPrice = parseFloat(priceInp?.value) || 0;
    if (vName) varieties.push({ name: vName, price: vPrice });
  });

  const payload = {
    name, category_id: catId, description: desc, base_price: price,
    image_url: image, emoji: '🧋', is_bestseller: best, is_available: true,
    has_sizes: hasSizes, varieties,
  };

  try {
    if (_editingItemId !== null) {
      await apiFetch(`/menu/products/${_editingItemId}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast(`${name} updated.`, 'success');
    } else {
      await apiFetch('/menu/products', { method: 'POST', body: JSON.stringify(payload) });
      showToast(`${name} added!`, 'success');
    }
    _pendingImgDataUrl = null;
    closeModal('item-modal');
    await loadMenuFromAPI();
    renderMenuManager();
    if (App.currentView === 'menu') renderMenuPage(App.activeFilter);
    if (App.currentView === 'home') renderBestsellers();
  } catch (err) { showToast('Save failed: ' + err.message, 'error'); }
}

async function confirmRemoveItem(id) {
  const item = MENU_ITEMS.find(i => i.id === id); if (!item) return;
  if (!confirm(`Remove "${item.name}" from the menu?`)) return;
  try {
    await apiFetch(`/menu/products/${id}`, { method: 'DELETE' });
    showToast(`${item.name} removed.`, 'info');
    await loadMenuFromAPI();
    renderMenuManager();
    if (App.currentView === 'menu') renderMenuPage(App.activeFilter);
    if (App.currentView === 'home') renderBestsellers();
  } catch (err) { showToast(err.message, 'error'); }
}

function initImageUpload() {
  const input   = document.getElementById('item-form-image-file');
  const preview = document.getElementById('item-form-image-preview');
  const urlInp  = document.getElementById('item-form-image-url');
  if (!input) return;
  input.addEventListener('change', function() {
    const file = this.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image file.', 'error'); return; }
    if (file.size > 5 * 1024 * 1024)    { showToast('Image must be under 5MB.', 'error');   return; }
    const reader = new FileReader();
    reader.onload = e => {
      _pendingImgDataUrl = e.target.result;
      if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
      if (urlInp) urlInp.value = '';
      showToast('Image ready — click Save Item.', 'success');
    };
    reader.readAsDataURL(file);
  });
  urlInp?.addEventListener('input', function() {
    if (this.value.trim()) {
      _pendingImgDataUrl = null;
      if (preview) { preview.src = this.value.trim(); preview.style.display = 'block'; }
    }
  });
}

/* ══════════════════════════════════════════════════════════
   PROMO MANAGER — API-backed
   ════════════════════════════════════════════════════════ */
let _allPromos = [];

async function loadAndRenderPromos() {
  const el = document.getElementById('admin-promos-content'); if (!el) return;
  el.innerHTML = `<div class="empty-state"><div class="empty-state-icon" style="font-size:36px">⏳</div><p style="color:#BBA882">Loading promos…</p></div>`;
  try {
    _allPromos = await apiFetch('/menu/promos');
    el.innerHTML = `
      <div class="filter-bar" style="margin-bottom:20px">
        <h4 style="font-family:var(--font-display);font-size:18px">Active Promos</h4>
        <button class="btn btn-primary btn-sm" onclick="openAddPromo()">+ Add Promo</button>
      </div>
      ${_allPromos.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">🎉</div><h4>No promos yet</h4><p>Create a promo to attract more customers!</p></div>`
        : `<div style="display:flex;flex-direction:column;gap:14px">${_allPromos.map(promoCardHTML).join('')}</div>`}`;
  } catch (err) {
    el.innerHTML = `<div class="perm-notice">⚠️ Could not load promos: ${err.message}</div>`;
  }
}
function renderPromoManager() { loadAndRenderPromos(); }  // alias

function promoCardHTML(p) {
  const preview = (p.items || []).slice(0, 3).map(pi => {
    const m = MENU_ITEMS.find(m => m.id === pi.product_id); if (!m) return '';
    return `<span style="font-size:12px;background:var(--beige);padding:3px 8px;border-radius:var(--r-pill);margin-right:4px">
      ${m.name} → ${formatCurrency(pi.promo_price)}</span>`;
  }).join('');
  return `<div class="order-card" style="border-left:4px solid ${p.is_active?'var(--teal)':'var(--beige-mid)'}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="promo-ribbon" style="position:static">${p.badge||'Promo'}</span>
        <strong style="font-size:15px">${p.name}</strong>
      </div>
      <label class="availability-toggle" style="margin:0">
        <label class="toggle-switch">
          <input type="checkbox" ${p.is_active?'checked':''} onchange="togglePromo(${p.id},this.checked)">
          <span class="toggle-track"></span><span class="toggle-thumb"></span>
        </label>
        <span style="font-size:12px">${p.is_active?'Active':'Inactive'}</span>
      </label>
    </div>
    ${p.description ? `<p style="font-size:13px;color:#9A7A5A;margin-bottom:8px">${p.description}</p>` : ''}
    <div style="margin-bottom:10px">${preview}</div>
    <div class="product-admin-actions">
      <button class="act-btn act-edit"   style="padding:7px 12px;font-size:12px" onclick="openEditPromo(${p.id})">✏️ Edit</button>
      <button class="act-btn act-cancel" style="padding:7px 12px;font-size:12px" onclick="confirmRemovePromo(${p.id})">🗑 Remove</button>
    </div>
  </div>`;
}

async function togglePromo(id, val) {
  try {
    await apiFetch(`/menu/promos/${id}`, { method: 'PUT', body: JSON.stringify({ is_active: val }) });
    await loadAndRenderPromos();
    await loadMenuFromAPI();
  } catch (err) { showToast(err.message, 'error'); }
}
async function confirmRemovePromo(id) {
  const p = _allPromos.find(p => p.id === id);
  if (!p || !confirm(`Remove promo "${p.name}"?`)) return;
  try {
    await apiFetch(`/menu/promos/${id}`, { method: 'DELETE' });
    showToast('Promo removed.', 'info');
    loadAndRenderPromos();
  } catch (err) { showToast(err.message, 'error'); }
}

let _editingPromoId   = null;
let _editingPromoItems = [];

function openAddPromo() {
  _editingPromoId = null; _editingPromoItems = [];
  document.getElementById('promo-modal-title').textContent = 'Add Promo';
  ['promo-form-name','promo-form-badge','promo-form-desc'].forEach(id => document.getElementById(id).value = '');
  buildPromoItemsUI();
  openModal('promo-modal');
}
function openEditPromo(id) {
  const p = _allPromos.find(p => p.id === id); if (!p) return;
  _editingPromoId    = id;
  _editingPromoItems = JSON.parse(JSON.stringify(p.items || []));
  document.getElementById('promo-modal-title').textContent = 'Edit Promo';
  document.getElementById('promo-form-name').value  = p.name;
  document.getElementById('promo-form-badge').value = p.badge || '';
  document.getElementById('promo-form-desc').value  = p.description || '';
  buildPromoItemsUI();
  openModal('promo-modal');
}
function buildPromoItemsUI() {
  const cont = document.getElementById('promo-items-container'); if (!cont) return;
  cont.innerHTML = _editingPromoItems.map((pi, idx) => {
    const m = MENU_ITEMS.find(m => m.id === pi.product_id) || MENU_ITEMS[0];
    if (!m) return '';
    const hv = m?.varieties?.length > 0;
    const hs = m?.hasSizes && GLOBAL_SIZES.length > 0;
    return `<div class="promo-item-row" style="border:1px solid var(--beige);border-radius:var(--r-sm);padding:12px;margin-bottom:8px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div><label class="form-label">Item</label>
          <select class="form-select" onchange="updatePromoItem(${idx},'product_id',parseInt(this.value));buildPromoItemsUI()">
            ${MENU_ITEMS.map(m2 => `<option value="${m2.id}" ${m2.id===pi.product_id?'selected':''}>${m2.name}</option>`).join('')}
          </select></div>
        <div><label class="form-label">Promo Price (₱)</label>
          <input class="form-input" type="number" min="0" value="${pi.promo_price||0}" oninput="updatePromoItem(${idx},'promo_price',parseFloat(this.value)||0)"></div>
      </div>
      ${hv ? `<div style="margin-bottom:8px"><label class="form-label">Variety</label>
        <select class="form-select" onchange="updatePromoItem(${idx},'variety_id',this.value?parseInt(this.value):null)">
          <option value="">Any variety</option>
          ${m.varieties.map(v => `<option value="${v.id}" ${v.id===pi.variety_id?'selected':''}>${v.name}</option>`).join('')}
        </select></div>` : ''}
      ${hs ? `<div style="margin-bottom:8px"><label class="form-label">Size</label>
        <select class="form-select" onchange="updatePromoItem(${idx},'size_id',this.value?parseInt(this.value):null)">
          <option value="">Any size</option>
          ${GLOBAL_SIZES.map(s => `<option value="${s.id}" ${s.id===pi.size_id?'selected':''}>${s.label}</option>`).join('')}
        </select></div>` : ''}
      <button type="button" class="btn btn-danger btn-sm" onclick="removePromoItem(${idx})">✕ Remove Item</button>
    </div>`;
  }).join('');
  cont.innerHTML += `<button type="button" class="btn btn-outline btn-sm" style="width:100%;margin-top:4px" onclick="addPromoItem()">+ Add Item to Promo</button>`;
}
function addPromoItem()  { if (!MENU_ITEMS.length) { showToast('Add menu items first.','error'); return; } _editingPromoItems.push({product_id:MENU_ITEMS[0].id,variety_id:null,size_id:null,promo_price:0}); buildPromoItemsUI(); }
function removePromoItem(idx) { _editingPromoItems.splice(idx,1); buildPromoItemsUI(); }
function updatePromoItem(idx,field,val) { if (_editingPromoItems[idx]) _editingPromoItems[idx][field]=val; }

async function savePromoForm() {
  const name  = document.getElementById('promo-form-name').value.trim();
  const badge = document.getElementById('promo-form-badge').value.trim();
  const desc  = document.getElementById('promo-form-desc').value.trim();
  if (!name)                       { showToast('Promo name required.', 'error'); return; }
  if (_editingPromoItems.length === 0) { showToast('Add at least one item.', 'error');  return; }
  const payload = { name, badge, description: desc, is_active: true,
    items: _editingPromoItems.map(i => ({
      itemId: i.product_id, varietyId: i.variety_id || null,
      sizeId: i.size_id || null, promoPrice: i.promo_price,
    })) };
  try {
    if (_editingPromoId !== null) {
      await apiFetch(`/menu/promos/${_editingPromoId}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast(`Promo "${name}" updated.`, 'success');
    } else {
      await apiFetch('/menu/promos', { method: 'POST', body: JSON.stringify(payload) });
      showToast(`Promo "${name}" created!`, 'success');
    }
    closeModal('promo-modal');
    loadAndRenderPromos();
    await loadMenuFromAPI();
  } catch (err) { showToast(err.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════
   USERS — fetches from API
   ════════════════════════════════════════════════════════ */
let _editingUserId = null;
let _allUsers = [];

async function loadAndRenderUsers() {
  if (!canManageUsers()) {
    document.getElementById('admin-users').innerHTML = `<div class="perm-notice">⚠️ Only Admins can manage users.</div>`;
    return;
  }
  const tbody = document.getElementById('users-table-body'); if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#BBA882;padding:20px">Loading…</td></tr>`;
  try {
    _allUsers = await apiFetch('/users');
    tbody.innerHTML = _allUsers.map(u => `
      <tr>
        <td style="font-size:12px;color:#9A7A5A">#${u.id}</td>
        <td><strong>${u.name}</strong></td>
        <td style="color:var(--brown-light)">${u.email}</td>
        <td>${u.phone||'—'}</td>
        <td><span class="badge badge-${u.role}">${capitalise(u.role)}</span></td>
        <td><div style="display:flex;gap:6px">
          <button class="act-btn act-edit"   style="padding:5px 12px;font-size:12px" onclick="openEditUser(${u.id})">Edit</button>
          ${u.role !== 'admin' ? `<button class="act-btn act-cancel" style="padding:5px 12px;font-size:12px" onclick="removeUser(${u.id})">Remove</button>` : ''}
        </div></td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:#C62828;padding:12px">${err.message}</td></tr>`;
  }
}
function renderUsersTable() { loadAndRenderUsers(); }  // alias

function openAddUser() {
  _editingUserId = null;
  document.getElementById('user-modal-title').textContent = 'Add User';
  ['user-form-name','user-form-email','user-form-phone','user-form-pass'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('user-form-role').value = 'customer';
  document.getElementById('pass-hint').style.display = 'none';
  openModal('user-modal');
}
function openEditUser(id) {
  const user = _allUsers.find(u => u.id === id); if (!user) return;
  _editingUserId = id;
  document.getElementById('user-modal-title').textContent = 'Edit User';
  document.getElementById('user-form-name').value  = user.name;
  document.getElementById('user-form-email').value = user.email;
  document.getElementById('user-form-phone').value = user.phone || '';
  document.getElementById('user-form-role').value  = user.role;
  document.getElementById('user-form-pass').value  = '';
  document.getElementById('pass-hint').style.display = 'inline';
  openModal('user-modal');
}
async function saveUserForm() {
  const name  = document.getElementById('user-form-name').value.trim();
  const email = document.getElementById('user-form-email').value.trim();
  const phone = document.getElementById('user-form-phone').value.trim();
  const role  = document.getElementById('user-form-role').value;
  const pass  = document.getElementById('user-form-pass').value;
  if (!name || !email) { showToast('Name and email required.', 'error'); return; }
  try {
    if (_editingUserId !== null) {
      await apiFetch(`/users/${_editingUserId}`, { method: 'PUT', body: JSON.stringify({ name, email, phone, role, password: pass||undefined }) });
      showToast(`${name} updated.`, 'success');
    } else {
      if (!pass) { showToast('Password required for new users.', 'error'); return; }
      await apiFetch('/users', { method: 'POST', body: JSON.stringify({ name, email, phone, password: pass, role }) });
      showToast(`${name} added as ${role}.`, 'success');
    }
    closeModal('user-modal');
    loadAndRenderUsers();
  } catch (err) { showToast(err.message, 'error'); }
}
async function removeUser(id) {
  const user = _allUsers.find(u => u.id === id);
  if (!user || !confirm(`Remove user "${user.name}"?`)) return;
  try {
    await apiFetch(`/users/${id}`, { method: 'DELETE' });
    showToast(`${user.name} removed.`, 'info');
    loadAndRenderUsers();
  } catch (err) { showToast(err.message, 'error'); }
}

/* ── HELPERS ─────────────────────────────────────────────── */
function capitalise(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

/* ══════════════════════════════════════════════════════════
   SETTINGS PANEL  — logo upload, GCash number, shop name
   All persisted via /api/settings (admin only)
   ════════════════════════════════════════════════════════ */
let _logoDataUrl = null;    // pending new logo (before save)

async function loadAndRenderSettings() {
  // Load current GCash number from API
  try {
    const s = await apiFetch('/settings');
    if (s.gcash_number) {
      const gcashInput = document.getElementById('gcash-shop-number-setting');
      const gcashDisplay = document.getElementById('gcash-shop-number');
      if (gcashInput) gcashInput.value = s.gcash_number;
      if (gcashDisplay) gcashDisplay.textContent = s.gcash_number;
    }
    if (s.shop_name) {
      const shopInput = document.getElementById('settings-shop-name');
      if (shopInput) shopInput.value = s.shop_name;
    }
    // Load current logo preview
    await _loadLogoPreview();
  } catch (_) { /* non-critical */ }
}

async function _loadLogoPreview() {
  try {
    const data = await apiFetch('/settings/logo');
    if (data.logo) {
      _updateAllLogos(data.logo);
      const preview = document.getElementById('logo-current-preview');
      if (preview) { preview.src = data.logo; preview.style.display = 'block'; }
    }
  } catch (_) {}
}

function _updateAllLogos(dataUrl) {
  // Navbar logo
  document.querySelectorAll('.site-logo-img').forEach(img => { img.src = dataUrl; });
  // Admin sidebar logos (desktop + mobile drawer)
  document.querySelectorAll('.admin-sidebar-logo-img img').forEach(img => { img.src = dataUrl; });
  // Auth / login page logo
  document.querySelectorAll('.auth-logo-img').forEach(img => { img.src = dataUrl; });
}

function initLogoUpload() {
  const fileInput = document.getElementById('logo-upload-input');
  if (!fileInput) return;
  fileInput.addEventListener('change', function() {
    const file = this.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image file.', 'error'); return; }
    if (file.size > 2 * 1024 * 1024)    { showToast('Logo must be under 2MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      _logoDataUrl = e.target.result;
      const preview = document.getElementById('logo-upload-preview');
      if (preview) { preview.src = _logoDataUrl; preview.style.display = 'block'; }
      showToast('Logo ready — click "Save Settings" to apply.', 'success');
    };
    reader.readAsDataURL(file);
  });
}

async function saveSettings() {
  const shopName   = document.getElementById('settings-shop-name')?.value.trim();
  const gcashNum   = document.getElementById('gcash-shop-number-setting')?.value.trim();
  const updates    = {};

  if (shopName)  updates.shop_name    = shopName;
  if (gcashNum)  updates.gcash_number = gcashNum;
  if (_logoDataUrl) updates.logo_base64 = _logoDataUrl;

  if (Object.keys(updates).length === 0) {
    showToast('No changes to save.', 'info'); return;
  }

  try {
    await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(updates) });
    showToast('Settings saved!', 'success');

    // Apply logo immediately everywhere without page reload
    if (_logoDataUrl) {
      _updateAllLogos(_logoDataUrl);
      _logoDataUrl = null;
    }

    // Update GCash display
    if (gcashNum) {
      const gcashDisplay = document.getElementById('gcash-shop-number');
      if (gcashDisplay) gcashDisplay.textContent = gcashNum;
    }
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}
