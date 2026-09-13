const path = require('node:path');
const { createRequire } = require('node:module');

const requireFromApp = createRequire(path.join(__dirname, '../app/package.json'));

module.exports = requireFromApp('playwright');
