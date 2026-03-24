/**
 * Set a user as admin by email
 * Usage: node scripts/setAdmin.js user@example.com
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');

async function setAdmin() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/setAdmin.js <email>');
    process.exit(1);
  }

  await mongoose.connect(config.mongodbUri);
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { isAdmin: true },
    { new: true }
  );

  if (!user) {
    console.error(`User with email "${email}" not found`);
    process.exit(1);
  }

  console.log(`✅ User "${user.displayName}" (${user.email}) is now admin`);
  process.exit(0);
}

setAdmin().catch(err => { console.error(err); process.exit(1); });
