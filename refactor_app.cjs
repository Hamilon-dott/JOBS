const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Replace /api/sync-firebase with /api/refresh-cache
content = content.replace(/\/api\/sync-firebase[\s\S]*?\`/g, '`/api/refresh-cache`');

// Replace isSyncingFirebase with isRefreshingCache
content = content.replace(/isSyncingFirebase/g, 'isRefreshingCache');
content = content.replace(/setIsSyncingFirebase/g, 'setIsRefreshingCache');

// Change UI Text
content = content.replace(/save them to Firebase/g, 'save them to Server RAM Cache');

// Write back
fs.writeFileSync('src/App.tsx', content);
