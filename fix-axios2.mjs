import fs from 'fs';
let code = fs.readFileSync('functions/api/jobs.ts', 'utf8');

code = code.replace(/const response = await axios\.get\([^;]*\);/g, (match) => {
    let urlMatch = match.match(/axios\.get\((.*?),\s*\{/);
    if (!urlMatch) {
       urlMatch = match.match(/axios\.get\((.*?)\)/);
    }
    const url = urlMatch[1];
    return `const response = await fetch(${url}, { signal: AbortSignal.timeout(15000) });
          const data = await response.json();`;
});

fs.writeFileSync('functions/api/jobs.ts', code);
console.log("Fixed axios completely");
