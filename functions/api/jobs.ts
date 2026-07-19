import { load } from 'cheerio';

let cachedJobsFull: any[] | null = null;
let lastFetchFull = 0;
let cachedJobsBrief: any[] | null = null;
let lastFetchBrief = 0;

export function generateSlug(title: string, organization: string, id: string) {
  const cleanStr = (str: string) => {
    return (str || '')
      .replace(/&#[0-9]+;/g, '')
      .replace(/<\/?[^>]+(>|$)/g, "")
      .replace(/[^\w\s\u0980-\u09FF-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase();
  };
  let slug = '';
  if (organization) slug += cleanStr(organization) + '-';
  slug += cleanStr(title);
  if (!slug) slug = id;
  return slug;
}

export async function fetchLatestJobs(isFull: boolean) {
  const now = Date.now();
  if (isFull && cachedJobsFull && now - lastFetchFull < 300000) return cachedJobsFull;
  if (!isFull && cachedJobsBrief && now - lastFetchBrief < 300000) return cachedJobsBrief;

  const jobs: any[] = [];
  try {
    const endpoint = 'https://bdgovtjob.net/wp-json/wp/v2/posts?_embed&per_page=100';
    
    // Cloudflare compatible safe timeout fetch with realistic browser headers
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 15000) : null;
    const response = await fetch(endpoint, { 
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8'
      },
      signal: controller ? controller.signal : undefined 
    });
    if (timeoutId) clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`WordPress API returned status ${response.status} ${response.statusText}. Snippet: ${errText.substring(0, 300)}`);
    }
    
    const posts = await response.json();

    if (Array.isArray(posts)) {
      posts.forEach((post: any) => {
        const title = post.title?.rendered || "Job Circular";
        const titleText = title.replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").replace(/<\/?[^>]+(>|$)/g, "").trim();
        const rawContent = post.content?.rendered || "";
        const $ = load(rawContent);

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
          return result;
        };

        const deadline = extractFromTableOrText(['আবেদনের শেষ তারিখ', 'আবেদনের শেষ সময়', 'আবেদন শেষ', 'Last Date', 'Deadline']) || "সার্কুলার দেখুন";
        
        let orgName = extractFromTableOrText(['প্রতিষ্ঠানের নাম', 'প্রতিষ্ঠান', 'Organisation', 'Organization', 'Company Name']);
        if (!orgName) {
          orgName = title.split(/Job|Circular|নিয়োগ|বিজ্ঞপ্তি/i)[0].trim() || "Job Circular";
        }

        const imgMatches = rawContent.matchAll(/src=["']([^"'>]+\.(?:jpg|jpeg|png|webp|gif)[^"'>]*)["']/gi);
        const imageUrls = Array.from(imgMatches, m => m[1]);

        const embeddedTerms = post._embedded?.['wp:term']?.flat() || [];
        const termNames = embeddedTerms.map((t: any) => t.name.toLowerCase());
        const categories: string[] = [];
        if (termNames.some((n: any) => n.includes('govt') || n.includes('সরকারি'))) categories.push('Government');
        if (termNames.some((n: any) => n.includes('bank') || n.includes('ব্যাংক'))) categories.push('Bank');
        if (categories.length === 0) categories.push('General');

        jobs.push({
          id: `${post.id}`,
          slug: generateSlug(titleText, orgName, post.slug ? post.slug.toString() : `${post.id}`),
          title: titleText,
          organization: orgName,
          publishedDate: new Date(post.date).toISOString(),
          deadline: deadline,
          source: categories.join(','),
          link: post.link,
          location: 'Bangladesh',
          content: rawContent.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1').trim(),
          imageUrls: imageUrls
        });
      });
    }
  } catch (e) {
    console.error(`Failed to fetch jobs:`, e);
  }

  if (isFull) {
    cachedJobsFull = jobs;
    lastFetchFull = now;
  } else {
    cachedJobsBrief = jobs;
    lastFetchBrief = now;
  }
  
  if (jobs.length > 0) return jobs;
  return [];
}

