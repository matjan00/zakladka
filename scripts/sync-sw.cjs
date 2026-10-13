// Refresh the FILES list in docs/sw.js without bumping the version (release.cjs does both).
const fs = require('fs');
const path = require('path');
const docs = path.join(__dirname, '..', 'docs');
const list = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name !== 'sw.js') list.push(path.relative(docs, p).split(path.sep).join('/'));
  }
})(docs);
const files = ['./', ...list];
const swPath = path.join(docs, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8').replace(/\/\/ FILES-START[\s\S]*\/\/ FILES-END/, `// FILES-START\nconst FILES = ${JSON.stringify(files)};\n// FILES-END`);
fs.writeFileSync(swPath, sw);
console.log(`sw.js: ${files.length} files listed`);
