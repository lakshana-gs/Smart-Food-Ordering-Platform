// Common utilities, auth helpers, navigation, and toast system for BiteFleet

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
  
  const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
  toast.innerHTML = `<span>${icon}</span><span style="flex: 1;">${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Sync cart item badge with database
async function updateCartCount() {
  const token = getToken();
  const badges = document.querySelectorAll('.cart-badge, .cart-count');
  if (!badges.length) return;

  if (!token) {
    badges.forEach(b => b.textContent = '0');
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
    showToast('Please log in to add delicious food to your cart!', 'info');
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
    showToast('Please log in to save favourite dishes!', 'info');
    return;
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
        showToast('Saved to your favourites!', 'success');
      }
    } else {
      showToast(data.message || 'Could not update favourite', 'error');
    }
  } catch (err) {
    showToast('Error updating favourites', 'error');
  }
}

// Render consistent customer navbar
function renderNavbar(activePage = '') {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const user = getUser();
  const isInCustomer = window.location.pathname.includes('/customer/');
  const rootPrefix = isInCustomer ? '../' : './';
  const customerPrefix = isInCustomer ? './' : 'customer/';
  const adminPrefix = isInCustomer ? '../admin/' : 'admin/';

  const navHtml = `
    <div class="container">
      <nav class="nav-wrap">
        <a href="${rootPrefix}index.html" class="nav-brand">
          <div class="nav-brand-logo">⚡</div>
          <span>BiteFleet</span>
        </a>

        <ul class="nav-links">
          <li><a href="${rootPrefix}index.html" class="nav-link ${activePage === 'home' ? 'active' : ''}"><i class="fas fa-home"></i> Home</a></li>
          <li><a href="${customerPrefix}menu.html" class="nav-link ${activePage === 'menu' ? 'active' : ''}"><i class="fas fa-utensils"></i> Menu</a></li>
          <li><a href="${customerPrefix}favourites.html" class="nav-link ${activePage === 'favourites' ? 'active' : ''}"><i class="fas fa-heart"></i> Favourites</a></li>
          <li><a href="${customerPrefix}order-history.html" class="nav-link ${activePage === 'history' ? 'active' : ''}"><i class="fas fa-clock-rotate-left"></i> My Orders</a></li>
          <li><a href="${customerPrefix}track-order.html" class="nav-link ${activePage === 'track' ? 'active' : ''}"><i class="fas fa-truck-fast"></i> Track Order</a></li>
          <li><a href="${customerPrefix}help.html" class="nav-link ${activePage === 'help' ? 'active' : ''}"><i class="fas fa-circle-question"></i> Help</a></li>
        </ul>

        <div class="nav-actions">
          <a href="${customerPrefix}cart.html" class="cart-btn-link" title="View Cart">
            <i class="fas fa-shopping-bag"></i>
            <span>Cart</span>
            <span class="cart-badge" style="display: none;">0</span>
          </a>

          ${user ? `
            ${user.role === 'admin' ? `
              <a href="${adminPrefix}dashboard.html" class="admin-switch-badge" title="Go to Admin Panel">
                <i class="fas fa-shield-halved"></i> Admin
              </a>
            ` : ''}
            <a href="${customerPrefix}profile.html" class="user-chip" title="Account Profile">
              <span class="user-avatar">${(user.username || 'U')[0].toUpperCase()}</span>
              <span>${user.username || 'Account'}</span>
            </a>
            <button onclick="logout()" class="btn btn-secondary btn-sm" title="Log out">
              <i class="fas fa-sign-out-alt"></i>
            </button>
          ` : `
            <a href="${rootPrefix}login.html" class="nav-auth-btn btn-outline">Log in</a>
            <a href="${rootPrefix}signup.html" class="nav-auth-btn btn-solid">Sign Up</a>
          `}

          <button class="mobile-menu-btn" onclick="toggleMobileMenu()" aria-label="Toggle navigation menu">
            <i class="fas fa-bars"></i>
          </button>
        </div>
      </nav>
    </div>

    <!-- Mobile Navigation Drawer -->
    <div id="mobileDrawer" class="mobile-drawer" style="display: none; background: white; border-bottom: 1px solid var(--border-light); padding: 16px 20px;">
      <ul style="list-style: none; display: flex; flex-direction: column; gap: 12px;">
        <li><a href="${rootPrefix}index.html" class="nav-link"><i class="fas fa-home"></i> Home</a></li>
        <li><a href="${customerPrefix}menu.html" class="nav-link"><i class="fas fa-utensils"></i> Browse Menu</a></li>
        <li><a href="${customerPrefix}favourites.html" class="nav-link"><i class="fas fa-heart"></i> Saved Favourites</a></li>
        <li><a href="${customerPrefix}cart.html" class="nav-link"><i class="fas fa-shopping-bag"></i> View Cart</a></li>
        <li><a href="${customerPrefix}order-history.html" class="nav-link"><i class="fas fa-clock-rotate-left"></i> Order History</a></li>
        <li><a href="${customerPrefix}track-order.html" class="nav-link"><i class="fas fa-truck-fast"></i> Track Order</a></li>
        <li><a href="${customerPrefix}help.html" class="nav-link"><i class="fas fa-circle-question"></i> Help & FAQs</a></li>
        ${user ? `
          <li><a href="${customerPrefix}profile.html" class="nav-link"><i class="fas fa-user"></i> My Profile (${user.username})</a></li>
          ${user.role === 'admin' ? `<li><a href="${adminPrefix}dashboard.html" class="nav-link" style="color: #db2777;"><i class="fas fa-shield-halved"></i> Admin Control Panel</a></li>` : ''}
          <li><a href="#" onclick="logout(); return false;" class="nav-link" style="color: var(--error);"><i class="fas fa-sign-out-alt"></i> Log Out</a></li>
        ` : `
          <li style="display: flex; gap: 10px; margin-top: 8px;">
            <a href="${rootPrefix}login.html" class="btn btn-secondary btn-sm" style="flex: 1;">Log In</a>
            <a href="${rootPrefix}signup.html" class="btn btn-primary btn-sm" style="flex: 1;">Sign Up</a>
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

// Render consistent footer
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
          <p style="color: #a8a29e; font-size: 0.9rem; line-height: 1.6; margin-bottom: 16px;">
            Fresh gourmet meals crafted with love and delivered hot at lightning speed. Real-time kitchen tracking and guaranteed deliciousness.
          </p>
          <div style="display: flex; gap: 12px; font-size: 1.2rem; color: #f59e0b;">
            <span>⭐ 4.9 Food Rating</span> • <span>🚀 Lightning Fast Delivery</span>
          </div>
        </div>

        <div class="footer-col">
          <h5>Quick Links</h5>
          <ul>
            <li><a href="${rootPrefix}index.html">Home</a></li>
            <li><a href="${customerPrefix}menu.html">Full Menu</a></li>
            <li><a href="${customerPrefix}favourites.html">Saved Favourites</a></li>
            <li><a href="${customerPrefix}cart.html">Shopping Cart</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h5>Customer Care</h5>
          <ul>
            <li><a href="${customerPrefix}track-order.html">Track Order</a></li>
            <li><a href="${customerPrefix}order-history.html">Past Orders</a></li>
            <li><a href="${customerPrefix}help.html">Help & FAQs</a></li>
            <li><a href="${customerPrefix}profile.html">Delivery Addresses</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h5>Account & Info</h5>
          <ul>
            ${user ? `
              <li><a href="${customerPrefix}profile.html">My Account (${user.username})</a></li>
              ${user.role === 'admin' ? `<li><a href="${adminPrefix}dashboard.html" style="color: #f472b6;">Admin Dashboard</a></li>` : ''}
              <li><a href="#" onclick="logout(); return false;">Sign Out</a></li>
            ` : `
              <li><a href="${rootPrefix}login.html">Sign In</a></li>
              <li><a href="${rootPrefix}signup.html">Create Account</a></li>
            `}
            <li><span style="color: #78716c; font-size: 0.85rem;">📞 Support: 1800-BITE-FLEET</span></li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <p>© ${new Date().getFullYear()} BiteFleet by Lakshana G S. All rights reserved. Database-backed & verified full-stack food delivery system.</p>
      </div>
    </div>
  `;
}

// Global modal helper
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

// Automatically sync cart count on page load
document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
});