export async function fetchSingleJob(slugOrId: string) {
  if (cachedJobsFull) {
    const cached = cachedJobsFull.find(j => j.id === slugOrId || j.slug === slugOrId);
    if (cached) return cached;
  }
  
  try {
    const isId = /^\d+$/.test(slugOrId);
    const endpoint = isId
      ? `https://bdgovtjob.net/wp-json/wp/v2/posts/${slugOrId}?_embed`
      : `https://bdgovtjob.net/wp-json/wp/v2/posts?slug=${encodeURIComponent(slugOrId)}&_embed`;
    
    console.log("Fetching single job from API:", endpoint);
    
    // Cloudflare compatible safe timeout fetch with realistic browser headers
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 15000) : null;
    const response = await fetch(endpoint, { 
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8'
      },
      signal: controller ? controller.signal : undefined 
    });
    if (timeoutId) clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`WordPress API returned status ${response.status} ${response.statusText}. Snippet: ${errText.substring(0, 300)}`);
    }
    
    const data = await response.json();
    const post = isId ? data : (Array.isArray(data) ? data[0] : null);
    
    if (!post || !post.id) return null;
    
    const title = post.title?.rendered || "Job Circular";
    const titleText = title.replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").replace(/<\/?[^>]+(>|$)/g, "").trim();
    const rawContent = post.content?.rendered || "";
    const $ = load(rawContent);
    
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
      return result;
    };
    
    const deadline = extractFromTableOrText(['আবেদনের শেষ তারিখ', 'আবেদনের শেষ সময়', 'আবেদন শেষ', 'Last Date', 'Deadline']) || "সার্কুলার দেখুন";
    
    const imgMatches = rawContent.matchAll(/src=["']([^"'>]+\.(?:jpg|jpeg|png|webp|gif)[^"'>]*)["']/gi);
    const imageUrls = Array.from(imgMatches, m => m[1]);
    
    const embeddedTerms = post._embedded?.['wp:term']?.flat() || [];
    const termNames = embeddedTerms.map((t: any) => t.name.toLowerCase());
    const categories: string[] = [];
    if (termNames.some((n: any) => n.includes('govt') || n.includes('সরকারি'))) categories.push('Government');
    if (termNames.some((n: any) => n.includes('bank') || n.includes('ব্যাংক'))) categories.push('Bank');
    if (categories.length === 0) categories.push('General');
    
    let orgName = extractFromTableOrText(['প্রতিষ্ঠানের নাম', 'প্রতিষ্ঠান', 'Organisation', 'Organization', 'Company Name']);
    if (!orgName) {
      orgName = title.split(/Job|Circular|নিয়োগ|বিজ্ঞপ্তি/i)[0].trim() || "Job Circular";
    }

    return {
      id: `${post.id}`,
      slug: generateSlug(titleText, orgName, post.slug ? post.slug.toString() : `${post.id}`),
      title: titleText,
      organization: orgName,
      publishedDate: new Date(post.date).toISOString(),
      deadline: deadline,
      link: post.link,
      source: categories.join(','),
      content: rawContent.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1').trim(),
      imageUrls: imageUrls,
      location: 'Bangladesh'
    };
  } catch (e) {
    console.error(`Fetch single job ${slugOrId} failed:`, e);
    return null;
  }
}

export async function onRequest(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  try {
    const id = url.searchParams.get('id');
    const full = url.searchParams.get('full');
    const diag = url.searchParams.get('diag');
    
    if (diag === 'true') {
      const endpoint = 'https://bdgovtjob.net/wp-json/wp/v2/posts?_embed&per_page=10';
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 10000) : null;
      
      const fetchStart = Date.now();
      let fetchError = null;
      let status = 0;
      let headers: any = {};
      let firstChars = '';
      
      try {
        const res = await fetch(endpoint, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          signal: controller ? controller.signal : undefined
        });
        status = res.status;
        res.headers.forEach((val, key) => {
          headers[key] = val;
        });
        const text = await res.text();
        firstChars = text.substring(0, 1000);
      } catch (err: any) {
        fetchError = { message: err.message, stack: err.stack };
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
      
      return new Response(JSON.stringify({
        success: !fetchError,
        durationMs: Date.now() - fetchStart,
        status,
        headers,
        firstChars,
        error: fetchError
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    
    if (id) {
      const job = await fetchSingleJob(id);
      if (job) {
        return new Response(JSON.stringify(job), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      } else {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    const isFull = full === 'true';
    const jobs = await fetchLatestJobs(isFull);
    
    return new Response(JSON.stringify(jobs), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch jobs', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
