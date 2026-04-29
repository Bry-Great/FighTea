/* ============================================================
   FighTea — Core State & API Layer  (data.js)  v6
   All data comes from the backend API — no dummy/sample data.
   ============================================================ */
'use strict';

/* ── CONFIG ──────────────────────────────────────────────── */
// Set this to your backend URL. Change before deploying.
// Development : 'http://localhost:4000/api'
// Production  : 'https://your-backend.vercel.app/api'
const API_BASE = window.FIGHTEA_API_BASE || 'https://backend-eight-vert-78.vercel.app/api';

/* ── APP STATE ───────────────────────────────────────────── */
const App = {
  currentUser:  null,
  currentView:  'home',
  cart:         [],
  activeFilter: 'All',
  orderCounter: 0,
};

/* ── LIVE DATA (fetched from API, never hardcoded) ───────── */
let MENU_CATEGORIES = [];
let GLOBAL_SIZES    = [];
let TOPPINGS        = [];
let PROMOS          = [];
let MENU_ITEMS      = [];
let ORDERS          = [];          // admin queue — fetched from API
let SIZE_ID_SEQ     = 1;
let TOPPING_ID_SEQ  = 1;
let PROMO_ID_SEQ    = 1;
let MENU_ID_SEQ     = 1;
let VARIETY_ID_SEQ  = 1;
let USER_ID_SEQ     = 2;

/* ── ICE OPTIONS (fixed, not from DB) ────────────────────── */
const ICE_OPTIONS = [
  { id:'normal', label:'Normal'   },
  { id:'less',   label:'Less Ice' },
  { id:'no',     label:'No Ice'   },
  { id:'warm',   label:'Warm'     },
];

/* ── DEFAULT IMAGE ───────────────────────────────────────── */
const DEFAULT_IMG = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop&q=80';

/* ══════════════════════════════════════════════════════════
   API HELPERS
   ════════════════════════════════════════════════════════ */

/** Make an authenticated or unauthenticated API request */
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('fightea_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `API error ${res.status}`), { status: res.status, data });
  return data;
}

/** Load entire menu (categories, products, sizes, toppings, promos) from API */
async function loadMenuFromAPI() {
  try {
    const [cats, products, sizes, toppings, promos] = await Promise.all([
      apiFetch('/menu/categories'),
      apiFetch('/menu/products'),
      apiFetch('/menu/sizes'),
      apiFetch('/menu/toppings'),
      apiFetch('/menu/promos'),
    ]);

    MENU_CATEGORIES = cats.map(c => c.name);

    // Populate the category ID map used by admin.js for API calls
    if (typeof _catIdMap !== 'undefined') {
      cats.forEach(c => { _catIdMap[c.name] = c.id; });
    }

    MENU_ITEMS = products.map(p => ({
      id:         p.id,
      cat:        p.category,
      name:       p.name,
      desc:       p.description || '',
      image:      p.image_url   || DEFAULT_IMG,
      emoji:      p.emoji       || '🧋',
      basePrice:  parseFloat(p.base_price),
      hasSizes:   !!p.has_sizes,
      varieties:  (p.varieties || []).map(v => ({
        id:    v.id,
        name:  v.name,
        price: parseFloat(v.price),
      })),
      sizes:      [],
      bestseller: !!p.is_bestseller,
      available:  !!p.is_available,
    }));

    GLOBAL_SIZES = sizes.map(s => ({
      id:       s.id,
      label:    s.label,
      priceAdd: parseFloat(s.price_add),
    }));
    SIZE_ID_SEQ = (sizes.length ? Math.max(...sizes.map(s => s.id)) : 0) + 1;

    TOPPINGS = toppings.map(t => ({
      id:    t.id,
      name:  t.name,
      emoji: t.emoji || '•',
      price: parseFloat(t.price),
    }));
    TOPPING_ID_SEQ = (toppings.length ? Math.max(...toppings.map(t => t.id)) : 0) + 1;

    PROMOS = promos.map(p => ({
      id:          p.id,
      name:        p.name,
      badge:       p.badge       || '',
      description: p.description || '',
      isActive:    !!p.is_active,
      items: (p.items || []).map(i => ({
        itemId:     i.product_id,
        varietyId:  i.variety_id  || null,
        sizeId:     i.size_id     || null,
        promoPrice: parseFloat(i.promo_price),
      })),
    }));
    PROMO_ID_SEQ = (promos.length ? Math.max(...promos.map(p => p.id)) : 0) + 1;

  } catch (err) {
    console.warn('loadMenuFromAPI failed:', err.message);
    // Graceful degradation — show empty menu rather than crashing
  }
}

