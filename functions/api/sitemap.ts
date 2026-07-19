import { fetchLatestJobs, generateSlug } from './jobs';

export async function onRequest(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  
  // Set host dynamically or use production domain
  const host = 'https://jobs.talukdaracademy.com.bd';
  
  try {
    const jobs = await fetchLatestJobs(true);
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n`;
    
    // Add main URL
    xml += `  <url>\n`;
    xml += `    <loc>${host}/</loc>\n`;
    xml += `    <changefreq>daily</changefreq>\n`;
    xml += `    <priority>1.0</priority>\n`;
    xml += `  </url>\n`;
    
    // Add job URLs
    jobs.forEach((job: any) => {
      const slug = job.slug || generateSlug(job.title, job.organization, job.id);
      const loc = `${host}/jobs/${slug}`;
      const pubDate = job.publishedDate ? job.publishedDate.split('T')[0] : new Date().toISOString().split('T')[0];
      const cleanTitle = (job.title || '').replace(/[<>&'"]/g, '');
      const cleanOrg = (job.organization || '').replace(/[<>&'"]/g, '');
      
      xml += `  <url>\n`;
      xml += `    <loc>${loc}</loc>\n`;
      xml += `    <lastmod>${pubDate}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;
      
      // Google News tags
      xml += `    <news:news>\n`;
      xml += `      <news:publication>\n`;
      xml += `        <news:name>BD Govt Job Circular</news:name>\n`;
      xml += `        <news:language>bn</news:language>\n`;
      xml += `      </news:publication>\n`;
      xml += `      <news:publication_date>${job.publishedDate}</news:publication_date>\n`;
      xml += `      <news:title>${cleanTitle}</news:title>\n`;
      xml += `    </news:news>\n`;
      
      xml += `  </url>\n`;
    });
    
    xml += `</urlset>\n`;
    
    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=14400' // 4 hours cache
      }
    });
  } catch (error: any) {
    console.error('Failed to generate sitemap:', error);
    // Return a basic fallback sitemap so it doesn't 500
    let fallbackXml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    fallbackXml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    fallbackXml += `  <url>\n`;
    fallbackXml += `    <loc>${host}/</loc>\n`;
    fallbackXml += `    <changefreq>daily</changefreq>\n`;
    fallbackXml += `    <priority>1.0</priority>\n`;
    fallbackXml += `  </url>\n`;
    fallbackXml += `</urlset>\n`;
    
    return new Response(fallbackXml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8'
      }
    });
  }
}
