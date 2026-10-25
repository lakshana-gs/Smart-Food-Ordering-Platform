const pool = require('./db');

async function runMigrations() {
  console.log('--- Starting safe, incremental database migrations ---');
  const conn = await pool.getConnection();

  try {
    // 1. Helper to check if a column exists
    async function columnExists(table, column) {
      const [rows] = await conn.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
      );
      return rows.length > 0;
    }

    // 2. Helper to check if a table exists
    async function tableExists(table) {
      const [rows] = await conn.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
      );
      return rows.length > 0;
    }

    // --- Migrate `users` table ---
    if (!(await columnExists('users', 'is_active'))) {
      console.log('Adding users.is_active...');
      await conn.query('ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1');
    }
    if (!(await columnExists('users', 'created_at'))) {
      console.log('Adding users.created_at...');
      await conn.query('ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    }

    // --- Migrate `menu` table ---
    if (!(await columnExists('menu', 'description'))) {
      console.log('Adding menu.description...');
      await conn.query('ALTER TABLE menu ADD COLUMN description TEXT NULL');
    }
    if (!(await columnExists('menu', 'category'))) {
      console.log('Adding menu.category...');
      await conn.query("ALTER TABLE menu ADD COLUMN category VARCHAR(80) NOT NULL DEFAULT 'Other'");
    }
    if (!(await columnExists('menu', 'dietary'))) {
      console.log('Adding menu.dietary...');
      await conn.query("ALTER TABLE menu ADD COLUMN dietary VARCHAR(30) NOT NULL DEFAULT 'Unspecified'");
    }
    if (!(await columnExists('menu', 'prep_minutes'))) {
      console.log('Adding menu.prep_minutes...');
      await conn.query('ALTER TABLE menu ADD COLUMN prep_minutes INT NOT NULL DEFAULT 20');
    }
    if (!(await columnExists('menu', 'is_available'))) {
      console.log('Adding menu.is_available...');
      await conn.query('ALTER TABLE menu ADD COLUMN is_available TINYINT(1) NOT NULL DEFAULT 1');
    }
    if (!(await columnExists('menu', 'rating'))) {
      console.log('Adding menu.rating...');
      await conn.query('ALTER TABLE menu ADD COLUMN rating DECIMAL(2,1) NOT NULL DEFAULT 4.5');
    }
    if (!(await columnExists('menu', 'rating_count'))) {
      console.log('Adding menu.rating_count...');
      await conn.query('ALTER TABLE menu ADD COLUMN rating_count INT NOT NULL DEFAULT 15');
    }

    // --- Migrate `orders` table ---
    if (!(await columnExists('orders', 'customer_name'))) {
      console.log('Adding orders.customer_name...');
      await conn.query('ALTER TABLE orders ADD COLUMN customer_name VARCHAR(100) NULL');
    }
    if (!(await columnExists('orders', 'delivery_address'))) {
      console.log('Adding orders.delivery_address...');
      await conn.query('ALTER TABLE orders ADD COLUMN delivery_address TEXT NULL');
    }
    if (!(await columnExists('orders', 'contact_phone'))) {
      console.log('Adding orders.contact_phone...');
      await conn.query('ALTER TABLE orders ADD COLUMN contact_phone VARCHAR(30) NULL');
    }
    if (!(await columnExists('orders', 'delivery_instructions'))) {
      console.log('Adding orders.delivery_instructions...');
      await conn.query('ALTER TABLE orders ADD COLUMN delivery_instructions TEXT NULL');
    }
    if (!(await columnExists('orders', 'payment_method'))) {
      console.log('Adding orders.payment_method...');
      await conn.query("ALTER TABLE orders ADD COLUMN payment_method VARCHAR(30) NOT NULL DEFAULT 'COD'");
    }
    if (!(await columnExists('orders', 'coupon_code'))) {
      console.log('Adding orders.coupon_code...');
      await conn.query('ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(50) NULL');
    }
    if (!(await columnExists('orders', 'discount_amount'))) {
      console.log('Adding orders.discount_amount...');
      await conn.query('ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00');
    }
    if (!(await columnExists('orders', 'subtotal'))) {
      console.log('Adding orders.subtotal...');
      await conn.query('ALTER TABLE orders ADD COLUMN subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00');
    }
    if (!(await columnExists('orders', 'delivery_fee'))) {
      console.log('Adding orders.delivery_fee...');
      await conn.query('ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 10.00');
    }
    if (!(await columnExists('orders', 'total_amount'))) {
      console.log('Adding orders.total_amount...');
      await conn.query('ALTER TABLE orders ADD COLUMN total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00');
    }
    if (!(await columnExists('orders', 'updated_at'))) {
      console.log('Adding orders.updated_at...');
      await conn.query('ALTER TABLE orders ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    }

    // --- Migrate `order_items` table ---
    if (!(await columnExists('order_items', 'item_name'))) {
      console.log('Adding order_items.item_name...');
      await conn.query('ALTER TABLE order_items ADD COLUMN item_name VARCHAR(150) NULL');
    }

    // --- Migrate `billing` table ---
    if (!(await columnExists('billing', 'discount'))) {
      console.log('Adding billing.discount...');
      await conn.query('ALTER TABLE billing ADD COLUMN discount DECIMAL(10,2) NOT NULL DEFAULT 0.00');
    }

    // --- Create `customer_addresses` table if not exists ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS customer_addresses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        label VARCHAR(50) NOT NULL DEFAULT 'Home',
        recipient_name VARCHAR(100) NULL,
        phone VARCHAR(30) NULL,
        address TEXT NOT NULL,
        is_default TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // --- Create `favourites` table if not exists ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS favourites (
        user_id INT NOT NULL,
        menu_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, menu_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (menu_id) REFERENCES menu(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // --- Create `coupons` table ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        code VARCHAR(50) PRIMARY KEY,
        discount_percent INT NOT NULL DEFAULT 0,
        discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        min_order DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        max_discount DECIMAL(10,2) NULL,
        expiry_date DATE NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        description VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed default coupons if empty
    const [couponCount] = await conn.query('SELECT COUNT(*) as cnt FROM coupons');
    if (couponCount[0].cnt === 0) {
      console.log('Seeding default coupons...');
      await conn.query(`
        INSERT INTO coupons (code, discount_percent, discount_amount, min_order, max_discount, expiry_date, is_active, description)
        VALUES 
        ('WELCOME20', 20, 0.00, 150.00, 100.00, DATE_ADD(CURDATE(), INTERVAL 90 DAY), 1, '20% off up to Rs. 100 on orders above Rs. 150'),
        ('FLAT50', 0, 50.00, 200.00, 50.00, DATE_ADD(CURDATE(), INTERVAL 90 DAY), 1, 'Flat Rs. 50 off on orders above Rs. 200'),
        ('FREESHIP', 0, 10.00, 100.00, 10.00, DATE_ADD(CURDATE(), INTERVAL 90 DAY), 1, 'Free delivery (Rs. 10 off) on orders above Rs. 100')
      `);
    }

    // --- Create `contact_messages` table ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        subject VARCHAR(200) NULL,
        message TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'New',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // --- Safe enrichment of menu items with proper category, dietary, description, emoji ---
    const menuEnrichments = [
      { id: 1, category: 'Burgers', dietary: 'Veg', emoji: '🍔', desc: 'Crispy seasoned vegetable patty, fresh lettuce, sliced tomatoes, and creamy tangy mayo in a toasted sesame bun.', rating: 4.6, count: 42 },
      { id: 2, category: 'Pizzas', dietary: 'Veg', emoji: '🍕', desc: 'Classic sourdough crust topped with rich San Marzano tomato sauce, fresh buffalo mozzarella, and fragrant basil leaves.', rating: 4.8, count: 58 },
      { id: 3, category: 'Sandwiches', dietary: 'Veg', emoji: '🥪', desc: 'Triple-decker toasted sandwich packed with crisp cucumbers, tomatoes, bell peppers, mint chutney, and spiced potatoes.', rating: 4.4, count: 35 },
      { id: 4, category: 'Sides', dietary: 'Veg', emoji: '🍟', desc: 'Golden, crispy hand-cut french fries tossed in sea salt, served with garlic herb dip and spicy ketchup.', rating: 4.7, count: 70 },
      { id: 5, category: 'South Indian', dietary: 'Veg', emoji: '🥞', desc: 'Crispy golden fermented rice and lentil crepe stuffed with spiced potato masala, served with coconut chutney and piping hot sambar.', rating: 4.9, count: 64 },
      { id: 6, category: 'Biryani & Mains', dietary: 'Non-Veg', emoji: '🍗', desc: 'Fragrant long-grain basmati rice layered with tender marinated chicken pieces, caramelized onions, and royal saffron spices.', rating: 4.9, count: 88 },
      { id: 7, category: 'Wraps', dietary: 'Veg', emoji: '🌯', desc: 'Warm whole wheat flatbread rolled with marinated paneer cubes, crunchy sautéed bell peppers, and smoky mint yogurt sauce.', rating: 4.5, count: 29 },
      { id: 8, category: 'Desserts', dietary: 'Veg', emoji: '🍰', desc: 'Decadent multi-layered Belgian dark chocolate sponge drenched in silky chocolate ganache and chocolate curls.', rating: 4.8, count: 52 },
      { id: 9, category: 'Burgers', dietary: 'Non-Veg', emoji: '🍔', desc: 'Juicy chargrilled chicken breast fillet glazed with smoky BBQ glaze, melted cheddar cheese, crisp pickles, and crisp iceberg lettuce.', rating: 4.7, count: 47 }
    ];

    for (const item of menuEnrichments) {
      await conn.query(
        `UPDATE menu 
         SET category = ?, dietary = ?, emoji = ?, description = ?, rating = ?, rating_count = ?
         WHERE id = ?`,
        [item.category, item.dietary, item.emoji, item.desc, item.rating, item.count, item.id]
      );
    }

    // --- Backfill order totals in `orders` table from `billing` table if zero ---
    await conn.query(`
      UPDATE orders o
      JOIN billing b ON o.id = b.order_id
      SET o.subtotal = b.subtotal,
          o.delivery_fee = b.delivery_fee,
          o.discount_amount = IFNULL(b.discount, 0.00),
          o.total_amount = b.total
      WHERE o.total_amount = 0.00 OR o.total_amount IS NULL
    `);

    // --- Backfill order_items item_name from `menu` if null ---
    await conn.query(`
      UPDATE order_items oi
      JOIN menu m ON oi.menu_id = m.id
      SET oi.item_name = m.name
      WHERE oi.item_name IS NULL OR oi.item_name = ''
    `);

    console.log('--- Migrations and enrichment completed successfully! ---');
  } finally {
    conn.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = runMigrations;
