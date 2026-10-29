// Common utilities, auth helpers, navigation, food photography, and toast system for BiteFleet

function getToken() {
  return localStorage.getItem('token') || '';
}

function getUser() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch (error) {
    console.error('Token parsing error:', error);
    return null;
  }
}

function getAuthHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('cart');
  sessionStorage.clear();
  window.location.href = (window.location.pathname.includes('/customer/') || window.location.pathname.includes('/admin/'))
    ? '../login.html'
    : 'login.html';
}

function protect(roleRequired) {
  const user = getUser();
  const isInSubdir = window.location.pathname.includes('/customer/') || window.location.pathname.includes('/admin/');
  const loginPath = isInSubdir ? '../login.html' : 'login.html';

  if (!user) {
    window.location.href = loginPath;
    return false;
  }

  if (roleRequired && user.role !== roleRequired) {
    alert(`Access denied. This page is restricted to ${roleRequired}s only.`);
    window.location.href = user.role === 'admin'
      ? (isInSubdir ? '../admin/dashboard.html' : 'admin/dashboard.html')
      : (isInSubdir ? '../customer/menu.html' : 'customer/menu.html');
    return false;
  }
  return true;
}

// Toast notification system
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' 
    ? '<i class="fas fa-check-circle" style="color: #22c55e;"></i>' 
    : (type === 'error' ? '<i class="fas fa-exclamation-circle" style="color: #ef4444;"></i>' : '<i class="fas fa-info-circle" style="color: #0284c7;"></i>');
  toast.innerHTML = `<span>${icon}</span><span style="flex: 1;">${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// Sync cart item badge with database
async function updateCartCount() {
  const token = getToken();
  const badges = document.querySelectorAll('.cart-badge, .cart-count');
  if (!badges.length) return;

  if (!token) {
    badges.forEach(b => {
      b.textContent = '0';
      b.style.display = 'none';
    });
    return;
  }

  try {
    const res = await fetch('/api/orders/cart', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      const count = data.items ? data.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
      badges.forEach(b => {
        b.textContent = count;
        b.style.display = count > 0 ? 'inline-flex' : 'none';
      });
    }
  } catch (err) {
    // Ignore network error on badge poll
  }
}

// Add item to cart through backend API
async function addToCartApi(menuId, quantity = 1) {
  const token = getToken();
  if (!token) {
    showToast('Please log in to add items to your cart', 'info');
    const isInSubdir = window.location.pathname.includes('/customer/') || window.location.pathname.includes('/admin/');
    setTimeout(() => {
      window.location.href = isInSubdir ? '../login.html' : 'login.html';
    }, 1200);
    return false;
  }

  try {
    const res = await fetch('/api/orders/add-to-cart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ menuId, quantity })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || 'Failed to add item to cart', 'error');
      return false;
    }

    showToast(data.message || 'Item added to cart!', 'success');
    updateCartCount();
    return true;
  } catch (err) {
    console.error('Add to cart error:', err);
    showToast('Network error while adding to cart.', 'error');
    return false;
  }
}

// Toggle favourite item in database
async function toggleFavouriteApi(menuId, btnElement) {
  const token = getToken();
  if (!token) {
    showToast('Please log in to save favourites', 'info');
    return false;
  }

  const isFav = btnElement.classList.contains('active');
  const method = isFav ? 'DELETE' : 'POST';

  try {
    const res = await fetch(`/api/favourites/${menuId}`, {
      method,
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    if (res.ok) {
      if (isFav) {
        btnElement.classList.remove('active');
        btnElement.innerHTML = '<i class="far fa-heart"></i>';
        showToast('Removed from favourites', 'info');
      } else {
        btnElement.classList.add('active');
        btnElement.innerHTML = '<i class="fas fa-heart" style="color: #dc2626;"></i>';
        showToast('Saved to your favourites', 'success');
      }
      return true;
    } else {
      showToast(data.message || 'Could not update favourite', 'error');
      return false;
    }
  } catch (err) {
    showToast('Error updating favourites', 'error');
    return false;
  }
}

// ===== REAL FOOD PHOTOGRAPHY ASSETS & FALLBACKS =====
const FALLBACK_FOOD_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300' width='400' height='300'%3E%3Cdefs%3E%3ClinearGradient id='bfg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23fff7ed'/%3E%3Cstop offset='100%25' stop-color='%23fed7aa'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='300' fill='url(%23bfg)'/%3E%3Ccircle cx='200' cy='140' r='54' fill='%23ea580c' fill-opacity='0.12'/%3E%3Cpath d='M160 150 C 160 120, 240 120, 240 150 Z' fill='%23ea580c'/%3E%3Crect x='150' y='154' width='100' height='6' rx='3' fill='%23c2410c'/%3E%3Ccircle cx='200' cy='116' r='6' fill='%23ea580c'/%3E%3Ctext x='200' y='195' font-family='system-ui,-apple-system,sans-serif' font-size='15' font-weight='700' fill='%233b2314' text-anchor='middle'%3EBiteFleet Kitchen%3C/text%3E%3Ctext x='200' y='216' font-family='system-ui,-apple-system,sans-serif' font-size='12' font-weight='500' fill='%2378716c' text-anchor='middle'%3EFresh Gourmet Preparation%3C/text%3E%3C/svg%3E";

const FOOD_IMAGE_MAP = {
  1: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80', // Veg Burger
  2: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=600&q=80', // Margherita Pizza
  3: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80', // Veg Sandwich
  4: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=600&q=80', // French Fries
  5: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80', // Masala Dosa
  6: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80', // Chicken Biryani
  7: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80', // Paneer Wrap
  8: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80', // Chocolate Cake
  9: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80', // Chicken Burger
};

const CATEGORY_IMAGE_MAP = {
  'burgers': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
  'pizzas': 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=600&q=80',
  'sandwiches': 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80',
  'sides': 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=600&q=80',
  'south indian': 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80',
  'biryani & mains': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
  'wraps': 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80',
  'desserts': 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80',
};

function getFoodImage(item) {
  if (item && item.id && FOOD_IMAGE_MAP[item.id]) {
    return FOOD_IMAGE_MAP[item.id];
  }
  if (item && item.image_url && (item.image_url.startsWith('http') || item.image_url.startsWith('data:'))) {
    return item.image_url;
  }
  const name = (item && item.name) ? item.name.toLowerCase() : '';
  if (name.includes('fries')) return FOOD_IMAGE_MAP[4];
  if (name.includes('burger')) return FOOD_IMAGE_MAP[1];
  if (name.includes('pizza')) return FOOD_IMAGE_MAP[2];
  if (name.includes('sandwich')) return FOOD_IMAGE_MAP[3];
  if (name.includes('dosa') || name.includes('idli')) return FOOD_IMAGE_MAP[5];
  if (name.includes('biryani') || name.includes('rice')) return FOOD_IMAGE_MAP[6];
  if (name.includes('wrap') || name.includes('roll')) return FOOD_IMAGE_MAP[7];
  if (name.includes('cake') || name.includes('dessert') || name.includes('sweet')) return FOOD_IMAGE_MAP[8];

  const cat = (item && item.category) ? item.category.toLowerCase().trim() : '';
  if (CATEGORY_IMAGE_MAP[cat]) return CATEGORY_IMAGE_MAP[cat];

  return FALLBACK_FOOD_SVG;
}

function handleImageError(imgEl, category = '') {
  if (!imgEl) return;
  imgEl.onerror = null; // Prevent loop
  const catKey = (category || '').toLowerCase().trim();
  const catFallback = CATEGORY_IMAGE_MAP[catKey];
  if (catFallback && imgEl.src !== catFallback) {
    imgEl.src = catFallback;
    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.src = FALLBACK_FOOD_SVG;
    };
  } else {
    imgEl.src = FALLBACK_FOOD_SVG;
  }
}

// ===== TOP NAVIGATION BAR =====
// Strict required order:
// 1. Home
// 2. Menu
// 3. Orders
// 4. Help
// 5. Cart
// 6. Profile
function renderNavbar(activePage = '') {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const user = getUser();
  const isInCustomer = window.location.pathname.includes('/customer/');
  const rootPrefix = isInCustomer ? '../' : './';
  const customerPrefix = isInCustomer ? './' : 'customer/';
  const adminPrefix = isInCustomer ? '../admin/' : 'admin/';

  // Normalize active status
  const isHome = activePage === 'home';
  const isMenu = activePage === 'menu';
  const isOrders = activePage === 'orders' || activePage === 'history' || activePage === 'track';
  const isHelp = activePage === 'help';
  const isCart = activePage === 'cart';
  const isProfile = activePage === 'profile';

  const navHtml = `
    <div class="container">
      <nav class="nav-wrap">
        <a href="${rootPrefix}index.html" class="nav-brand" title="BiteFleet Home">
          <div class="nav-brand-logo">
            <i class="fas fa-bolt"></i>
          </div>
          <span class="nav-brand-text">BiteFleet</span>
        </a>

        <!-- Primary Top Navigation in exact requested order -->
        <ul class="nav-links">
          <li>
            <a href="${rootPrefix}index.html" class="nav-link ${isHome ? 'active' : ''}">
              <i class="fas fa-home"></i> Home
            </a>
          </li>
          <li>
            <a href="${customerPrefix}menu.html" class="nav-link ${isMenu ? 'active' : ''}">
              <i class="fas fa-utensils"></i> Menu
            </a>
          </li>
          <li>
            <a href="${customerPrefix}order-history.html" class="nav-link ${isOrders ? 'active' : ''}">
              <i class="fas fa-receipt"></i> Orders
            </a>
          </li>
          <li>
            <a href="${customerPrefix}help.html" class="nav-link ${isHelp ? 'active' : ''}">
              <i class="fas fa-circle-question"></i> Help
            </a>
          </li>
          <li>
            <a href="${customerPrefix}cart.html" class="nav-link nav-cart-link ${isCart ? 'active' : ''}" title="View Cart">
              <i class="fas fa-shopping-bag"></i> Cart
              <span class="cart-badge" style="display: none;">0</span>
            </a>
          </li>
          <li>
            ${user ? `
              <a href="${customerPrefix}profile.html" class="nav-link nav-profile-link ${isProfile ? 'active' : ''}" title="My Profile (${user.username})">
                <span class="user-avatar-sm">${(user.username || 'U')[0].toUpperCase()}</span>
                <span>Profile</span>
              </a>
            ` : `
              <a href="${rootPrefix}login.html" class="nav-link ${isProfile ? 'active' : ''}" title="Sign in to your account">
                <i class="fas fa-user"></i> Profile
              </a>
            `}
          </li>
        </ul>

        <!-- Right Side Utility Controls -->
        <div class="nav-actions">
          ${user ? `
            ${user.role === 'admin' ? `
              <a href="${adminPrefix}dashboard.html" class="admin-badge-btn" title="Admin Control Panel">
                <i class="fas fa-shield-halved"></i> Admin
              </a>
            ` : ''}
            <button onclick="logout()" class="nav-logout-btn" title="Sign out" aria-label="Sign out">
              <i class="fas fa-sign-out-alt"></i>
            </button>
          ` : `
            <a href="${rootPrefix}login.html" class="nav-auth-btn btn-outline">Sign In</a>
          `}

          <button class="mobile-menu-btn" onclick="toggleMobileMenu()" aria-label="Toggle navigation menu">
            <i class="fas fa-bars"></i>
          </button>
        </div>
      </nav>
    </div>

    <!-- Mobile Navigation Drawer (Mirrors the exact 6 items in order) -->
    <div id="mobileDrawer" class="mobile-drawer" style="display: none;">
      <ul class="mobile-nav-list">
        <li><a href="${rootPrefix}index.html" class="mobile-nav-link ${isHome ? 'active' : ''}"><i class="fas fa-home"></i> Home</a></li>
        <li><a href="${customerPrefix}menu.html" class="mobile-nav-link ${isMenu ? 'active' : ''}"><i class="fas fa-utensils"></i> Menu</a></li>
        <li><a href="${customerPrefix}order-history.html" class="mobile-nav-link ${isOrders ? 'active' : ''}"><i class="fas fa-receipt"></i> Orders</a></li>
        <li><a href="${customerPrefix}help.html" class="mobile-nav-link ${isHelp ? 'active' : ''}"><i class="fas fa-circle-question"></i> Help</a></li>
        <li>
          <a href="${customerPrefix}cart.html" class="mobile-nav-link ${isCart ? 'active' : ''}">
            <i class="fas fa-shopping-bag"></i> Cart
            <span class="cart-badge" style="display: none; margin-left: auto;">0</span>
          </a>
        </li>
        ${user ? `
          <li>
            <a href="${customerPrefix}profile.html" class="mobile-nav-link ${isProfile ? 'active' : ''}">
              <i class="fas fa-user"></i> Profile (${user.username})
            </a>
          </li>
          ${user.role === 'admin' ? `
            <li>
              <a href="${adminPrefix}dashboard.html" class="mobile-nav-link" style="color: #db2777;">
                <i class="fas fa-shield-halved"></i> Admin Dashboard
              </a>
            </li>
          ` : ''}
          <li>
            <a href="#" onclick="logout(); return false;" class="mobile-nav-link" style="color: var(--error);">
              <i class="fas fa-sign-out-alt"></i> Sign Out
            </a>
          </li>
        ` : `
          <li>
            <a href="${rootPrefix}login.html" class="mobile-nav-link">
              <i class="fas fa-user"></i> Profile / Sign In
            </a>
          </li>
        `}
      </ul>
    </div>
  `;

  header.innerHTML = navHtml;
  updateCartCount();
}

function toggleMobileMenu() {
  const drawer = document.getElementById('mobileDrawer');
  if (drawer) {
    drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
  }
}

// Render consistent customer footer
function renderFooter() {
  const footer = document.querySelector('.site-footer');
  if (!footer) return;

  const user = getUser();
  const isInCustomer = window.location.pathname.includes('/customer/');
  const rootPrefix = isInCustomer ? '../' : './';
  const customerPrefix = isInCustomer ? './' : 'customer/';
  const adminPrefix = isInCustomer ? '../admin/' : 'admin/';

  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <h4>⚡ BiteFleet</h4>
          <p>
            Fresh gourmet meals crafted by expert chefs and delivered fast. Experience real-time kitchen tracking, reliable ordering, and honest hospitality.
          </p>
          <div style="font-size: 0.8rem; color: #a8a29e; display: flex; align-items: center; gap: 10px;">
            <span><i class="fas fa-star" style="color: #f59e0b;"></i> 4.8 Food Rating</span>
            <span>•</span>
            <span><i class="fas fa-truck-fast" style="color: var(--primary);"></i> Express Delivery</span>
          </div>
        </div>

        <div class="footer-col">
          <h5>Explore</h5>
          <ul>
            <li><a href="${rootPrefix}index.html">Home</a></li>
            <li><a href="${customerPrefix}menu.html">Full Menu</a></li>
            <li><a href="${customerPrefix}menu.html?tab=favourites">Saved Dishes</a></li>
            <li><a href="${customerPrefix}cart.html">View Cart</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h5>Orders & Support</h5>
          <ul>
            <li><a href="${customerPrefix}order-history.html">My Orders</a></li>
            <li><a href="${customerPrefix}help.html">Help & FAQs</a></li>
            <li><a href="${customerPrefix}profile.html">Delivery Addresses</a></li>
            <li><a href="${customerPrefix}help.html#contact">Helpline: 1800-BITE-FLEET</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h5>Account</h5>
          <ul>
            ${user ? `
              <li><a href="${customerPrefix}profile.html">My Profile (${user.username})</a></li>
              ${user.role === 'admin' ? `<li><a href="${adminPrefix}dashboard.html" style="color: #f472b6;">Admin Dashboard</a></li>` : ''}
              <li><a href="#" onclick="logout(); return false;">Sign Out</a></li>
            ` : `
              <li><a href="${rootPrefix}login.html">Sign In</a></li>
              <li><a href="${rootPrefix}signup.html">Create Account</a></li>
            `}
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <p>© ${new Date().getFullYear()} BiteFleet. All rights reserved.</p>
        <p style="color: #78716c;">Production-Ready Food Ordering System</p>
      </div>
    </div>
  `;
}

// Global modal helpers
function openModal(dialogId) {
  const dialog = document.getElementById(dialogId);
  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else if (dialog) {
    dialog.style.display = 'block';
  }
}

function closeModal(dialogId) {
  const dialog = document.getElementById(dialogId);
  if (dialog && typeof dialog.close === 'function') {
    dialog.close();
  } else if (dialog) {
    dialog.style.display = 'none';
  }
}

// Automatically sync session & cart count on page load
async function syncSession() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token && data.token !== token) {
        localStorage.setItem('token', data.token);
        const nav = document.querySelector('.site-header');
        if (nav) {
          const path = window.location.pathname;
          let p = 'home';
          if (path.includes('menu')) p = 'menu';
          else if (path.includes('order')) p = 'orders';
          else if (path.includes('help')) p = 'help';
          else if (path.includes('cart')) p = 'cart';
          else if (path.includes('profile')) p = 'profile';
          renderNavbar(p);
        }
      }
    }
  } catch (e) {
    // Silent fail on session sync
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  syncSession();
});