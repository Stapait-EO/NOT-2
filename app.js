// cPanel Passenger entry point with diagnostic wrapper
const fs = require('fs');
const path = require('path');

try {
  console.log('[BOOT app.js] Initializing production server from ./dist/server.cjs...');
  require('./dist/server.cjs');
  console.log('[BOOT app.js] ./dist/server.cjs loaded successfully.');
} catch (err) {
  const errMsg = `[FATAL STARTUP ERROR] ${new Date().toISOString()}: ${err.stack || err}\n`;
  console.error(errMsg);
  try {
    fs.appendFileSync(path.join(process.cwd(), 'debug_error.log'), errMsg, 'utf-8');
  } catch (_) {}
  throw err;
}
