const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(/Fetch & Save to Firebase/g, 'Fetch & Save to RAM Cache');
content = content.replace(/Loading jobs from Firebase\.\.\./g, 'Loading jobs from server cache...');
content = content.replace(/\/\/ Force-refetch jobs list from Firebase/g, '// Force-refetch jobs list from Cache');
content = content.replace(/Background Full Load from Firebase\/Server API/g, 'Background Full Load from Server Cache/WP API');

fs.writeFileSync('src/App.tsx', content);
