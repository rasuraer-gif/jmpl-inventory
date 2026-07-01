const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir);
}

const filesToCopy = [
  'index.html',
  'index.css',
  'logo.png',
  'db.js',
  'auth.js',
  'scanner.js',
  'app.js',
  'admin.js',
  'master.js',
  'production.js',
  'cryogenic.js',
  'deflashing.js',
  'trimming.js',
  'visual.js',
  'gauge.js',
  'quality.js',
  'store.js',
  'stock.js',
  'monthly-plan.js',
  'production-schedule.js',
  'replenishment.js',
  'reports.js',
  'ai-agent.js'
];

filesToCopy.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} to www/`);
  } else {
    console.log(`Skipped ${file} (not found)`);
  }
});
console.log('Build completed successfully.');
