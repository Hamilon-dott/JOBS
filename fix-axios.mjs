import fs from 'fs';
let code = fs.readFileSync('functions/api/jobs.ts', 'utf8');

code = code.replace(/const response = await axios\.get\(`\$\{source\.baseUrl\}&per_page=100&page=\$\{page\}&_t=\$\{timestamp\}`,\s*\{\s*timeout: 15000,\s*httpsAgent\s*\}\);/g, `const response = await fetch(\`\${source.baseUrl}&per_page=100&page=\${page}&_t=\${timestamp}\`, { signal: AbortSignal.timeout(15000) });
          const data = await response.json();`);

fs.writeFileSync('functions/api/jobs.ts', code);
console.log("Fixed axios");
