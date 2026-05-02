/* ============================================================
   FighTea — Main App Logic  (app.js)  v6
   All auth, orders, and menu data use real API calls.
   ============================================================ */
'use strict';

/* ── TOAST ───────────────────────────────────────────────── */
function showToast(msg, type='info') {
  const c = document.getElementById('toast-container'); if(!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateX(20px)';
    t.style.transition = 'all .3s';
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

/* ── VIEW ROUTING ────────────────────────────────────────── */
function showView(v) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  const target = document.getElementById('view-' + v);
  if (target) { target.classList.add('active'); App.currentView = v; window.scrollTo({top:0,behavior:'smooth'}); }
  updateNavState();
  closeMobileNav();
  if (v === 'menu')  { renderMenuPage(); }
  if (v === 'home')  { renderBestsellers(); }
  if (v === 'admin') { renderAdminDashboard(); }
  // Re-apply the saved logo whenever the Sign In page is shown
  if (v === 'auth' && typeof _updateAllLogos === 'function') {
    apiFetch('/settings/logo').then(data => {
      if (data && data.logo) _updateAllLogos(data.logo);
    }).catch(() => {});
  }
}

function updateNavState() {
  const area = document.getElementById('nav-auth-area'); if(!area) return;
  if (isLoggedIn()) {
    const first = (App.currentUser.name || '').split(',')[0].split(' ')[0];
    area.innerHTML = `
      <span style="font-size:13px;color:var(--brown-light)">Hi, ${first}</span>
      ${isAdmin() ? `<button class="btn btn-outline btn-sm" onclick="showView('admin')">Dashboard</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="logout()">Sign Out</button>`;
  } else {
    area.innerHTML = `
      <button class="navbar-link" onclick="showView('auth')">Sign In</button>
      <button class="btn btn-primary btn-sm" onclick="showView('auth')">Get Started</button>`;
  }
  // Bell visibility — only customers
  const bell = document.getElementById('notif-bell');
  if (bell) bell.style.display = (isLoggedIn() && !isAdmin()) ? 'flex' : 'none';
}

/* ── MOBILE NAV ──────────────────────────────────────────── */
function toggleMobileNav() {
  const nav = document.getElementById('mobile-nav');
  const ham = document.getElementById('hamburger-btn');
  const isOpen = nav.classList.toggle('open');
  ham.classList.toggle('open', isOpen);
  document.body.style.overflow = isOpen ? 'hidden' : '';
  if (isOpen) {
    const mAuth = document.getElementById('mobile-auth-btns');
    if (mAuth) {
      if (isLoggedIn()) {
        const first = (App.currentUser.name || '').split(',')[0].split(' ')[0];
        mAuth.innerHTML = `
          <span style="font-size:13px;color:var(--brown-light);padding:8px 16px">Hi, ${first}</span>
          ${isAdmin() ? `<button class="mobile-nav-link" onclick="showView('admin')">📊 Dashboard</button>` : ''}
          <button class="mobile-nav-link" onclick="logout()" style="color:#C62828">🚪 Sign Out</button>`;
      } else {
        mAuth.innerHTML = `
          <button class="btn btn-outline btn-full" onclick="showView('auth')">Sign In</button>
          <button class="btn btn-primary btn-full" onclick="showView('auth')">Get Started</button>`;
      }
    }
  }
}
function closeMobileNav() {
  document.getElementById('mobile-nav')?.classList.remove('open');
  document.getElementById('hamburger-btn')?.classList.remove('open');
  document.body.style.overflow = '';
}

/* ── ADMIN MOBILE DRAWER ─────────────────────────────────── */
function toggleAdminMobileMenu() {
  document.getElementById('admin-mobile-drawer')?.classList.toggle('open');
  document.getElementById('admin-mobile-backdrop')?.classList.toggle('open');
}
function closeAdminMobileMenu() {
  document.getElementById('admin-mobile-drawer')?.classList.remove('open');
  document.getElementById('admin-mobile-backdrop')?.classList.remove('open');
}

/* ══════════════════════════════════════════════════════════
   AUTH  — all calls go to the real backend API
   ════════════════════════════════════════════════════════ */
function initAuth() {
  /* LOGIN */
  document.getElementById('login-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn   = this.querySelector('[type="submit"]');
    // Normalize email: trim whitespace and lowercase — ensures exact full-email match on backend
    const email = this.querySelector('[name="email"]').value.trim().toLowerCase();
    const pass  = this.querySelector('[name="password"]').value;
    if (!email || !pass) { showToast('Please enter your email and password.', 'error'); return; }
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body:   JSON.stringify({ email, password: pass }),
      });
      saveSession(data);
      showToast(`Welcome back, ${data.user.name.split(',')[0]}! ☕`, 'success');
      if (typeof startNotifications === 'function') startNotifications();
      await loadMenuFromAPI();
      setTimeout(() => isAdmin() ? showView('admin') : showView('home'), 400);
    } catch (err) {
      showToast(err.message || 'Invalid email or password.', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Sign In →';
    }
  });

  /* REGISTER */
  document.getElementById('signup-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn  = this.querySelector('[type="submit"]');
    const name = this.querySelector('[name="name"]').value.trim();
    // Normalize email on registration too — prevents case-variation duplicates
    const email= this.querySelector('[name="email"]').value.trim().toLowerCase();
    const phone= this.querySelector('[name="phone"]').value.trim();
    const pass = this.querySelector('[name="password"]').value;
    const conf = this.querySelector('[name="confirm"]').value;
    if (pass !== conf) { showToast('Passwords do not match.', 'error'); return; }
    if (pass.length < 8) { showToast('Password must be at least 8 characters.', 'error'); return; }
    btn.disabled = true; btn.textContent = 'Creating account…';
    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        body:   JSON.stringify({ name, email, phone, password: pass }),
      });
      // Auto-login after registration
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body:   JSON.stringify({ email, password: pass }),
      });
      saveSession(data);
      if (typeof startNotifications === 'function') startNotifications();
      await loadMenuFromAPI();
      showToast(`Welcome to FighTea, ${name.split(' ')[0]}! 🧋`, 'success');
      setTimeout(() => showView('home'), 400);
    } catch (err) {
      showToast(err.message || 'Registration failed. Please try again.', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Create Account →';
    }
  });
}

function logout() {
  if (typeof stopNotifications === 'function') stopNotifications();
  if (typeof stopQueuePolling  === 'function') stopQueuePolling();
  clearSession();
  App.cart = [];
  updateCartBadge();
  MENU_ITEMS = []; MENU_CATEGORIES = []; GLOBAL_SIZES = []; TOPPINGS = []; PROMOS = [];
  showView('home');
  showToast('You have been signed out.', 'info');
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('login-form').style.display  = tab === 'login'  ? 'block' : 'none';
  document.getElementById('signup-form').style.display = tab === 'signup' ? 'block' : 'none';
}

/* ══════════════════════════════════════════════════════════
   MENU RENDERING
   ════════════════════════════════════════════════════════ */
function renderBestsellers() {
  const el = document.getElementById('bestsellers-grid'); if(!el) return;
  const items = MENU_ITEMS.filter(i => i.bestseller && i.available);
  el.innerHTML = items.length
    ? items.map(menuCardHTML).join('')
    : `<div class="empty-state" style="grid-column:1/-1">
         <div class="empty-state-icon" style="font-size:40px;opacity:.35">🧋</div>
         <p style="color:#BBA882">No featured drinks yet — check back soon!</p>
       </div>`;
}

async function renderMenuPage(filterCat) {
  // Load menu data from API if not yet loaded
  if (MENU_ITEMS.length === 0) {
    await loadMenuFromAPI();
  }
  const cat = filterCat || App.activeFilter || 'All';
  App.activeFilter = cat;
  const pillsEl = document.getElementById('menu-cat-pills');
  if (pillsEl) {
    pillsEl.innerHTML = getCategories()
      .map(c => `<button class="cat-pill${c===cat?' active':''}" onclick="renderMenuPage('${c}')">${c}</button>`)
      .join('');
  }
  const gridEl = document.getElementById('menu-items-grid'); if(!gridEl) return;
  const items = cat === 'All' ? MENU_ITEMS : MENU_ITEMS.filter(i => i.cat === cat);
  if (MENU_ITEMS.length === 0) {
    gridEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🧋</div>
      <h4>Menu coming soon!</h4>
      <p>Our team is setting up the menu. Check back shortly.</p>
    </div>`;
  } else if (items.length === 0) {
    gridEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🧋</div>
      <h4>No items in this category yet.</h4>
    </div>`;
  } else {
    gridEl.innerHTML = items.map(menuCardHTML).join('');
  }
}

function menuCardHTML(item) {
  const displayPrice = getItemDisplayPrice(item);
  const priceLabel   = item.varieties && item.varieties.length > 0
    ? `From ${formatCurrency(displayPrice)}`
    : formatCurrency(displayPrice);
  const activePromos = getItemPromos(item.id);
  const promoBadge   = activePromos.length > 0
    ? `<span class="promo-ribbon">${activePromos[0].badge || 'Promo'}</span>`
    : '';
  return `<div class="menu-card animate-in${!item.available?' unavailable':''}"
               onclick="${item.available ? `openCustomize(${item.id})` : ''}">
    <div class="menu-card-thumb">
      ${item.bestseller ? '<span class="bestseller-ribbon">⭐ Best Seller</span>' : ''}
      ${promoBadge}
      ${!item.available ? '<span class="unavail-tag">Unavailable</span>' : ''}
      ${drinkImg(item,'','width:100%;height:100%;object-fit:cover')}
    </div>
    <div class="menu-card-body">
      <h4>${item.name}</h4>
      <p>${item.desc || ''}</p>
      <div class="menu-card-footer">
        <span class="menu-price">${priceLabel}</span>
        <button class="menu-add-btn" ${!item.available?'disabled':''}
          onclick="event.stopPropagation();${item.available?`openCustomize(${item.id})`:''}"
          aria-label="Add ${item.name}">+</button>
      </div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════
   CUSTOMIZE MODAL
   ════════════════════════════════════════════════════════ */
let customState = {};

function openCustomize(itemId) {
  if (!isLoggedIn()) { showToast('Please sign in to place an order.', 'info'); showView('auth'); return; }
  const item = MENU_ITEMS.find(i => i.id === itemId);
  if (!item || !item.available) return;

  const sizes        = getItemSizes(item);
  const hasVarieties = item.varieties && item.varieties.length > 0;
  const hasSizes     = item.hasSizes && sizes.length > 0;
  const isIceItem    = !['Rice Meals','Fries','Burgers','Snacks','Pasta','Sides','Food'].includes(item.cat);

  customState = {
    item,
    selectedVariety: hasVarieties ? item.varieties[0] : null,
    selectedSize:    hasSizes     ? sizes[0]          : null,
    selectedIce:     isIceItem    ? ICE_OPTIONS[0]    : null,
    toppings: [],
    qty: 1,
    isPromo: false,
    selectedPromo: null,
  };

  // Header
  const headerEl = document.getElementById('modal-drink-header');
  if (headerEl) {
    headerEl.innerHTML = `
      <div class="modal-drink-thumb">${drinkImg(item,'','width:100%;height:100%;object-fit:cover')}</div>
      <div>
        <h3>${item.name}</h3>
        <p style="font-size:13px;color:#9A7A5A;margin-top:3px">${item.cat}</p>
      </div>`;
  }

  // Varieties
  const varSec = document.getElementById('modal-varieties-section');
  if (hasVarieties) {
    varSec.style.display = 'block';
    document.getElementById('modal-varieties').innerHTML = item.varieties.map(v =>
      `<button class="opt-chip${v.id===customState.selectedVariety?.id?' active':''}"
               data-group="cust-variety" onclick="selectVariety(this,${v.id})">
         ${v.name} — ${formatCurrency(v.price)}
       </button>`
    ).join('');
  } else { varSec.style.display = 'none'; }

  // Sizes
  const sizeSec = document.getElementById('modal-sizes-section');
  if (hasSizes && !hasVarieties) {
    sizeSec.style.display = 'block';
    document.getElementById('modal-sizes').innerHTML = sizes.map((s, i) =>
      `<button class="opt-chip${i===0?' active':''}"
               data-group="cust-size" onclick="selectSize(this,'${s.sizeId||s.id||i}')">
         ${s.label}${s.priceAdd > 0 ? ` +₱${s.priceAdd}` : ''}
       </button>`
    ).join('');
  } else { sizeSec.style.display = 'none'; }

  // Ice
  const iceSec = document.getElementById('modal-ice-section');
  if (isIceItem) {
    iceSec.style.display = 'block';
    document.getElementById('modal-ice').innerHTML = ICE_OPTIONS.map(s =>
      `<button class="opt-chip${s.id==='normal'?' active':''}"
               data-group="cust-ice" onclick="selectIce(this,'${s.id}')">${s.label}</button>`
    ).join('');
  } else { iceSec.style.display = 'none'; }

  // Toppings
  const topSec = document.getElementById('modal-toppings-section');
  const topEl  = document.getElementById('modal-toppings');
  if (TOPPINGS.length === 0) {
    topSec.style.display = 'none';
  } else {
    topSec.style.display = 'block';
    topEl.innerHTML = TOPPINGS.map(t =>
      `<button class="topping-chip" data-topping-id="${t.id}" onclick="toggleTopping(this,${t.id})">
         ${t.emoji || '•'} ${t.name}
         <span style="margin-left:auto;font-size:11px;opacity:.6">+₱${t.price}</span>
       </button>`
    ).join('');
  }

  // Promos
  const activePromos = getItemPromos(itemId);
  const promoSec = document.getElementById('modal-promos-section');
  if (activePromos.length > 0) {
    promoSec.style.display = 'block';
    document.getElementById('modal-promos').innerHTML =
      `<label class="topping-chip" style="cursor:pointer;margin-bottom:8px">
         <input type="checkbox" id="promo-none-cb" style="margin-right:8px" checked onchange="selectPromo(null)">
         No promo (regular price)
       </label>` +
      activePromos.map(p =>
        `<label class="topping-chip" style="cursor:pointer">
           <input type="checkbox" class="promo-cb" data-promo-id="${p.id}" style="margin-right:8px" onchange="selectPromo(${p.id})">
           ${p.badge ? `<span class="promo-ribbon" style="position:static;margin-right:6px">${p.badge}</span>` : ''}
           ${p.name}
           ${p.description ? `<span style="font-size:11px;color:#9A7A5A;margin-left:6px">— ${p.description}</span>` : ''}
         </label>`
      ).join('');
  } else { promoSec.style.display = 'none'; }

  document.getElementById('modal-qty').textContent = '1';
  updateModalPrice();
  openModal('customize-modal');
}

function selectVariety(btn, varId) {
  document.querySelectorAll('[data-group="cust-variety"]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  customState.selectedVariety = customState.item.varieties.find(v => v.id === varId);
  customState.selectedSize    = null;
  updateModalPrice();
}
function selectSize(btn, sizeKey) {
  document.querySelectorAll('[data-group="cust-size"]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const sizes = getItemSizes(customState.item);
  customState.selectedSize = sizes.find(s => (s.sizeId||s.id||'') === sizeKey) || sizes[0];
  updateModalPrice();
}
function selectIce(btn, iceId) {
  document.querySelectorAll('[data-group="cust-ice"]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  customState.selectedIce = ICE_OPTIONS.find(s => s.id === iceId);
}
function toggleTopping(btn, toppingId) {
  btn.classList.toggle('active');
  const t = TOPPINGS.find(t => t.id === toppingId);
  const idx = customState.toppings.findIndex(x => x.id === toppingId);
  if (idx > -1) customState.toppings.splice(idx, 1);
  else           customState.toppings.push({...t});
  updateModalPrice();
}
function selectPromo(promoId) {
  document.querySelectorAll('.promo-cb').forEach(cb => cb.checked = false);
  document.getElementById('promo-none-cb').checked = !promoId;
  if (promoId) {
    const cb = document.querySelector(`.promo-cb[data-promo-id="${promoId}"]`);
    if (cb) cb.checked = true;
    customState.selectedPromo = PROMOS.find(p => p.id === promoId) || null;
    customState.isPromo = true;
  } else {
    customState.selectedPromo = null;
    customState.isPromo = false;
  }
  updateModalPrice();
}
function changeQty(delta) {
  customState.qty = Math.max(1, customState.qty + delta);
  document.getElementById('modal-qty').textContent = customState.qty;
  updateModalPrice();
}

function calcUnitPrice() {
  const item = customState.item;
  let base = item.basePrice;
  if (customState.selectedVariety) base = customState.selectedVariety.price;
  else if (customState.selectedSize) base = item.basePrice + (customState.selectedSize.priceAdd || 0);
  // Promo override
  if (customState.isPromo && customState.selectedPromo) {
    const promo  = customState.selectedPromo;
    const varId  = customState.selectedVariety?.id ?? null;
    const sizeId = customState.selectedSize?.sizeId ?? customState.selectedSize?.id ?? null;
    const match  = promo.items.find(pi =>
      pi.itemId === item.id &&
      (pi.varietyId === varId || pi.varietyId == null) &&
      (pi.sizeId    === sizeId || pi.sizeId == null)
    );
    if (match && match.promoPrice != null) base = match.promoPrice;
  }
  base += customState.toppings.reduce((s, t) => s + t.price, 0);
  return base;
}
function updateModalPrice() {
  const total = calcUnitPrice() * customState.qty;
  const el = document.getElementById('modal-total');
  if (el) el.textContent = formatCurrency(total);
  return total;
}

function addToCartFromModal() {
  const unit = calcUnitPrice();
  App.cart.push({
    id:      Date.now() + Math.random(),
    itemId:  customState.item.id,
    name:    customState.item.name,
    emoji:   customState.item.emoji,
    image:   customState.item.image,
    variety: customState.selectedVariety?.name  || null,
    size:    customState.selectedSize?.label    || null,
    ice:     customState.selectedIce?.label     || null,
    toppings: customState.toppings.map(t => t.name),
    promo:   customState.isPromo && customState.selectedPromo ? customState.selectedPromo.name : null,
    qty:     customState.qty,
    price:   unit,
  });
  updateCartBadge();
  closeModal('customize-modal');
  showToast(`${customState.item.name} added to cart! 🧋`, 'success');
  customState = {};
}

/* ══════════════════════════════════════════════════════════
   CART
   ════════════════════════════════════════════════════════ */
function updateCartBadge() {
  const n = cartCount();
  document.querySelectorAll('.cart-count').forEach(el => el.textContent = n);
}
function openCart()  { renderCart(); document.getElementById('cart-drawer').classList.add('open');    document.getElementById('cart-backdrop').classList.add('open');    }
function closeCart() {               document.getElementById('cart-drawer').classList.remove('open'); document.getElementById('cart-backdrop').classList.remove('open'); }

function renderCart() {
  const listEl  = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-grand-total');
  if (!listEl) return;
  if (App.cart.length === 0) {
    listEl.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">🧋</div>
      <h4>Your cart is empty</h4>
      <p>Browse our menu and add some items!</p>
    </div>`;
  } else {
    listEl.innerHTML = App.cart.map(item => {
      const opts    = [item.variety, item.size, item.ice].filter(Boolean).join(' · ');
      const tops    = item.toppings && item.toppings.length ? item.toppings.join(', ') : '';
      const promoTag = item.promo
        ? `<span class="promo-ribbon" style="position:static;font-size:10px;margin-left:4px">${item.promo}</span>`
        : '';
      return `<div class="cart-item">
        <div class="cart-item-img">
          <img src="${item.image || DEFAULT_IMG}" alt="${item.name}"
               style="width:100%;height:100%;object-fit:cover"
               onerror="this.parentElement.innerHTML='<span style=\\"font-size:24px;display:flex;align-items:center;justify-content:center;width:100%;height:100%\\">${item.emoji||'🧋'}</span>'"
               loading="lazy">
        </div>
        <div class="cart-item-info">
          <h5>${item.name} × ${item.qty} ${promoTag}</h5>
          <p>${[opts, tops].filter(Boolean).join(' · ') || 'Regular'}</p>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
          <span class="cart-item-price">${formatCurrency(item.price * item.qty)}</span>
          <button class="cart-remove-btn" onclick="removeFromCart(${item.id})">✕</button>
        </div>
      </div>`;
    }).join('');
  }
  if (totalEl) totalEl.textContent = formatCurrency(cartTotal());
}
function removeFromCart(id) {
  App.cart = App.cart.filter(i => i.id !== id);
  updateCartBadge(); renderCart();
  showToast('Item removed.', 'info');
}

/* ══════════════════════════════════════════════════════════
   CHECKOUT — sends order to real API
   ════════════════════════════════════════════════════════ */
let selectedPayment = 'cash';

function openCheckout() {
  if (App.cart.length === 0) { showToast('Your cart is empty!', 'error'); return; }
  closeCart();
  document.getElementById('checkout-total').textContent = formatCurrency(cartTotal());
  selectPaymentMethod('cash');
  openModal('checkout-modal');
}
function selectPaymentMethod(method) {
  selectedPayment = method;
  document.querySelectorAll('.payment-card').forEach(c => c.classList.toggle('active', c.dataset.method === method));
  const gcash = document.getElementById('gcash-fields');
  if (gcash) gcash.style.display = method === 'gcash' ? 'block' : 'none';
}
function openGCashApp() {
  const total = cartTotal();
  window.location = `gcash://pay?amount=${total}&merchant=${encodeURIComponent('FighTea')}&note=${encodeURIComponent('FighTea Order')}`;
  setTimeout(() => {
    showToast('GCash app not found. Please send payment manually.', 'info');
    document.getElementById('gcash-manual-section').style.display = 'block';
  }, 1500);
}

async function placeOrder() {
  if (App.cart.length === 0)  { showToast('Your cart is empty!', 'error'); return; }
  if (!isLoggedIn())           { showToast('Please sign in first.', 'info'); showView('auth'); return; }
  const gcashRef = selectedPayment === 'gcash'
    ? document.getElementById('gcash-ref-input')?.value.trim()
    : null;
  if (selectedPayment === 'gcash' && !gcashRef) {
    showToast('Please enter your GCash reference number.', 'error'); return;
  }

  const btn = document.getElementById('place-order-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Placing order…'; }

  try {
    const payload = {
      items: App.cart.map(i => ({
        product_id:  i.itemId,
        name:        i.name,
        size:        i.size      || null,
        size_price:  i.size      ? (GLOBAL_SIZES.find(s => s.label === i.size)?.priceAdd || 0) : 0,
        ice:         i.ice       || null,
        toppings:    i.toppings.map(name => {
          const t = TOPPINGS.find(t => t.name === name);
          return { name, price: t?.price || 15 };
        }),
        qty:        i.qty,
        unit_price: i.price,
        line_total: i.price * i.qty,
      })),
      payment_method: selectedPayment,
      gcash_ref:      gcashRef || null,
      notes:          document.getElementById('order-notes')?.value || '',
    };

    const data = await apiFetch('/orders', { method: 'POST', body: JSON.stringify(payload) });

    // Show confirmation
    document.getElementById('confirm-order-id').textContent    = data.order_number;
    document.getElementById('confirm-order-total').textContent = formatCurrency(data.total);
    document.getElementById('confirm-payment').textContent     = selectedPayment === 'gcash'
      ? `GCash — Ref: ${gcashRef}`
      : 'Cash on pickup';

    App.cart = [];
    updateCartBadge();
    closeModal('checkout-modal');
    openModal('order-confirm-modal');

    // If admin dashboard queue is open, silently add the new order card immediately
    if (typeof _silentRefreshQueue === 'function' && App.currentView === 'admin') {
      setTimeout(_silentRefreshQueue, 500);
    }

  } catch (err) {
    showToast(err.message || 'Order failed. Please try again.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Place Order →'; }
  }
}

/* ── MODALS ──────────────────────────────────────────────── */
function openModal(id)  { document.getElementById(id)?.classList.add('open');    }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

/* ══════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Restore session from saved JWT
  await loadSession();
  updateNavState();
  initAuth();

  // Load menu data (public — no auth needed)
  await loadMenuFromAPI();
  renderBestsellers();

  // If already logged in (page refresh), start notifications
  if (isLoggedIn() && typeof startNotifications === 'function') {
    startNotifications();
  }

  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('open'); });
  });
  document.getElementById('cart-backdrop')?.addEventListener('click', closeCart);
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
  });
  selectPaymentMethod('cash');
  window.addEventListener('resize', () => { if (window.innerWidth > 767) closeMobileNav(); });
});
