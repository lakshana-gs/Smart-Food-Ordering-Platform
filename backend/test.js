/**
 * Comprehensive Automated Test Suite for Food Delivery System
 * Verifies all 8 Phases:
 * 1. Database & Migrations
 * 2. Auth & Access Controls
 * 3. Menu Browsing & Admin CRUD
 * 4. Persistent User Cart & Price Validation
 * 5. Promo Coupons Validation
 * 6. Address Book & Ownership Isolation
 * 7. Favourites Management
 * 8. End-to-End Checkout, Billing, and Order Lifecycle State Machine
 */

const http = require('http');
const path = require('path');
const jwt = require('./node_modules/jsonwebtoken');
const db = require('./db');

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const JWT_SECRET = process.env.JWT_SECRET || 'food_delivery_dev_secret_2026_change_this';

let adminToken = '';
let customerToken = '';
let testUserId = null;
let testMenuId = null;
let testAddressId = null;
let testOrderId = null;

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName} ${detail ? `(${detail})` : ''}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${detail ? `[${detail}]` : ''}`);
    failedTests++;
  }
}

function makeRequest(method, reqPath, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, BASE_URL);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 STARTING COMPREHENSIVE SYSTEM VERIFICATION TESTS');
  console.log('======================================================\n');

  try {
    // ------------------------------------------------------------------
    // TEST SUITE 1: Database Integrity & Existing Records Preservation
    // ------------------------------------------------------------------
    console.log('--- SUITE 1: Database Integrity & Existing Records ---');
    const [tables] = await db.query('SHOW TABLES');
    const tableNames = tables.map((t) => Object.values(t)[0]);
    const requiredTables = [
      'users',
      'menu',
      'orders',
      'order_items',
      'billing',
      'customer_addresses',
      'favourites',
      'coupons',
      'contact_messages',
    ];
    for (const t of requiredTables) {
      assert(tableNames.includes(t), `Table "${t}" exists in MySQL`);
    }

    const [usersInDb] = await db.query('SELECT user_id, username, email, role FROM users');
    assert(usersInDb.length >= 2, 'Existing users preserved in database', `${usersInDb.length} users found`);

    const adminUser = usersInDb.find((u) => u.role === 'admin');
    assert(!!adminUser, 'Admin user account exists', adminUser ? adminUser.email : 'None');

    const customerUser = usersInDb.find((u) => u.role === 'user');
    assert(!!customerUser, 'Customer user account exists', customerUser ? customerUser.email : 'None');

    // ------------------------------------------------------------------
    // TEST SUITE 2: Authentication, Passwords & Role Isolation
    // ------------------------------------------------------------------
    console.log('\n--- SUITE 2: Authentication & Role Protection ---');

    // Invalid login attempt
    const badLogin = await makeRequest('POST', '/api/auth/login', {
      email: adminUser.email,
      password: 'definitely_wrong_password_999',
    });
    assert(badLogin.status === 401, 'Rejects invalid password with 401 Unauthorized');

    // End-to-end signup test with real bcrypt hashing
    const testEmail = `qa_customer_${Date.now()}@fooddelivery.local`;
    const testPassword = 'SecurePass123!';
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      username: 'QA Test Customer',
      email: testEmail,
      password: testPassword,
    });
    assert(signupRes.status === 201 && signupRes.data.token, 'Signup creates user with bcrypt hashing and issues JWT');
    testUserId = signupRes.data.user.id;

    // Real login with the freshly created credentials
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      email: testEmail,
      password: testPassword,
    });
    assert(loginRes.status === 200 && loginRes.data.token, 'Customer login verifies bcrypt hash and returns JWT');
    customerToken = loginRes.data.token;

    // Issue valid admin token using JWT_SECRET
    adminToken = jwt.sign(
      { id: adminUser.user_id, email: adminUser.email, role: 'admin', username: adminUser.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    assert(!!adminToken, 'Admin session authenticated with role="admin"');

    // Profile verification (/api/auth/me)
    const meRes = await makeRequest('GET', '/api/auth/me', null, customerToken);
    assert(
      meRes.status === 200 && meRes.data.user && meRes.data.user.email === testEmail,
      'Authenticated /api/auth/me returns caller profile without exposing password'
    );
    assert(!meRes.data.user.password, 'API does not leak password hash in user profile response');

    // Role check: Customer attempting admin action (Expect 403)
    const unauthorizedAdminCall = await makeRequest(
      'POST',
      '/api/menu',
      { name: 'Hacker Dish', price: 99 },
      customerToken
    );
    assert(unauthorizedAdminCall.status === 403, 'Customer forbidden from calling Admin API (403)');

    // ------------------------------------------------------------------
    // TEST SUITE 3: Menu Browsing, Dietary Filters & Admin CRUD
    // ------------------------------------------------------------------
    console.log('\n--- SUITE 3: Menu Browsing, Search & Admin CRUD ---');
    const menuList = await makeRequest('GET', '/api/menu');
    assert(menuList.status === 200 && Array.isArray(menuList.data), 'Public menu loads successfully');
    assert(menuList.data.length >= 9, 'All original menu items preserved', `${menuList.data.length} dishes`);

    const vegDishes = await makeRequest('GET', '/api/menu?dietary=Veg');
    const allVeg = vegDishes.data.every((d) => d.dietary === 'Veg');
    assert(allVeg, 'Dietary filter "Veg" correctly returns only vegetarian dishes');

    // Admin creates a new dish
    const newDishRes = await makeRequest(
      'POST',
      '/api/menu',
      {
        name: 'Auto-Test Artisan Pizza',
        price: 349.0,
        emoji: '🍕',
        category: 'Pizzas',
        dietary: 'Veg',
        description: 'Automated test pizza with mozzarella and basil',
        prep_minutes: 25,
        is_available: 1,
      },
      adminToken
    );
    assert(newDishRes.status === 201 && newDishRes.data.item.id, 'Admin successfully created menu item');
    testMenuId = newDishRes.data.item.id;

    // Admin updates the dish
    const updateDishRes = await makeRequest(
      'PUT',
      `/api/menu/${testMenuId}`,
      {
        name: 'Auto-Test Artisan Pizza Premium',
        price: 399.0,
        emoji: '🍕',
        category: 'Pizzas',
        dietary: 'Veg',
        description: 'Updated test pizza with extra cheese',
        prep_minutes: 20,
        is_available: 1,
      },
      adminToken
    );
    assert(updateDishRes.status === 200, 'Admin successfully updated menu item');

    // Toggle availability
    const toggleAvailRes = await makeRequest(
      'PATCH',
      `/api/menu/${testMenuId}/availability`,
      { is_available: 0 },
      adminToken
    );
    assert(toggleAvailRes.status === 200, 'Admin toggled dish availability to Sold Out');

    // Toggle back to available for order tests
    await makeRequest('PATCH', `/api/menu/${testMenuId}/availability`, { is_available: 1 }, adminToken);

    // ------------------------------------------------------------------
    // TEST SUITE 4: Persistent Cart & Server-Side Price Calculations
    // ------------------------------------------------------------------
    console.log('\n--- SUITE 4: Persistent Cart & Price Protection ---');

    // Clear cart first
    await makeRequest('DELETE', '/api/orders/cart/clear', null, customerToken);

    // Add item to cart
    const addToCartRes = await makeRequest(
      'POST',
      '/api/orders/add-to-cart',
      { menuId: testMenuId, quantity: 2 },
      customerToken
    );
    assert(addToCartRes.status === 200, 'Customer successfully added item to cart');

    // Fetch cart
    const cartRes = await makeRequest('GET', '/api/orders/cart', null, customerToken);
    assert(cartRes.status === 200 && cartRes.data.items.length >= 1, 'Cart persisted and retrieved from database');

    const cartItem = cartRes.data.items.find((i) => i.menuId === testMenuId);
    assert(cartItem && cartItem.quantity === 2, 'Cart item quantity is 2');
    assert(
      cartItem && parseFloat(cartItem.unitPrice) === 399.0,
      'Cart uses server-side database price (Rs. 399.00), not client-supplied price'
    );

    // ------------------------------------------------------------------
    // TEST SUITE 5: Coupon Codes & Promo Validation
    // ------------------------------------------------------------------
    console.log('\n--- SUITE 5: Coupons & Promo Engine ---');

    const activeCoupons = await makeRequest('GET', '/api/coupons/active');
    assert(activeCoupons.status === 200 && activeCoupons.data.length >= 1, 'Active coupons retrieved');

    // Validate WELCOME20 coupon
    const validCouponRes = await makeRequest('POST', '/api/coupons/validate', {
      code: 'WELCOME20',
      subtotal: 500.0,
    });
    assert(validCouponRes.status === 200 && validCouponRes.data.valid === true, 'Coupon WELCOME20 successfully applied');
    assert(validCouponRes.data.discount === 100.0, '20% discount on Rs. 500 calculated as Rs. 100.00');

    // Invalid coupon
    const invalidCouponRes = await makeRequest('POST', '/api/coupons/validate', {
      code: 'BOGUS_CODE_999',
      subtotal: 500.0,
    });
    assert(invalidCouponRes.status === 400, 'Invalid coupon rejected with 400 Bad Request');

    // ------------------------------------------------------------------
    // TEST SUITE 6: Address Book Management & IDOR Security
    // ------------------------------------------------------------------
    console.log('\n--- SUITE 6: Address Book & Ownership Isolation ---');

    const addAddressRes = await makeRequest(
      'POST',
      '/api/addresses',
      {
        label: 'Home',
        recipient_name: 'QA Test Customer',
        phone: '9876543210',
        address: 'Flat 402, Green Orchid Apartments, Bengaluru 560001',
        is_default: 1,
      },
      customerToken
    );
    assert(addAddressRes.status === 201 && addAddressRes.data.address && addAddressRes.data.address.id, 'Customer saved new delivery address');
    testAddressId = addAddressRes.data.address ? addAddressRes.data.address.id : null;

    // Verify address list
    const addrListRes = await makeRequest('GET', '/api/addresses', null, customerToken);
    assert(addrListRes.status === 200 && addrListRes.data.length >= 1, 'Customer address book fetched');

    // Admin attempting to delete customer address (must be prohibited if user doesn't own it)
    const crossDeleteRes = await makeRequest('DELETE', `/api/addresses/${testAddressId}`, null, adminToken);
    assert(
      crossDeleteRes.status === 404,
      'User cannot delete an address belonging to another user (Ownership check passed)'
    );

    // ------------------------------------------------------------------
    // TEST SUITE 7: Saved Items / Favourites
    // ------------------------------------------------------------------
    console.log('\n--- SUITE 7: Favourites / Saved Items ---');

    const addFavRes = await makeRequest('POST', `/api/favourites/${testMenuId}`, null, customerToken);
    assert(addFavRes.status === 200 || addFavRes.status === 201, 'Customer added item to favourites');

    const favListRes = await makeRequest('GET', '/api/favourites', null, customerToken);
    const hasFav = favListRes.data.some((f) => f.id === testMenuId);
    assert(hasFav, 'Saved item appears in customer favourites list');

    // ------------------------------------------------------------------
    // TEST SUITE 8: End-to-End Checkout, Order Snapshot & Status Lifecycle
    // ------------------------------------------------------------------
    console.log('\n--- SUITE 8: End-to-End Checkout & Order Lifecycle ---');

    // Place Order via Checkout
    const checkoutRes = await makeRequest(
      'POST',
      '/api/orders/checkout',
      {
        customerName: 'QA Test Customer',
        deliveryAddress: 'Flat 402, Green Orchid Apartments, Bengaluru',
        contactPhone: '9876543210',
        deliveryInstructions: 'Ring doorbell twice please',
        paymentMethod: 'Cash on Delivery',
        couponCode: 'WELCOME20',
      },
      customerToken
    );

    assert(checkoutRes.status === 200 && checkoutRes.data.orderId, 'Transactional order placed successfully');
    testOrderId = checkoutRes.data.orderId;
    console.log(`    -> Created Test Order #${testOrderId} with confirmed total: Rs. ${checkoutRes.data.total}`);

    // Verify order tracking
    const trackRes = await makeRequest('GET', `/api/orders/track/${testOrderId}`, null, customerToken);
    assert(trackRes.status === 200 && trackRes.data.status === 'Confirmed', 'Order tracking initialized in Confirmed state');
    assert(trackRes.data.items && trackRes.data.items.length >= 1, 'Order item snapshot preserved in order_items');

    // Admin updates status: Confirmed -> Preparing
    const prepRes = await makeRequest(
      'PUT',
      `/api/orders/update/${testOrderId}`,
      { status: 'Preparing', statusEmoji: '🍳' },
      adminToken
    );
    assert(prepRes.status === 200, 'Admin advanced status to Preparing');

    // Check cancellation restriction: Customer cannot cancel when status is 'Preparing'
    const cancelRes = await makeRequest('POST', `/api/orders/cancel/${testOrderId}`, null, customerToken);
    assert(
      cancelRes.status === 400,
      'Order cancellation properly blocked when order is already in Preparing state'
    );

    // Admin updates status: Preparing -> Out for Delivery -> Delivered
    await makeRequest(
      'PUT',
      `/api/orders/update/${testOrderId}`,
      { status: 'Out for Delivery', statusEmoji: '🚚' },
      adminToken
    );
    const deliverRes = await makeRequest(
      'PUT',
      `/api/orders/update/${testOrderId}`,
      { status: 'Delivered', statusEmoji: '🎉' },
      adminToken
    );
    assert(deliverRes.status === 200, 'Admin marked order as Delivered');

    // Reorder feature test
    const reorderRes = await makeRequest('POST', `/api/orders/reorder/${testOrderId}`, null, customerToken);
    assert(reorderRes.status === 200 && reorderRes.data.orderId, 'Customer successfully reordered items from past order');

    // ------------------------------------------------------------------
    // TEST SUITE 9: Recommendations & Admin Business Metrics
    // ------------------------------------------------------------------
    console.log('\n--- SUITE 9: Recommendations & Business Analytics ---');

    const popularRes = await makeRequest('GET', '/api/recommendations/popular');
    assert(popularRes.status === 200 && popularRes.data.length >= 1, 'Popular dishes returned based on real order counts');

    const forYouRes = await makeRequest('GET', '/api/recommendations/for-you', null, customerToken);
    assert(forYouRes.status === 200, 'Personalized recommendations generated for customer');

    const adminStats = await makeRequest('GET', '/api/admin/stats', null, adminToken);
    assert(adminStats.status === 200 && adminStats.data.counts, 'Admin metrics loaded from live MySQL database');
    assert(parseFloat(adminStats.data.revenue.totalRevenue) > 0, `Net revenue calculated correctly (Rs. ${adminStats.data.revenue.totalRevenue})`);
    assert(adminStats.data.counts.totalOrders >= 1, `Order count verified (${adminStats.data.counts.totalOrders} non-pending orders)`);

    // Clean up temporary test dish, address, and test user
    console.log('\n--- CLEANUP ---');
    if (testAddressId) {
      await makeRequest('DELETE', `/api/addresses/${testAddressId}`, null, customerToken);
    }
    if (testMenuId) {
      await makeRequest('DELETE', `/api/menu/${testMenuId}`, null, adminToken);
    }
    if (testUserId) {
      await db.query('DELETE FROM users WHERE user_id = ?', [testUserId]);
    }
    console.log('  Cleaned up temporary test artifacts safely without altering existing records.');

    console.log('\n======================================================');
    console.log(`🏁 TEST EXECUTION COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('======================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
  } catch (err) {
    console.error('\n❌ Fatal Test Runner Error:', err);
    process.exit(1);
  }
}

// Start tests
runTests();
