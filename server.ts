import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import fs from 'fs';

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Robots.txt
  app.get('/robots.txt', (req, res) => {
    const isLocalhost = (req.get('host') || '').includes('localhost');
    const baseUrl = isLocalhost ? `${req.protocol}://${req.get('host')}` : 'https://jobs.talukdaracademy.com.bd';
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /
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
    <loc>${host}/${job.slug || generateSlug(job.title, job.organization, job.id)}</loc>
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
    <loc>${host}/${job.slug || generateSlug(job.title, job.organization, job.id)}</loc>
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
      const jobs = await fetchLatestJobs(isFull);
      res.json(jobs);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      res.status(500).json({ error: 'Failed to fetch jobs' });
    }
  });

  // Vite integration
  let vite;
  if (process.env.NODE_ENV !== 'production') {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    
    app.use((req, res, next) => {
      // 301 Redirect old query params to new path structure
      if (req.query.job) {
        return res.redirect(301, `/${req.query.job}`);
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
      return res.redirect(301, `/${req.query.job}`);
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
        let pageTitle = "Jobs.talukdaracademy.com.bd - BD Govt Job Circular 2026";
        let pageDescription = "Find the latest Govt and Bank jobs in Bangladesh.";
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
        const jobMatch = req.path.match(/^\/([^/]+)\/?$/);
        if (jobMatch) {
          const jobSlugUrl = decodeURIComponent(jobMatch[1]);
          try {
            const job = await fetchSingleJob(jobSlugUrl);
            if (job) {
              const standardSlug = job.slug || generateSlug(job.title, job.organization, job.id);
              
              // যদি URL-এর সাথে আসল canonical স্লাগের মিল না থাকে, তাহলে সঠিক স্লাগে 301 Permanent Redirect করা হচ্ছে
              if (standardSlug !== jobSlugUrl) {
                return res.redirect(301, `/${standardSlug}`);
              }
              
              // সঠিক Canonical URL নির্ধারণ করা হচ্ছে
              canonicalUrl = `${host}/${standardSlug}`;
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
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
      const regex = new RegExp(`${label}\\s*[:\sম=]+(?:<[^>]+>)*\s*([^<>\n]+)`, 'i');
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

  // Fallback: Skip very old posts (published > 90 days ago) if deadline is unknown
  const pubDate = new Date(post.date);
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

async function fetchLatestJobs(isFull: boolean = false) {
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
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  const targetCount = isFull ? 350 : 40;
  const maxSearchPages = isFull ? 8 : 2; // Increase page limit to account for filtered items

  for (const source of sources) {
    try {
      console.log(`Fetching from: ${source.name} (Full: ${isFull})...`);
      
      // Fetch multiple pages until we hit target or limit
      for (let page = 1; page <= maxSearchPages; page++) {
        if (jobs.length >= targetCount) break;

        const response = await axios.get(`${source.baseUrl}&per_page=100&page=${page}`, { 
          httpsAgent, 
          timeout: 40000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        if (Array.isArray(response.data) && response.data.length > 0) {
          response.data.forEach((post: any) => {
            if (jobs.length >= targetCount) return;
            const title = post.title?.rendered || "Job Circular";
            const titleText = title.replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").replace(/<\/?[^>]+(>|$)/g, "").trim();
            if (seenTitles.has(titleText.toLowerCase())) return;
            seenTitles.add(titleText.toLowerCase());

            const job = processWpPost(post, source.name, thirtyDaysAgo, today, parseDeadline);
            if (job) jobs.push(job);
          });
          console.log(`Page ${page} Result: We now have ${jobs.length} valid jobs total.`);
        } else {
          break; // No more pages
        }
      }
    } catch (e: any) {
      if (e.code === 'ECONNABORTED' || e.message?.includes('timeout') || e.message?.includes('aborted')) {
        console.error(`${source.name} API timed out or aborted.`);
      } else {
        console.error(`${source.name} API failed:`, e.response?.status, e.message);
      }
    }
  }

  if (jobs.length > 0) {
    const result = jobs.sort((a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime());
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
    const response = await axios.get(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`, { timeout: 10000 });
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
      const result = jobs.sort((a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime());
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

async function fetchSingleJob(slugOrId: string) {
  // Check cache first
  if (cachedJobsFull) {
    const job = cachedJobsFull.find(j => j.id === slugOrId || j.slug === slugOrId);
    if (job) return job;
  }

  // Fetch from WP API
  try {
    const isId = /^\d+$/.test(slugOrId);
    const endpoint = isId
      ? `https://bdgovtjob.net/wp-json/wp/v2/posts/${slugOrId}?_embed`
      : `https://bdgovtjob.net/wp-json/wp/v2/posts?slug=${encodeURIComponent(slugOrId)}&_embed`;
    
    console.log("Fetching single job from API:", endpoint);
    const response = await axios.get(endpoint, { timeout: 15000 });
    const post = isId ? response.data : (Array.isArray(response.data) ? response.data[0] : null);
    
    if (post) {
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);
      
      const parseLib = (str: string) => {
        // dummy parser returning null to bypass deadline filter, since it's a specific requested post
        return null; 
      };

      const job = processWpPost(post, 'BD Govt Job', thirtyDaysAgo, today, parseLib);
      if (job) return job;
    }
  } catch (e: any) {
    console.error("Failed to fetch single job from API:", e.message);
  }
  
  return null;
}

function getFallbackJobs() {
  const today = new Date().toLocaleDateString();
  return [
    {
      id: "f1",
      slug: generateSlug("Assistant Director (General) - 100 Posts"),
      title: "Assistant Director (General) - 100 Posts",
      organization: "Bangladesh Bank",
      publishedDate: today,
      deadline: "May 25, 2026",
      source: "Bank",
      link: "https://bdgovtjob.net/",
      location: "Dhaka"
    },
    {
      id: "f2",
      slug: generateSlug("Senior Officer (Circular No. 2026/04)"),
      title: "Senior Officer (Circular No. 2026/04)",
      organization: "Sonali Bank PLC",
      publishedDate: today,
      deadline: "May 20, 2026",
      source: "Bank",
      link: "https://bdgovtjob.net/",
      location: "Nationwide"
    },
    {
      id: "f3",
      slug: generateSlug("Railway Assistant Station Master"),
      title: "Railway Assistant Station Master",
      organization: "Bangladesh Railway",
      publishedDate: today,
      deadline: "June 10, 2026",
      source: "Government",
      link: "https://bdgovtjob.net/",
      location: "Regional"
    }
  ];
}

startServer();
