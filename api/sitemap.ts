import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import https from 'https';

const httpsAgent = new https.Agent({  
  rejectUnauthorized: false
});

import * as cheerio from 'cheerio';

// Slug generation function
function generateSlug(title: string, orgName?: string | null, fallbackId?: string): string {
  const extractEnglish = (text?: string | null) => {
    if (!text) return '';
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Keep words in English language, numbers, spaces, hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  };

  let slug = extractEnglish(title);
  if (!slug || slug.length < 3) {
    if (orgName) {
      const orgSlug = extractEnglish(orgName);
      if (orgSlug && orgSlug.length >= 2) {
        slug = `${orgSlug}-job-circular`;
      }
    }
  }

  return slug || fallbackId || '';
}

async function fetchJobSlugs() {
  const slugs: string[] = [];
  try {
    // Fetch top 3 pages (300 jobs) to keep it fast and reliable
    for (let page = 1; page <= 3; page++) {
      const response = await axios.get(`https://bdgovtjob.net/wp-json/wp/v2/posts?per_page=100&page=${page}`, { 
        httpsAgent,
        timeout: 8000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        }
      });
      if (Array.isArray(response.data)) {
        response.data.forEach((post: any) => {
          let titleText = post.title?.rendered || '';
          titleText = titleText.replace(/&#[0-9]+;/g, '-').replace(/<[^>]+>/g, '').trim();
          
          let orgName = '';
          if (post.content?.rendered) {
            const $ = cheerio.load(post.content.rendered);
            const text = $.text();
            const orgMatch = text.match(/প্রতিষ্ঠানের নাম\s*[:ঃ]?\s*([^\n]+)/i);
            orgName = orgMatch ? orgMatch[1].trim() : '';
          }
          
          slugs.push(generateSlug(titleText, orgName, post.slug || post.id.toString()));
        });
      } else {
        break;
      }
    }
  } catch (e) {
    console.error('Sitemap fetch failed', e);
  }
  return slugs;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const isLocalhost = (req.headers.host || '').includes('localhost');
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = isLocalhost ? `${protocol}://${req.headers.host}` : 'https://jobs.talukdaracademy.com.bd';
  
  const jobSlugs = await fetchJobSlugs();
  const date = new Date().toISOString().split('T')[0];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>always</changefreq>
    <priority>1.0</priority>
  </url>
  ${jobSlugs.map(slug => `
  <url>
    <loc>${baseUrl}/${slug}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.status(200).send(sitemap);
}
