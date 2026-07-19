import fs from 'fs';
let code = fs.readFileSync('functions/api/jobs.ts', 'utf8');

code = code.replace(/Win64; x64\)' \}\n\s*\}\);\n/g, '');

fs.writeFileSync('functions/api/jobs.ts', code);
console.log("Fixed syntax");
