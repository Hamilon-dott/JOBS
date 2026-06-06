const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

content = content.replace(/\/\/ Initialize Firebase/g, '// Initialize Cache');
content = content.replace(/Starting scheduled daily sync to Firebase/g, 'Starting scheduled daily sync to RAM Cache');

fs.writeFileSync('server.ts', content);
