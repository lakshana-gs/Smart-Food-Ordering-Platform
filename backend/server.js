const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const runMigrations = require('./migrate');
const menuRoutes = require('./routes/menu');
const userRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const favouritesRoutes = require('./routes/favourites');
const addressRoutes = require('./routes/addresses');
const recommendationRoutes = require('./routes/recommendations');
const couponRoutes = require('./routes/coupons');
const supportRoutes = require('./routes/support');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Security: Prevent serving dotfiles or .env files
app.use((req, res, next) => {
  if (req.path.includes('/.') || req.path.includes('.env')) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend'), {
  dotfiles: 'ignore'
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/favourites', favouritesRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/admin', adminRoutes);

// Customer Home Page as the default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Unmatched API route handler (JSON 404)
app.use('/api', (req, res) => {
  res.status(404).json({ message: `API endpoint "${req.originalUrl}" not found.` });
});

// Friendly 404 for pages
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '../frontend/404.html'));
});

// Centralized error-handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.stack || err);
  res.status(err.status || 500).json({
    message: err.message || 'An unexpected internal server error occurred.'
  });
});

// Run migrations on start then listen
runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Food Delivery Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to run database migrations:', err);
    // Still start server even if migrations encountered non-fatal notice
    app.listen(PORT, () => {
      console.log(`Food Delivery Server running on http://localhost:${PORT} (without migrations)`);
    });
  });