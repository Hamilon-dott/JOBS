import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const host = req.headers.host || 'jobs.example.com';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  
  const robots = `User-agent: *
Allow: /
Sitemap: ${protocol}://${host}/sitemap.xml`;

  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(robots);
}
