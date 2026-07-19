import fs from 'fs';
let code = fs.readFileSync('api/jobs.ts', 'utf8');

// Replace axios with fetch
code = code.replace(/import axios from 'axios';/, '');
code = code.replace(/import https from 'https';/, '');
code = code.replace(/const httpsAgent = new https\.Agent\(\{[\s\S]*?\}\);/, '');
code = code.replace(/import \{ VercelRequest, VercelResponse \} from '@vercel\/node';/, '');

// Replace fetchLatestJobs axios call
code = code.replace(/const response = await axios\.get\(endpoint, \{\s*timeout: 15000,\s*httpsAgent\s*\}\);/g, `const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
      const data = await response.json();`);
      
// Replace axios.get in fetchLatestJobs
code = code.replace(/const response = await axios\.get\(source\.url, \{\s*timeout: 15000,\s*httpsAgent\s*\}\);/g, `const response = await fetch(source.url, { signal: AbortSignal.timeout(15000) });
      const data = await response.json();`);
code = code.replace(/const posts = response\.data;/g, 'const posts = data;');

// Replace fetchSingleJob axios call
code = code.replace(/const response = await axios\.get\(endpoint, \{ timeout: 15000 \}\);/g, `const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
    const data = await response.json();`);
code = code.replace(/const post = isId \? response\.data : \(Array\.isArray\(response\.data\) \? response\.data\[0\] : null\);/g, 'const post = isId ? data : (Array.isArray(data) ? data[0] : null);');


code = code.replace(/export default async function handler\(req: VercelRequest, res: VercelResponse\) \{/g, `export async function onRequest(context: any) {
  const { request } = context;
  const url = new URL(request.url);`);

code = code.replace(/const \{ id, full \} = req\.query;/g, `const id = url.searchParams.get('id');
    const full = url.searchParams.get('full');`);

code = code.replace(/res\.status\(200\)\.json\((.*?)\);/g, `return new Response(JSON.stringify($1), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });`);

code = code.replace(/res\.status\(404\)\.json\((.*?)\);/g, `return new Response(JSON.stringify($1), { status: 404, headers: { 'Content-Type': 'application/json' } });`);
code = code.replace(/res\.status\(500\)\.json\((.*?)\);/g, `return new Response(JSON.stringify($1), { status: 500, headers: { 'Content-Type': 'application/json' } });`);

code = code.replace(/res\.setHeader\(.*?\);/g, '');

fs.writeFileSync('functions/api/jobs.ts', code);
console.log("Converted jobs.ts");
