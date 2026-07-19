import fs from 'fs';
let code = fs.readFileSync('functions/api/jobs.ts', 'utf8');

code = code.replace(/const response = await axios\.get\([^;]+;\s+/g, (match) => {
    let urlMatch = match.match(/axios\.get\((`[^`]+`)/);
    if (!urlMatch) return match;
    const url = urlMatch[1];
    return `const response = await fetch(${url}, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: AbortSignal.timeout(40000)
        });
        const data = await response.json();\n        `;
});

fs.writeFileSync('functions/api/jobs.ts', code);
console.log("Fixed axios again");
