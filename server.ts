import express from 'express';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Cache
// Slug generation function
function generateSlug(title: string, orgName?: string | null, fallbackId?: string, wpSlug?: string | null): string {
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

  let slug = wpSlug ? String(wpSlug).trim() : '';

  if (!slug || /^\d+$/.test(slug)) {
    slug = extractEnglish(title);
    if (!slug || slug.length < 3 || /^\d+$/.test(slug)) {
      if (orgName) {
        const orgSlug = extractEnglish(orgName);
        if (orgSlug && orgSlug.length >= 2 && !/^\d+$/.test(orgSlug)) {
          slug = `${orgSlug}-job-circular`;
        }
      }
    }
  }

  if (!slug || /^\d+$/.test(slug)) {
    slug = fallbackId ? `job-circular-${fallbackId}` : `job-circular-${Date.now()}`;
  }

  return slug;
}

export const app = express();

async function startServer() {
  const PORT = 3000;

  app.use(express.json());

  // Robots.txt
  app.get('/robots.txt', (req, res) => {
    const isLocalhost = (req.get('host') || '').includes('localhost');
    const baseUrl = isLocalhost ? `${req.protocol}://${req.get('host')}` : 'https://jobs.talukdaracademy.com.bd';
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /
Allow: /jobs/
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml
Sitemap: ${baseUrl}/news-sitemap.xml`);
  });

  // News Sitemap.xml for Google News
  app.get('/news-sitemap.xml', async (req, res) => {
    try {
      const jobs = await fetchLatestJobs(true);
      const host = req.get('host')?.includes('localhost') ? `${req.protocol}://${req.get('host')}` : 'https://jobs.talukdaracademy.com.bd';
      
      // Google News sitemaps should only contain URLs published in the last 2 days.
      // We will filter or just include all if they are recent. (In this case, we'll just include the most recent 100).
      const recentJobs = jobs.slice(0, 100);

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  ${recentJobs.map(job => `
  <url>
    <loc>${host}/jobs/${job.slug || generateSlug(job.title, job.organization, job.id)}</loc>
    <news:news>
      <news:publication>
        <news:name>BD Govt Job Circular</news:name>
        <news:language>bn</news:language>
      </news:publication>
      <news:publication_date>${new Date(job.publishedDate).toISOString()}</news:publication_date>
      <news:title>${job.title.replace(/[<>&'"]/g, '')}</news:title>
    </news:news>
  </url>`).join('')}
</urlset>`;

      res.type('application/xml');
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate'); // prevent cloudflare static caching
      res.send(sitemap);
    } catch (error) {
      console.error('Error generating news sitemap:', error);
      res.status(500).send('Error generating news sitemap');
    }
  });

  // Sitemap.xml
  app.get('/sitemap.xml', async (req, res) => {
    try {
      const jobs = await fetchLatestJobs(true);
      const host = req.get('host')?.includes('localhost') ? `${req.protocol}://${req.get('host')}` : 'https://jobs.talukdaracademy.com.bd';
      
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${host}/</loc>
    <changefreq>always</changefreq>
    <priority>1.0</priority>
  </url>
  ${jobs.map(job => `
  <url>
    <loc>${host}/jobs/${job.slug || generateSlug(job.title, job.organization, job.id)}</loc>
    <lastmod>${new Date(job.publishedDate).toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('')}
</urlset>`;

      res.type('application/xml');
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(sitemap);
    } catch (error) {
      console.error('Error generating sitemap:', error);
      res.status(500).send('Error generating sitemap');
    }
  });

  // API Route to fetch a single job
  app.get('/api/job/:slugOrId', async (req, res) => {
    try {
      const job = await fetchSingleJob(req.params.slugOrId);
      if (job) {
        return res.json(job);
      } else {
        return res.status(404).json({ error: 'Job not found' });
      }
    } catch (e: any) {
      console.error(e.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // API Route to fetch jobs
  app.get('/api/jobs', async (req, res) => {
    try {
      const isFull = req.query.full === 'true';
      const isAdmin = req.query.admin === 'true';
      const jobs = await fetchLatestJobs(isFull, isAdmin);
      res.json(jobs);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      res.status(500).json({ error: 'Failed to fetch jobs' });
    }
  });

  // API Route to manually refresh RAM cache
  app.get('/api/refresh-cache', async (req, res) => {
    try {
      const result = await refreshRAMCache();
      res.json(result);
    } catch (error) {
      console.error('Error refreshing cache:', error);
      res.status(500).json({ error: 'Failed to refresh cache' });
    }
  });

  // Schedule background sync daily at 1:00 PM Bangladesh Standard Time (BST = UTC+6), i.e., 07:00 AM UTC
  function scheduleDailySyncAtOnePmBST() {
    const getMsUntilNextRun = () => {
      const now = new Date();
      // Target is 7:00 AM UTC (which is 1:00 PM BST)
      const targetUTC = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        7, // 7:00 AM UTC
        0, // 0 minutes
        0, // 0 seconds
        0  // 0 milliseconds
      ));

      // If 7:00 AM UTC has already passed today, target 7:00 AM UTC tomorrow
      if (now.getTime() >= targetUTC.getTime()) {
        targetUTC.setUTCDate(targetUTC.getUTCDate() + 1);
      }

      return targetUTC.getTime() - now.getTime();
    };

    const planNext = () => {
      const msToNext = getMsUntilNextRun();
      const hoursToNext = (msToNext / (1000 * 60 * 60)).toFixed(2);
      console.log(`[BST Scheduler] Next daily sync (1:00 PM BST / 7:00 AM UTC) is scheduled in ${hoursToNext} hours.`);
      
      setTimeout(async () => {
        console.log("[BST Scheduler] It is 1:00 PM BST. Starting scheduled daily sync to RAM Cache...");
        try {
          const result = await refreshRAMCache(); // Full background sync
          console.log("[BST Scheduler] Sync result:", result);
          
        } catch (error) {
          console.error("[BST Scheduler] Scheduled sync error:", error);
        }
        // Plan next run for the following day
        planNext();
      }, msToNext);
    };

    planNext();
  }

  scheduleDailySyncAtOnePmBST();

  // Vite integration
  let vite;
  if (process.env.NODE_ENV !== 'production') {
    const viteModule = 'vite';
    const { createServer: createViteServer } = await import(viteModule);
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    
    app.use((req, res, next) => {
      // 301 Redirect old query params to new path structure
      if (req.query.job) {
        return res.redirect(301, `/jobs/${req.query.job}`);
      }
      next();
    });
    
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
  }

  app.get('*', async (req, res) => {
    // 301 Redirect trailing slashes
    if (req.path.length > 1 && req.path.endsWith('/')) {
      const query = req.url.slice(req.path.length);
      return res.redirect(301, req.path.slice(0, -1) + query);
    }
    
    // 301 Redirect old query params to new path structure
    if (req.query.job) {
      return res.redirect(301, `/jobs/${req.query.job}`);
    }
    
    try {
      let data = '';
      if (process.env.NODE_ENV !== 'production') {
        data = await fs.promises.readFile(path.join(process.cwd(), 'index.html'), 'utf8');
        data = await vite.transformIndexHtml(req.originalUrl, data);
      } else {
        const distPath = path.join(process.cwd(), 'dist');
        data = await fs.promises.readFile(path.join(distPath, 'index.html'), 'utf8');
      }

        const host = req.get('host')?.includes('localhost') ? `${req.protocol}://${req.get('host')}` : 'https://jobs.talukdaracademy.com.bd';
        
        // ক্যানোনিকাল (Canonical) URL-এর জন্য শেষে থাকা স্লাশ (/) বাদ দিচ্ছি, তবে হোমপেজ হলে থাকবে
        let reqPath = req.path;
        if (reqPath === '/index.html') {
          reqPath = '/';
        } else if (reqPath.length > 1 && reqPath.endsWith('/')) {
          reqPath = reqPath.slice(0, -1);
        }

        let canonicalUrl = host + reqPath;
        
        let updatedHtml = data;
        let pageTitle = "BD Govt Job Circular 2026 - Government and Bank Jobs";
        let pageDescription = "Find the latest Government and Bank job circulars, notices, and exam results in Bangladesh. Updated daily.";
        
        const searchQuery = req.query.search || req.query.q || '';
        if (searchQuery) {
          const cleanQuery = String(searchQuery).replace(/[<>&'"]/g, '');
          pageTitle = `${cleanQuery} - BD Govt Job Circular 2026 | All Govt Jobs BD`;
          pageDescription = `Get all recent results and recruitment notices matching "${cleanQuery}" in the Bangladesh Government and Bank Job Circular 2026. Find eligibility and apply now.`;
        }
        
        let ogImageUrl = host + '/img.png';
        
        // ডিফল্ট canonical ট্যাগটি মুছে দিচ্ছি, যেন ডাইনামিক ট্যাগ যুক্ত করতে পারি
        updatedHtml = updatedHtml.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
        // Title রিপ্রেস করছি
        updatedHtml = updatedHtml.replace(/<title>.*?<\/title>/gi, '');
        // Generic description সরিয়ে দিচ্ছি
        updatedHtml = updatedHtml.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/gi, '');
        // Generic og tags মুছে দিচ্ছি
        updatedHtml = updatedHtml.replace(/<meta property="og:.*?" content=".*?">\s*/gi, '');

        let isJobPage = false;

        // url param বা query parameter অনুযায়ী জবের আসল ডেটা খুঁজে বের করা হচ্ছে
        const isJobsRoute = req.path.match(/^\/jobs\/([^/]+)\/?$/);
        const isLegacyRoute = req.path.match(/^\/([^/]+)\/?$/);
        
        let jobSlugUrl = '';
        if (isJobsRoute) {
          jobSlugUrl = decodeURIComponent(isJobsRoute[1]);
        } else if (isLegacyRoute && !isLegacyRoute[1].includes('.') && isLegacyRoute[1] !== 'api' && isLegacyRoute[1] !== 'sitemap.xml' && isLegacyRoute[1] !== 'news-sitemap.xml' && isLegacyRoute[1] !== 'robots.txt') {
          jobSlugUrl = decodeURIComponent(isLegacyRoute[1]);
        }

        if (jobSlugUrl) {
          try {
            const job = await fetchSingleJob(jobSlugUrl);
            if (job) {
              const standardSlug = job.slug || generateSlug(job.title, job.organization, job.id);
              
              // যদি URL-এর সাথে আসল canonical স্লাগের মিল না থাকে বা পুরনো রুট হয়, তাহলে 301 Permanent Redirect করা হচ্ছে
              if (!isJobsRoute || standardSlug !== jobSlugUrl) {
                return res.redirect(301, `/jobs/${standardSlug}`);
              }
              
              // সঠিক Canonical URL নির্ধারণ করা হচ্ছে
              canonicalUrl = `${host}/jobs/${standardSlug}`;
              isJobPage = true;
              
              const cleanedTitle = job.title.replace(/[<>&'"]/g, '');
              const cleanedOrg = (job.organization || '').replace(/[<>&'"]/g, '');
              pageTitle = `${cleanedTitle} - ${cleanedOrg}`;
              ogImageUrl = job.imageUrls?.[0] || host + '/img.png';
              
              // Extract a short description from content
              let noHtmlContent = job.content.replace(/<[^>]*>?/gm, '');
              noHtmlContent = noHtmlContent.replace(/\s+/g, ' ').trim();
              pageDescription = noHtmlContent.length > 150 ? noHtmlContent.substring(0, 150) + '...' : noHtmlContent;
              
              const jsonLd = [
                {
                  "@context": "https://schema.org/",
                  "@type": "NewsArticle",
                  "headline": cleanedTitle,
                  "description": pageDescription,
                  "datePublished": job.publishedDate,
                  "dateModified": job.publishedDate,
                  "author": {
                    "@type": "Organization",
                    "name": "BD Govt Job Circular"
                  },
                  "publisher": {
                    "@type": "Organization",
                    "name": "BD Govt Job Circular",
                    "logo": {
                      "@type": "ImageObject",
                      "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Government_Seal_of_Bangladesh.svg/120px-Government_Seal_of_Bangladesh.svg.png"
                    }
                  },
                  "image": [ ogImageUrl ],
                  "mainEntityOfPage": {
                    "@type": "WebPage",
                    "@id": canonicalUrl
                  }
                },
                {
                  "@context": "https://schema.org/",
                  "@type": "JobPosting",
                  "title": cleanedTitle,
                  "description": pageDescription,
                  "datePosted": job.publishedDate,
                  "validThrough": job.deadlineISO || new Date(new Date(job.publishedDate).getTime() + 30*24*60*60*1000).toISOString(),
                  "hiringOrganization": {
                    "@type": "Organization",
                    "name": cleanedOrg || "BD Govt Job Circular"
                  },
                  "jobLocation": {
                    "@type": "Place",
                    "address": {
                      "@type": "PostalAddress",
                      "addressCountry": "BD"
                    }
                  },
                  "employmentType": "FULL_TIME",
                  "url": canonicalUrl
                }
              ];
              
              const staticContent = `
                <script type="application/ld+json">
                  ${JSON.stringify(jsonLd)}
                </script>
                <noscript>
                  <article itemscope itemtype="http://schema.org/NewsArticle">
                    <h1 itemprop="headline">${cleanedTitle}</h1>
                    <h2 itemprop="publisher">${cleanedOrg}</h2>
                    <p itemprop="datePublished">${job.publishedDate}</p>
                    <div itemprop="articleBody">${job.content}</div>
                  </article>
                </noscript>
              `;
              if (updatedHtml.includes('<div id="root"></div>')) {
                updatedHtml = updatedHtml.replace('<div id="root"></div>', `${staticContent}\n<div id="root"></div>`);
              } else {
                updatedHtml = updatedHtml.replace('<body>', `<body>\n${staticContent}`);
              }
            } else {
              // Job not found, revert to fallback home page canonical
              canonicalUrl = host + '/';
            }
          } catch (e) {
            console.error('Failed to fetch job for SEO rendering:', e);
            canonicalUrl = host + '/';
          }
        } else {
          // Homepage or other pages
          canonicalUrl = host + '/';
          
          const websiteSchema = {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "BD Govt Job Circular 2026",
            "alternateName": "Talukdar Academy Jobs",
            "url": host,
            "potentialAction": {
              "@type": "SearchAction",
              "target": `${host}/?search={search_term_string}`,
              "query-input": "required name=search_term_string"
            }
          };
          
          const staticContent = `
            <script type="application/ld+json">
              ${JSON.stringify(websiteSchema)}
            </script>
          `;
          if (updatedHtml.includes('<div id="root"></div>')) {
            updatedHtml = updatedHtml.replace('<div id="root"></div>', `${staticContent}\n<div id="root"></div>`);
          } else {
            updatedHtml = updatedHtml.replace('<body>', `<body>\n${staticContent}`);
          }
        }
        
        // Add meta tags for better indexing
        const metaTags = `
  <title>${pageTitle}</title>
  <meta name="description" content="${pageDescription.replace(/"/g, '&quot;')}">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${pageDescription.replace(/"/g, '&quot;')}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="${isJobPage ? 'article' : 'website'}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${isJobPage ? pageTitle : 'BD Govt Job Circular'}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${pageTitle}">
  <meta name="twitter:description" content="${pageDescription.replace(/"/g, '&quot;')}">
  <meta name="twitter:image" content="${ogImageUrl}">
  <link rel="canonical" href="${canonicalUrl}">
`;
        updatedHtml = updatedHtml.replace('</head>', `${metaTags}\n  </head>`);
        
        res.status(200).set({ 'Content-Type': 'text/html' }).end(updatedHtml);
    } catch (e) {
      if (process.env.NODE_ENV !== 'production' && vite) {
        vite.ssrFixStacktrace(e);
      }
      res.status(500).end(e.message);
    }
  });

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  }
}

const httpsAgent = new https.Agent({  
  rejectUnauthorized: false
});

// Helper to parse Bengali/English deadline strings
const parseDeadline = (deadlineStr: string): Date | null => {
  if (!deadlineStr || deadlineStr.includes('দেখুন') || deadlineStr.includes('চলমান')) return null;
  
  // Convert Bengali numerals to English
  const bengaliToEnglish = (str: string) => {
    const numerals: { [key: string]: string } = {
      '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
    };
    return str.replace(/[০-৯]/g, d => numerals[d]);
  };

  let cleanStr = bengaliToEnglish(deadlineStr);
  
  // Support common separators
  cleanStr = cleanStr.replace(/[।\/]/g, '-').replace(/\s+/g, ' ').trim();

  // Mapping for Bengali months
  const months: { [key: string]: string } = {
    'জানুয়ারি': 'January', 'জানুয়ারী': 'January',
    'ফেব্রুয়ারি': 'February', 'ফেব্রুয়ারী': 'February',
    'মার্চ': 'March',
    'এপ্রিল': 'April',
    'মে': 'May',
    'জুন': 'June',
    'জুলাই': 'July',
    'আগস্ট': 'August', 'আগষ্ট': 'August',
    'সেপ্টেম্বর': 'September', 'সেপ্টেম্বার': 'September',
    'অক্টোবর': 'October', 'অক্টোবার': 'October',
    'নভেম্বর': 'November', 'নভেম্বার': 'November',
    'ডিসেম্বর': 'December', 'ডিসেম্বার': 'December'
  };

  Object.keys(months).forEach(m => {
    cleanStr = cleanStr.replace(new RegExp(m, 'i'), months[m]);
  });

  // Handle DD-MM-YYYY or DD-Month-YYYY
  const parts = cleanStr.split(/[-\s]/);
  if (parts.length >= 3) {
    // Try to reformat for JS Date if parts are like [30, May, 2024]
    const day = parts[0];
    const month = parts[1];
    const year = parts[2];
    
    // If month is a number (05), ensure it works. 
    // JavaScript Date handles "2024-05-30" better than "30-05-2024"
    if (!isNaN(parseInt(day)) && !isNaN(parseInt(month)) && !isNaN(parseInt(year))) {
      if (year.length === 4) {
         cleanStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }

  const date = new Date(cleanStr);
  return isNaN(date.getTime()) ? null : date;
};

// Helper to parse complex/simple Bengali or English dates
const parseBengaliDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  
  // Convert Bengali numerals to English
  const bengaliToEnglish = (str: string) => {
    const numerals: { [key: string]: string } = {
      '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
    };
    return str.replace(/[০-৯]/g, d => numerals[d]);
  };

  // 1. Clean the string
  let cleanStr = dateStr.replace(/[।\.]/g, '').replace(/\s+/g, ' ').trim();
  
  // 2. If it contains multiple dates separated by comma, "ও", "এবং", we want the last one because the last one usually contains the full month and year.
  // E.g. "২২ এপ্রিল, ১১, ১৩ ও ২১ মে ২০২৬" -> "২১ মে ২০২৬"
  // E.g. "১৪ ও ১৯ মে ২০২৬" -> "১৯ মে ২০২৬"
  const parts = cleanStr.split(/[,&|\sওএবং]+/);
  
  const monthsList = [
    'জানুয়ারি', 'জানুয়ারী', 'ফেব্রুয়ারি', 'ফেব্রুয়ারী', 'মার্চ', 'এপ্রিল', 
    'মে', 'জুন', 'জুলাই', 'আগস্ট', 'আগষ্ট', 'সেপ্টেম্বর', 'সেপ্টেম্বার', 
    'অক্টোবর', 'অক্টোবার', 'নভেম্বর', 'নভেম্বার', 'ডিসেম্বর', 'ডিসেম্বার',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'
  ];

  const monthsMap: { [key: string]: string } = {
    'জানুয়ারি': 'January', 'জানুয়ারী': 'January',
    'ফেব্রুয়ারি': 'February', 'ফেব্রুয়ারী': 'February',
    'মার্চ': 'March',
    'এপ্রিল': 'April',
    'মে': 'May',
    'জুন': 'June',
    'জুলাই': 'July',
    'আগস্ট': 'August', 'আগষ্ট': 'August',
    'সেপ্টেম্বর': 'September', 'সেপ্টেম্বার': 'September',
    'অক্টোবর': 'October', 'অক্টোবার': 'October',
    'নভেম্বর': 'November', 'নভেম্বার': 'November',
    'ডিসেম্বর': 'December', 'ডিসেম্বার': 'December'
  };

  let year: string | null = null;
  let month: string | null = null;
  let day: string | null = null;

  // Search from right to left to grab the latest fully formed date
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].trim();
    const cleanPart = bengaliToEnglish(part);
    
    if (!year && /^\d{4}$/.test(cleanPart)) {
      year = cleanPart;
      continue;
    }
    
    const lowerPart = part.toLowerCase();
    const matchedMonthKey = monthsList.find(m => lowerPart.includes(m));
    if (!month && matchedMonthKey) {
      month = monthsMap[matchedMonthKey] || matchedMonthKey;
      continue;
    }
    
    if (!day && /^\d{1,2}$/.test(cleanPart)) {
      day = cleanPart;
      continue;
    }
  }

  if (!year || !month || !day) {
    const englishCleanStr = bengaliToEnglish(cleanStr);
    const regex = /(\d{1,2})\s+([^\s\d,]+)\s+(\d{4})/;
    const match = englishCleanStr.match(regex);
    if (match) {
      day = match[1];
      const mText = match[2].toLowerCase();
      const matchedMonthKey = monthsList.find(m => mText.includes(m));
      if (matchedMonthKey) {
        month = monthsMap[matchedMonthKey] || matchedMonthKey;
      }
      year = match[3];
    }
  }

  if (year && month && day) {
    const dateFormattedStr = `${day} ${month} ${year}`;
    const date = new Date(dateFormattedStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
};

// Function to process a WordPress post into a Job object
function processWpPost(post: any, sourceName: string, thirtyDaysAgo: Date, today: Date, parseDeadline: Function) {
  const title = post.title?.rendered || "Job Circular";
  const titleText = title.replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").replace(/<\/?[^>]+(>|$)/g, "").trim();

  const rawContent = post.content?.rendered || "";
  const $ = cheerio.load(rawContent);

  const extractFromTableOrText = (labels: string[]) => {
    let result = null;
    $('tr').each((_, row) => {
      const rowText = $(row).text().toLowerCase();
      if (labels.some(label => rowText.includes(label.toLowerCase()))) {
        const value = $(row).find('td').last().text().trim();
        if (value && value.length > 2 && value.length < 150) {
          result = value;
          return false;
        }
      }
    });
    if (result) return result;

    for (const label of labels) {
      const regex = new RegExp(`${label}\\s*[:\\sম=]+(?:<[^>]+>)*\\s*([^<>\\n]+)`, 'i');
      const match = rawContent.match(regex);
      if (match && match[1]) {
        const val = match[1].replace(/<\/?[^>]+(>|$)/g, "").trim();
        if (val.length > 2 && val.length < 150) return val;
      }
    }
    return null;
  };

  const deadline = extractFromTableOrText(['আবেদনের শেষ তারিখ', 'আবেদনের শেষ সময়', 'আবেদন শেষ', 'Last Date', 'Deadline']) || "সার্কুলার দেখুন";
  const deadlineDate = parseDeadline(deadline);
  
  // STRICT FILTER: Skip if deadline passed more than 30 days ago
  if (deadlineDate && deadlineDate < thirtyDaysAgo) {
    return null; 
  }

  // Extract custom publication date from post content when available, with fallback to post create date
  let customPubDate: Date | null = null;
  const pubDateText = extractFromTableOrText(['বিজ্ঞপ্তি প্রকাশের তারিখ', 'প্রকাশের তারিখ', 'বিজ্ঞপ্তি প্রকাশ', 'Publish Date', 'Published Date']);
  if (pubDateText) {
    const parsedCustom = parseBengaliDate(pubDateText);
    if (parsedCustom && !isNaN(parsedCustom.getTime())) {
      const yr = parsedCustom.getFullYear();
      if (yr >= 2020 && yr <= 2035) {
        customPubDate = parsedCustom;
      }
    }
  }

  // Fallback: Skip very old posts (published > 90 days ago) if deadline is unknown
  const postPubDate = new Date(post.date_gmt && post.date_gmt !== '0001-11-30T00:00:00' ? `${post.date_gmt}Z` : post.date);
  const pubDate = customPubDate || postPubDate;
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(today.getDate() - 90);
  if (pubDate < ninetyDaysAgo && (!deadlineDate || deadlineDate < today)) {
     return null;
  }

  // Improved Image Extraction (Multiple)
  const imgMatches = rawContent.matchAll(/src=["']([^"'>]+\.(?:jpg|jpeg|png|webp|gif)[^"'>]*)["']/gi);
  const imageUrls = Array.from(imgMatches, m => m[1]);

  let categories: string[] = [];
  const embeddedTerms = post._embedded?.['wp:term']?.flat() || [];
  const termNames = embeddedTerms.map((t: any) => t.name.toLowerCase());
  const titleLower = title.toLowerCase();

  const hasGovtTag = termNames.some((name: string) => name === 'সরকারি চাকরি' || name.includes('govt job') || name === 'government job');
  const hasBankTag = termNames.some((name: string) => name === 'ব্যাংক চাকরির খবর' || name.includes('bank job') || name === 'bank');
  const isGovtPhrase = titleLower.includes('সরকারি চাকরি') || titleLower.includes('govt job');
  const isBankPhrase = titleLower.includes('ব্যাংক চাকরির খবর') || titleLower.includes('bank job');

  if ((hasGovtTag || isGovtPhrase) && !categories.includes('Government')) categories.push('Government');
  if (hasBankTag || isBankPhrase) {
    if (!categories.includes('Bank')) categories.push('Bank');
    if (!(hasGovtTag || isGovtPhrase) && !categories.includes('Private')) categories.push('Private');
  }
  if (termNames.some((n: string) => n.includes('ngo') || n.includes('এনজিও')) || titleLower.includes('ngo') || titleLower.includes('এনজিও')) {
    if (!categories.includes('NGO')) categories.push('NGO');
  }
  const privateKeywords = ['private', 'company', 'limited', 'group', 'pvt', 'financial', 'insurance', 'সীমিত', 'গ্রুপ', 'লিমিটেড', 'কোম্পানি', 'বীমা'];
  const isPrivate = termNames.some((n: string) => n.includes('বেসরকারি') || n.includes('private')) || 
                    titleLower.includes('private') || 
                    privateKeywords.some(k => titleLower.includes(k) || termNames.some(t => t.includes(k)));
  if (isPrivate && !categories.includes('Private') && !categories.includes('Bank') && !categories.includes('Government') && !categories.includes('NGO')) {
    categories.push('Private');
  }
  if (categories.length === 0) categories.push('General');

  const cleanContent = rawContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Double pass for safety
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<ins\b[^<]*(?:(?!<\/ins>)<[^<]*)*<\/ins>/gi, '')
    .replace(/Source:|Powered by|Originally published on|See original post/gi, '')
    .trim();

  const remainingDays = extractFromTableOrText(['কয়দিন বাকি', 'আবেদনের সময় বাকি', 'সময় বাকি', 'Time Remaining', 'Remaining Days', 'Days Remaining']);
  const startTime = extractFromTableOrText(['আবেদন শুরুর তারিখ', 'আবেদন শুরু তারিখ', 'আবেদন শুরু', 'শুরু', 'Start Date', 'StartTime']) || "চলমান";
  const applyMethod = extractFromTableOrText(['আবেদনের পদ্ধতি', 'আবেদন পদ্ধতি', 'পদ্ধতি', 'How to Apply', 'Apply Method']) || "অনলাইনে / ডাকযোগে";
  const noticeSource = extractFromTableOrText(['বিজ্ঞপ্তির সোর্স', 'সূত্র', 'সোর্স', 'Source']) || "অনলাইন / অফিসিয়াল ওয়েবসাইট";
  
  let orgName = extractFromTableOrText(['প্রতিষ্ঠানের নাম', 'প্রতিষ্ঠান', 'Organisation', 'Organization', 'Company Name']);
  if (!orgName) {
    orgName = title.split(/Job|Circular|নিয়োগ|বিজ্ঞপ্তি/i)[0].trim();
    if (!orgName || orgName.length < 3) orgName = sourceName;
  }

  let applyLink = "https://jobs.talukdaracademy.com.bd";
  
  const commonDomains = ['teletalk.com.bd', 'apply', 'registration', 'form', 'jobs.'];
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().toLowerCase();
    if (commonDomains.some(d => href.includes(d)) || text.includes('apply online') || text.includes('আবেদন করুন')) {
      applyLink = href;
      return false;
    }
  });

  if (cleanContent.length > 50) {
    return {
      id: `${post.id}`,
      slug: generateSlug(titleText, orgName, `${post.id}`, post.slug ? post.slug.toString() : null),
      title: titleText,
      organization: orgName,
      publishedDate: pubDate.toISOString(), // Standard ISO format
      deadline: deadline,
      deadlineISO: deadlineDate ? deadlineDate.toISOString() : null,
      remainingDays: remainingDays,
      startTime: startTime,
      applyMethod: applyMethod,
      noticeSource: noticeSource,
      applyLink: applyLink,
      source: categories.join(','),
      link: post.link,
      location: 'Bangladesh',
      content: cleanContent,
      imageUrls: imageUrls
    };
  }
  return null;
}

let cachedJobsFull: any[] | null = null;
let lastFetchFull: number = 0;
let cachedJobsBrief: any[] | null = null;
let lastFetchBrief: number = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

let fallbackJobsCache: any[] | null = null;
function getFallbackJobs(): any[] {
  if (fallbackJobsCache) return fallbackJobsCache;
  const pathsText = [
    path.join(process.cwd(), 'public', 'fallback_jobs.json'),
    path.join(process.cwd(), 'fallback_jobs.json'),
    path.join(__dirname, '..', 'public', 'fallback_jobs.json'),
    path.join(__dirname, 'public', 'fallback_jobs.json')
  ];
  for (const p of pathsText) {
    try {
      if (fs.existsSync(p)) {
        const data = fs.readFileSync(p, 'utf8');
        fallbackJobsCache = JSON.parse(data);
        console.log(`Successfully loaded ${fallbackJobsCache?.length} fallback jobs dynamically from: ${p}`);
        return fallbackJobsCache || [];
      }
    } catch (err: any) {
      console.error(`Error reading cached json at ${p}:`, err.message);
    }
  }
  return [];
}

function mergeWithFallbackJobs(retrievedJobs: any[]): any[] {
  const merged = [...retrievedJobs];
  const fallbackJobs = getFallbackJobs();
  if (Array.isArray(fallbackJobs)) {
    fallbackJobs.forEach((fbJob: any) => {
      const titleLower = fbJob.title.toLowerCase().trim();
      const exists = merged.some((j: any) => j.title.toLowerCase().trim() === titleLower || j.slug === fbJob.slug || String(j.id) === String(fbJob.id));
      if (!exists) {
        merged.push(fbJob);
      }
    });
  }
  return merged;
}

async function fetchJobsFromWP(isFull: boolean = false) {
  const now = Date.now();
  if (isFull) {
    if (cachedJobsFull && now - lastFetchFull < CACHE_TTL) {
      return cachedJobsFull;
    }
  } else {
    if (cachedJobsBrief && now - lastFetchBrief < CACHE_TTL) {
      return cachedJobsBrief;
    }
  }

  const jobs: any[] = [];

// List of WP-API sources for full content
  const sources = [
    { name: 'BD Govt Job', baseUrl: 'https://bdgovtjob.net/wp-json/wp/v2/posts?_embed' }
  ];

  const seenTitles = new Set();
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 60);
  
  const targetCount = isFull ? 500 : 350;
  const maxSearchPages = isFull ? 5 : 4; // Fetching 5 pages (500 items max) in parallel is sufficient

  for (const source of sources) {
    try {
      console.log(`Fetching in parallel from: ${source.name} (Full: ${isFull})...`);
      
      const pagesToFetch = Array.from({ length: maxSearchPages }, (_, i) => i + 1);
      const fetchPromises = pagesToFetch.map(page => 
        axios.get(`${source.baseUrl}&per_page=100&page=${page}`, { 
          httpsAgent, 
          timeout: 15000, // 15 seconds timeout per page request to avoid slow server timeouts
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        })
        .then(res => ({ page, data: res.data }))
        .catch(err => {
          console.error(`Page ${page} fetch failed:`, err.message);
          return { page, data: [] };
        })
      );

      const results = await Promise.all(fetchPromises);
      
      // Sort results by page number to preserve date ordering as much as possible
      results.sort((a, b) => a.page - b.page);

      for (const result of results) {
        if (Array.isArray(result.data) && result.data.length > 0) {
          result.data.forEach((post: any) => {
            if (jobs.length >= targetCount) return;
            const title = post.title?.rendered || "Job Circular";
            const titleText = title.replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").replace(/<\/?[^>]+(>|$)/g, "").trim();
            if (seenTitles.has(titleText.toLowerCase())) return;
            seenTitles.add(titleText.toLowerCase());

            const job = processWpPost(post, source.name, thirtyDaysAgo, today, parseDeadline);
            if (job) jobs.push(job);
          });
          console.log(`Processed Page ${result.page}. Current total valid jobs: ${jobs.length}`);
        }
      }
    } catch (e: any) {
      console.error(`${source.name} API overall failed:`, e.message);
    }
  }

  if (jobs.length > 0) {
    const result = mergeWithFallbackJobs(jobs);
    if (isFull) {
      cachedJobsFull = result;
      lastFetchFull = Date.now();
    } else {
      cachedJobsBrief = result;
      lastFetchBrief = Date.now();
    }
    return result;
  }


  // Final fallback to RSS if all Direct APIs failed
  try {
    const rssUrl = 'https://bdgovtjob.net/feed/';
    console.log("Attempting RSS fallback...");
    const response = await axios.get(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`, { timeout: 8000 });
    if (response.data?.status === 'ok' && Array.isArray(response.data.items)) {
      response.data.items.forEach((item: any, i: number) => {
        const rawContent = item.content || item.description || "";
        const pubDate = new Date(item.pubDate);
        jobs.push({
          id: `rss-${i}`,
          slug: generateSlug(item.title.replace(/&#8211;/g, '-').replace(/&#8217;/g, "'"), "Job Circular", `rss-${i}`),
          title: item.title.replace(/&#8211;/g, '-').replace(/&#8217;/g, "'"),
          organization: "Job Circular",
          publishedDate: pubDate.toISOString(),
          deadline: "See Details",
          source: item.title.toLowerCase().includes('govt') ? 'Government' : 'General',
          link: item.link,
          location: 'Bangladesh',
          content: rawContent.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1').trim(),
          imageUrls: [item.thumbnail || item.enclosure?.link || null].filter(Boolean)
        });
      });
      const result = mergeWithFallbackJobs(jobs);
      if (isFull) {
        cachedJobsFull = result;
        lastFetchFull = Date.now();
      } else {
        cachedJobsBrief = result;
        lastFetchBrief = Date.now();
      }
      return result;
    }
  } catch (e: any) {
    console.error('RSS fallback failed:', e.message);
  }

  // Load from static local JSON file fetched at build-time or saved locally
  try {
    const fJobs = getFallbackJobs();
    if (Array.isArray(fJobs) && fJobs.length > 0) {
      console.log(`Loaded ${fJobs.length} static fallback/cached jobs dynamically.`);
      const resultList = fJobs;
      if (isFull) {
        cachedJobsFull = resultList;
        lastFetchFull = Date.now();
      } else {
        cachedJobsBrief = resultList;
        lastFetchBrief = Date.now();
      }
      return resultList;
    }
  } catch (err: any) {
    console.error("Failed to load dynamic fallback_jobs.json:", err.message);
  }

  const todayDate = new Date().toISOString();
  const fallbackResult = [
    {
      id: "f1",
      slug: generateSlug("Assistant Director (General) - 100 Posts"),
      title: "Assistant Director (General) - 100 Posts",
      organization: "Bangladesh Bank",
      publishedDate: todayDate,
      deadline: "May 25, 2026",
      source: "Bank",
      link: "https://bdgovtjob.net/",
      location: "Dhaka",
      content: "Official recruitment for Assistant Director positions at Bangladesh Bank."
    }
  ];
  if (isFull) {
    cachedJobsFull = fallbackResult;
    lastFetchFull = Date.now();
  } else {
    cachedJobsBrief = fallbackResult;
    lastFetchBrief = Date.now();
  }
  return fallbackResult;
}

interface RAMCache {
  jobs: any[];
  timestamp: number;
}

let cachedLatestJobsFull: RAMCache | null = null;
let cachedLatestJobsBrief: RAMCache | null = null;
const RAM_CACHE_TTL = 24 * 60 * 60 * 1000; // Cache Firestore queries for 24 hours to save reads

const singleJobMapCache = new Map<string, { job: any | null, timestamp: number }>();
const SINGLE_JOB_CACHE_TTL = 1 * 60 * 60 * 1000; // 1 hour buffer

let isSyncing = false;
async function refreshRAMCache() {
  console.log("Refreshing RAM Cache from WP API...");
  try {
    const jobs = await fetchJobsFromWP(true);
    if (jobs && jobs.length > 0) {
      cachedLatestJobsFull = { jobs, timestamp: Date.now() };
      cachedLatestJobsBrief = { jobs: jobs.slice(0, 40), timestamp: Date.now() };
      console.log("RAM Cache refreshed successfully!");
      return { success: true, count: jobs.length };
    }
    return { success: false, error: "No jobs fetched" };
  } catch (error: any) {
    console.error("Error refreshing RAM cache:", error.message);
    return { success: false, error: error.message };
  }
}

async function fetchLatestJobs(isFull: boolean = false, isAdmin: boolean = false) {
  const now = Date.now();
  // Serve from memory cache if active and clean
  if (!isAdmin) {
    if (isFull) {
      if (cachedLatestJobsFull && (now - cachedLatestJobsFull.timestamp < RAM_CACHE_TTL)) {
        console.log("Serving full jobs from Server memory cache...");
        return cachedLatestJobsFull.jobs;
      }
    } else {
      if (cachedLatestJobsBrief && (now - cachedLatestJobsBrief.timestamp < RAM_CACHE_TTL)) {
        console.log("Serving brief jobs from Server memory cache...");
        return cachedLatestJobsBrief.jobs;
      }
    }
  }

  console.log("Fetching jobs from WP API...");
  const jobs = await fetchJobsFromWP(isFull);
  
  if (!jobs || jobs.length === 0) {
    return [];
  }

  // Populate server memory caches
  if (isFull) {
    cachedLatestJobsFull = { jobs, timestamp: now };
  } else {
    cachedLatestJobsBrief = { jobs, timestamp: now };
  }

  return jobs;
}

async function fetchSingleJob(slugOrId: string) {
  const now = Date.now();
  
  if (cachedLatestJobsFull && (now - cachedLatestJobsFull.timestamp < RAM_CACHE_TTL)) {
    const job = cachedLatestJobsFull.jobs.find((j: any) => String(j.id) === String(slugOrId) || j.slug === slugOrId);
    if (job && job.content) {
      return job;
    }
  }
  
  if (cachedLatestJobsBrief && (now - cachedLatestJobsBrief.timestamp < RAM_CACHE_TTL)) {
    const job = cachedLatestJobsBrief.jobs.find((j: any) => String(j.id) === String(slugOrId) || j.slug === slugOrId);
    if (job && job.content) {
      return job;
    }
  }

  if (singleJobMapCache.has(slugOrId)) {
    const cachedItem = singleJobMapCache.get(slugOrId)!;
    if (now - cachedItem.timestamp < SINGLE_JOB_CACHE_TTL) {
       return cachedItem.job;
    } else {
       singleJobMapCache.delete(slugOrId);
    }
  }

  // Fallback to fetch from WP API
  try {
    const isId = /^\d+$/.test(slugOrId);
    let jobData = null;
    if (!isId) {
      const resp = await axios.get(`https://bdgovtjob.net/wp-json/wp/v2/posts?slug=${slugOrId}&_embed`, { timeout: 12000 });
      if (resp.data && resp.data.length > 0) {
        jobData = resp.data[0];
      }
    } else {
      const resp = await axios.get(`https://bdgovtjob.net/wp-json/wp/v2/posts/${slugOrId}?_embed`, { timeout: 12000 });
      if (resp.data) {
        jobData = resp.data;
      }
    }
    
    if (jobData) {
      const pubDate = new Date(jobData.date);
      const rawContent = jobData.content.rendered;
      const strippedContent = rawContent.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1').trim();
      const imageUrls = [
          jobData._embedded?.['wp:featuredmedia']?.[0]?.source_url,
      ].filter(Boolean);

      const parsedJob = {
          id: jobData.id,
          title: jobData.title.rendered.replace(/&#8211;/g, '-').replace(/&#8217;/g, "'"),
          organization: "Job Circular",
          publishedDate: pubDate.toISOString(),
          deadline: "See Details", 
          source: 'General',
          link: jobData.link,
          location: 'Bangladesh',
          content: strippedContent,
          imageUrls: imageUrls,
          slug: jobData.slug // Save the slug directly
      };
      
      singleJobMapCache.set(slugOrId, { job: parsedJob, timestamp: now });
      return parsedJob;
    }
  } catch (error) {
    console.error("Error fetching single job from WP API:", error);
  }

  return null;
}

startServer();

