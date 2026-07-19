import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { fetchSingleJob, fetchLatestJobs, generateSlug } from './functions/api/jobs.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Routes
  app.get('/api/jobs', async (req, res) => {
    try {
      const id = req.query.id as string;
      const full = req.query.full as string;
      
      if (id) {
        const job = await fetchSingleJob(id);
        if (job) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          res.status(200).json(job);
        } else {
          res.status(404).json({ error: 'Job not found' });
        }
        return;
      }
      
      const isFull = full === 'true';
      const jobs = await fetchLatestJobs(isFull);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.status(200).json(jobs);
    } catch (error) {
      console.error('API Error:', error);
      res.status(500).json({ error: 'Failed to fetch jobs' });
    }
  });

  let vite: any;
  if (process.env.NODE_ENV !== 'production') {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
  }

  // SEO middleware
  app.get('*', async (req, res, next) => {
    if (
      req.path.startsWith('/api/') ||
      req.path.match(/\.(png|jpg|jpeg|gif|css|js|ts|tsx|ico|xml|txt|json)$/i)
    ) {
      return next();
    }

    try {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = `${protocol}://${req.get('host')}`;
      
      let reqPath = req.path;
      if (reqPath === '/index.html') reqPath = '/';
      else if (reqPath.length > 1 && reqPath.endsWith('/')) reqPath = reqPath.slice(0, -1);
      
      let canonicalUrl = host + reqPath;
      let pageTitle = "BD Govt Job Circular 2026 - Government and Bank Jobs";
      let pageDescription = "Find the latest Government and Bank job circulars, notices, and exam results in Bangladesh. Updated daily.";
      
      const searchQuery = req.query.search || req.query.q || '';
      if (searchQuery) {
        const cleanQuery = String(searchQuery).replace(/[<>&'"]/g, '');
        pageTitle = `${cleanQuery} - BD Govt Job Circular 2026 | All Govt Jobs BD`;
        pageDescription = `Get all recent results and recruitment notices matching "${cleanQuery}" in the Bangladesh Government and Bank Job Circular 2026. Find eligibility and apply now.`;
      }
      
      let ogImageUrl = host + '/govtlog.png';

      let isJobPage = false;
      const isJobsRoute = req.path.match(/^\/jobs\/([^/]+)\/?$/);
      const isLegacyRoute = req.path.match(/^\/([^/]+)\/?$/);
      let jobSlugUrl = '';
      
      if (isJobsRoute) {
        jobSlugUrl = decodeURIComponent(isJobsRoute[1]);
      } else if (isLegacyRoute && !isLegacyRoute[1].includes('.') && isLegacyRoute[1] !== 'api') {
        jobSlugUrl = decodeURIComponent(isLegacyRoute[1]);
      }

      let staticContent = '';
      let finalStatus = 200;

      if (jobSlugUrl) {
        const job = await fetchSingleJob(jobSlugUrl);
        if (job) {
          const standardSlug = job.slug || generateSlug(job.title, job.organization, job.id);
          
          if (!isJobsRoute || standardSlug !== jobSlugUrl) {
            return res.redirect(301, `/jobs/${standardSlug}`);
          }
          
          canonicalUrl = `${host}/jobs/${standardSlug}`;
          isJobPage = true;
          
          const cleanedTitle = job.title.replace(/[<>&'"]/g, '');
          const cleanedOrg = (job.organization || '').replace(/[<>&'"]/g, '');
          
          pageTitle = `${cleanedTitle} - ${cleanedOrg}`;
          ogImageUrl = job.imageUrls?.[0] || host + '/govtlog.png';
          
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
                  "url": host + "/govtlog.png"
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
          
          staticContent = `
            <script type="application/ld+json">
              ${JSON.stringify(jsonLd)}
            </script>
            <script>
              window.__INITIAL_JOB__ = ${JSON.stringify(job).replace(/<\/script>/g, '<\\/script>')};
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
        } else {
          finalStatus = 404;
        }
      }

      if (!isJobPage) {
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
        staticContent = `<script type="application/ld+json">${JSON.stringify(websiteSchema)}</script>`;
      }

      const newHead = `
        <title>${pageTitle}</title>
        <meta name="description" content="${pageDescription}" />
        <link rel="canonical" href="${canonicalUrl}" />
        <meta property="og:title" content="${pageTitle}">
        <meta property="og:description" content="${pageDescription}">
        <meta property="og:url" content="${canonicalUrl}">
        <meta property="og:image" content="${ogImageUrl}">
        <meta property="og:type" content="website">
        <meta property="og:site_name" content="BD Govt Job Circular">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="${pageTitle}">
        <meta name="twitter:description" content="${pageDescription}">
        <meta name="twitter:image" content="${ogImageUrl}">
      `;

      let html = '';
      if (vite) {
        html = await vite.ssrLoadModule('/src/main.tsx').catch(() => ''); // Load module correctly if needed, but for SPA we usually just read index.html
        
        // Actually for Vite SPA, we read the index.html and transform it
        const fs = await import('fs/promises');
        let rawHtml = await fs.readFile(path.join(process.cwd(), 'index.html'), 'utf-8');
        html = await vite.transformIndexHtml(req.originalUrl, rawHtml);
      } else {
        const fs = await import('fs/promises');
        html = await fs.readFile(path.join(process.cwd(), 'dist', 'index.html'), 'utf-8');
      }

      html = html.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
      html = html.replace(/<title>.*?<\/title>/gi, '');
      html = html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/gi, '');
      html = html.replace(/<meta property="og:.*?" content=".*?">\s*/gi, '');

      if (html.includes('<div id="root"></div>')) {
        html = html.replace('<div id="root"></div>', `${staticContent}\n<div id="root"></div>`);
      } else {
        html = html.replace('<body>', `<body>\n${staticContent}`);
      }

      html = html.replace('</head>', `${newHead}\n</head>`);

      res.status(finalStatus).send(html);
    } catch (e) {
      console.error(e);
      next(e);
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
