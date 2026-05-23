#!/usr/bin/env node
'use strict';
const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
}

const email = getArg('email');
const agencyId = getArg('agencyId');
const role = getArg('role') || 'admin';

if (!email || !agencyId) {
  console.error('Usage: node create-admin-user.js --email <email> --agencyId <id> [--role admin]');
  process.exit(1);
}

const adminClaims = {
  agencyId,
  role,
  enabledModules: ['bookings','customers','invoices','accounting','reports','settings'],
  perm_bookings_read: true,
  perm_bookings_write: true,
  perm_customers_read: true,
  perm_customers_write: true,
  perm_invoices_read: true,
  perm_invoices_write: true,
  perm_accounting_read: true,
  perm_reports_read: true,
  perm_settings_read: true,
  perm_settings_write: true,
};

async function main() {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, adminClaims);
  console.log(`✅ Custom claims set for ${email} (uid: ${user.uid})`);
  console.log('   agencyId:', agencyId);
  console.log('   role:', role);
  console.log('   Note: User must sign out and back in for claims to take effect.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
