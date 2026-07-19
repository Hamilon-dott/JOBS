import * as cheerio from 'cheerio';

function generateSlug(title: string, orgName?: string | null, fallbackId?: string): string {
  const extractEnglish = (text?: string | null) => {
    if (!text) return '';
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
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
    const pageRequests = [];
    for (let page = 1; page <= 10; page++) {
      pageRequests.push(
        fetch(`https://bdgovtjob.net/wp-json/wp/v2/posts?per_page=100&page=${page}`, {
          headers: { 
             'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
           },
           signal: AbortSignal.timeout(10000)
        })
        .then(res => res.json())
        .catch(e => {
          console.error(`Sitemap fetch page ${page} failed`, e.message);
          return null;
        })
      );
    }
    
    const responses = await Promise.all(pageRequests);
    
    responses.forEach((data: any) => {
      if (data && Array.isArray(data)) {
        data.forEach((post: any) => {
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
      }
    });
  } catch (e) {
    console.error('Sitemap fetch failed', e);
  }
  return [...new Set(slugs)];
}

export async function onRequest(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const baseUrl = (url.hostname === 'localhost' || url.hostname === '127.0.0.1') 
    ? `${url.protocol}//${url.host}` 
    : 'https://jobs.talukdaracademy.com.bd';
  
  const jobSlugs = await fetchJobSlugs();
  const date = new Date().toISOString().split('T')[0];
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>always</changefreq>
    <priority>1.0</priority>
  </url>
  ${jobSlugs.map((slug: string) => `
  <url>
    <loc>${baseUrl}/jobs/${slug}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`).join('')}
</urlset>`;

  return new Response(sitemap, {
    status: 200,
    headers: { 'Content-Type': 'application/xml' }
  });
}