/* ══════════════════════════════════════════════════════════
   SESSION / AUTH HELPERS
   ════════════════════════════════════════════════════════ */
function saveSession(userData) {
  App.currentUser = userData.user || userData;
  if (userData.token) localStorage.setItem('fightea_token', userData.token);
  try {
    localStorage.setItem('fightea_user', JSON.stringify(App.currentUser));
  } catch (_) {}
}

async function loadSession() {
  const token = localStorage.getItem('fightea_token');
  if (!token) return;
  try {
    const user = await apiFetch('/auth/me');
    App.currentUser = user;
    localStorage.setItem('fightea_user', JSON.stringify(user));
  } catch (_) {
    // Token expired or invalid — clear everything
    clearSession();
  }
}

function clearSession() {
  App.currentUser = null;
  localStorage.removeItem('fightea_token');
  localStorage.removeItem('fightea_user');
}

function isLoggedIn()    { return !!App.currentUser; }
function isAdmin()       { return App.currentUser && ['admin','staff'].includes(App.currentUser.role); }
function isStrictAdmin() { return App.currentUser && App.currentUser.role === 'admin'; }

function getAuthToken()  { return localStorage.getItem('fightea_token'); }

/* ── CART UTILS ──────────────────────────────────────────── */
function cartTotal() { return App.cart.reduce((s,i) => s + i.price * i.qty, 0); }
function cartCount() { return App.cart.reduce((s,i) => s + i.qty, 0); }

/* ── MENU UTILS ──────────────────────────────────────────── */
function formatCurrency(n) {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits:0, maximumFractionDigits:2 });
}
function getCurrentTime() {
  return new Date().toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit' });
}
function getCategories() { return ['All', ...MENU_CATEGORIES]; }

function drinkImg(item, cls='', style='') {
  const src = item.image || DEFAULT_IMG;
  const fb  = item.emoji || '🧋';
  return `<img src="${src}" alt="${item.name||''}" class="${cls}" style="${style}"` +
         ` onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" loading="lazy">` +
         `<span style="display:none;align-items:center;justify-content:center;font-size:48px;width:100%;height:100%">${fb}</span>`;
}

function getItemSizes(item) {
  if (!item.hasSizes) return [];
  if (item.sizes && item.sizes.length > 0) return item.sizes;
  return GLOBAL_SIZES.map(s => ({ sizeId: s.id, label: s.label, priceAdd: s.priceAdd }));
}

function getItemDisplayPrice(item) {
  if (item.varieties && item.varieties.length > 0) {
    return Math.min(...item.varieties.map(v => v.price));
  }
  return item.basePrice;
}

function getItemPromos(itemId) {
  return PROMOS.filter(p => p.isActive && p.items.some(pi => pi.itemId === itemId));
}

/* ── ORDER ID ────────────────────────────────────────────── */
function generateLocalOrderId() {
  App.orderCounter++;
  return 'FT-' + String(App.orderCounter).padStart(4, '0');
}

/* ── ADMIN ANALYTICS (uses API) ──────────────────────────── */
async function getAnalyticsFromAPI() {
  return apiFetch('/analytics/summary');
}

/* ── ADMIN QUEUE (uses API) ──────────────────────────────── */
async function fetchOrders(status = 'active') {
  const data = await apiFetch(`/orders?status=${status}`);
  // Normalise to the shape the queue UI expects
  return data.map(o => ({
    id:           o.order_number,
    dbId:         o.id,
    customer:     o.customer_name,
    phone:        o.customer_phone || '',
    status:       o.status,
    payment:      o.payment_method,
    paymentStatus:o.payment_status,
    gcashRef:     o.gcash_ref || null,
    total:        parseFloat(o.total),
    time:         new Date(o.created_at).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}),
    notes:        o.notes || '',
    items: (o.items || []).map(i => ({
      name:     i.product_name,
      emoji:    '🧋',
      variety:  null,
      size:     i.size_label || null,
      ice:      i.ice_label  || null,
      toppings: i.toppings   || [],
      qty:      i.quantity,
      price:    parseFloat(i.unit_price),
    })),
  }));
}

async function updateOrderStatusAPI(dbId, status) {
  return apiFetch(`/orders/${dbId}/status`, {
    method:  'PATCH',
    body:    JSON.stringify({ status }),
  });
}
