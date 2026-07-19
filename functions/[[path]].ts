import { fetchSingleJob, generateSlug } from './api/jobs';

export async function onRequest(context: any) {
  const { request, next } = context;
  const url = new URL(request.url);

  // Avoid intercepting API routes or static files
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|css|js|ts|tsx|ico|xml|txt|json)$/i)
  ) {
    return next();
  }

  const response = await next();

  // Only rewrite HTML responses
  if (!response.headers.get('content-type')?.includes('text/html')) {
    return response;
  }

  let html = await response.text();
  const host = (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    ? `${url.protocol}//${url.host}`
    : 'https://jobs.talukdaracademy.com.bd';

  let reqPath = url.pathname;
  if (reqPath === '/index.html') {
    reqPath = '/';
  } else if (reqPath.length > 1 && reqPath.endsWith('/')) {
    reqPath = reqPath.slice(0, -1);
  }
  let canonicalUrl = host + reqPath;

  let pageTitle = "BD Govt Job Circular 2026 - Government and Bank Jobs";
  let pageDescription = "Find the latest Bangladesh government and bank job circulars, exam dates, results, and notifications daily.";

  const searchQuery = url.searchParams.get('search') || url.searchParams.get('q') || '';
  if (searchQuery) {
    const cleanQuery = String(searchQuery).replace(/[<>&'"]/g, '');
    pageTitle = `${cleanQuery} - BD Govt Job Circular 2026 | All Govt Jobs BD`;
    pageDescription = `Get all recent results and recruitment notices matching "${cleanQuery}" in the Bangladesh Government and Bank Job Circular 2026. Find eligibility and apply now.`;
  }

  let ogImageUrl = host + '/govtlog.png';

  html = html.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
  html = html.replace(/<title>.*?<\/title>/gi, '');
  html = html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/gi, '');
  html = html.replace(/<meta property="og:.*?" content=".*?">\s*/gi, '');

  let isJobPage = false;
  const isJobsRoute = url.pathname.match(/^\/jobs\/([^/]+)\/?$/);
  const isLegacyRoute = url.pathname.match(/^\/([^/]+)\/?$/);
  let jobSlugUrl = '';

  if (isJobsRoute) {
    jobSlugUrl = decodeURIComponent(isJobsRoute[1]);
  } else if (isLegacyRoute && !isLegacyRoute[1].includes('.') && isLegacyRoute[1] !== 'api') {
    jobSlugUrl = decodeURIComponent(isLegacyRoute[1]);
  }

  let staticContent = '';
  let finalStatus = 200;

  if (jobSlugUrl) {
    try {
      const job = await fetchSingleJob(jobSlugUrl);
      if (job) {
        const standardSlug = job.slug || generateSlug(job.title, job.organization, job.id);
        
        if (!isJobsRoute || standardSlug !== jobSlugUrl) {
          return new Response(null, {
            status: 301,
            headers: { Location: `/jobs/${standardSlug}` }
          });
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
      }
    } catch (e) {
      console.error('Failed to fetch job for SEO rendering:', e);
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

  if (html.includes('<div id="root"></div>')) {
    html = html.replace('<div id="root"></div>', `${staticContent}\n<div id="root"></div>`);
  } else {
    html = html.replace('<body>', `<body>\n${staticContent}`);
  }

  html = html.replace('</head>', `${newHead}\n</head>`);

  return new Response(html, {
    status: finalStatus,
    headers: { 'Content-Type': 'text/html' }
  });
}
