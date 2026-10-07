// Generates scripts/password_hashes.json - bcrypt hashes for the demo accounts.
// Run from repo root: node scripts/make_hashes.js   (needs ../backend/node_modules)
const bcrypt = require('../backend/node_modules/bcryptjs');
const fs = require('fs');
const path = require('path');
const passwords = {
  ADMIN: 'Admin@123',
  FACULTY: 'Faculty@123',
  STUDENT: 'Student@123',
  ACCOUNTANT: 'Account@123',
  HOSTEL_ADMIN: 'Hostel@123',
  EXAM_CELL: 'Exam@123',
  HR: 'Hr@123',
};
const out = {};
for (const [role, pw] of Object.entries(passwords)) out[role] = bcrypt.hashSync(pw, 10);
fs.writeFileSync(path.join(__dirname, 'password_hashes.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
