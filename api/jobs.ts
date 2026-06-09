import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

const httpsAgent = new https.Agent({  
  rejectUnauthorized: false
});

// Slug generation function
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

// Convert Bengali numerals & month words to English Dates
const parseDeadline = (deadlineStr: string): Date | null => {
  if (!deadlineStr || deadlineStr.includes('দেখুন') || deadlineStr.includes('চলমান')) return null;
  
  const bengaliToEnglish = (str: string) => {
    const numerals: { [key: string]: string } = {
      '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
    };
    return str.replace(/[০-৯]/g, d => numerals[d]);
  };

  let cleanStr = bengaliToEnglish(deadlineStr);
  cleanStr = cleanStr.replace(/[।\/]/g, '-').replace(/\s+/g, ' ').trim();

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

  const parts = cleanStr.split(/[-\s]/);
  if (parts.length >= 3) {
    const day = parts[0];
    const month = parts[1];
    const year = parts[2];
    if (!isNaN(parseInt(day)) && !isNaN(parseInt(month)) && !isNaN(parseInt(year))) {
      if (year.length === 4) {
         cleanStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }

  const date = new Date(cleanStr);
  return isNaN(date.getTime()) ? null : date;
};

// Custom Bengali Date Extractor for precise publication date
const parseBengaliDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  
  const bengaliToEnglish = (str: string) => {
    const numerals: { [key: string]: string } = {
      '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
    };
    return str.replace(/[০-৯]/g, d => numerals[d]);
  };

  let cleanStr = dateStr.replace(/[।\.]/g, '').replace(/\s+/g, ' ').trim();
  const parts = cleanStr.split(/[,&|\sওএবং]+/);
  
  const monthsList = [
    'জানুয়ারি', 'জানুয়ারী', 'ফেব্রুয়ারি', 'ফেব্রুয়ারী', 'মার্চ', 'এপ্রিল', 
    'মে', 'জুন', 'জুলাই', 'আগস্ট', 'আগষ্ট', 'সেপ্টেম্বর', 'সেপ্টেম্বার', 
    'অক্টোবর', 'অক্টোবার', 'নভেম্বর', 'নভেম্বার', 'ডিসেম্বর', 'ডিসেম্বার'
  ];

  const monthsMap: { [key: string]: string } = {
    'জানুয়ারি': 'January', 'জানুয়ারী': 'January',
    'ফেব্রুয়ারি': 'February', 'ফেব্রুয়ারী': 'February',
    'মার্চ': 'March', 'এপ্রিল': 'April', 'মে': 'May', 'জুন': 'June', 'জুলাই': 'July',
    'আগস্ট': 'August', 'আগষ্ট': 'August',
    'সেপ্টেম্বর': 'September', 'সেপ্টেম্বার': 'September',
    'অক্টোবর': 'October', 'অক্টোবার': 'October',
    'নভেম্বর': 'November', 'নভেম্বার': 'November',
    'ডিসেম্বর': 'December', 'ডিসেম্বার': 'December'
  };

  let year: string | null = null;
  let month: string | null = null;
  let day: string | null = null;

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
      month = monthsMap[matchedMonthKey];
      continue;
    }
    if (!day && /^\d{1,2}$/.test(cleanPart)) {
      day = cleanPart;
      continue;
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

// Global memory cache for Vercel serverless function (will persist across warm invocations but empty on cold starts)
let cachedJobsFull: any[] | null = null;
let cachedJobsBrief: any[] | null = null;
let lastFetchFull: number = 0;
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
  const sources = [
    { name: 'BD Govt Job', baseUrl: 'https://bdgovtjob.net/wp-json/wp/v2/posts?_embed' }
  ];

  const seenTitles = new Set();
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  const targetCount = isFull ? 350 : 40;
  const maxSearchPages = isFull ? 8 : 2;

  for (const source of sources) {
    try {
      console.log(`Fetching from API: ${source.name} (Full: ${isFull})...`);
      
      for (let page = 1; page <= maxSearchPages; page++) {
        if (jobs.length >= targetCount) break;

        const timestamp = Date.now();
        const response = await axios.get(`${source.baseUrl}&per_page=100&page=${page}&_t=${timestamp}`, { 
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
            if (deadlineDate && deadlineDate < thirtyDaysAgo) {
              return; 
            }

            const pubDate = new Date(post.date);
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(today.getDate() - 90);
            if (pubDate < ninetyDaysAgo && (!deadlineDate || deadlineDate < today)) {
               return;
            }

            seenTitles.add(titleText.toLowerCase());

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
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
              .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
              .replace(/<ins\b[^<]*(?:(?!<\/ins>)<[^<]*)*<\/ins>/gi, '')
              .replace(/Source:|Powered by|Originally published on|See original post/gi, '')
              .trim();

            const remainingDays = extractFromTableOrText(['কয়দিন বাকি', 'আবেদনের সময় বাকি', 'সময় বাকি', 'Time Remaining', 'Remaining Days', 'Days Remaining']);
            const startTime = extractFromTableOrText(['আবেদন শুরুর তারিখ', 'আবেদন শুরু তারিখ', 'আবেদন শুরু', 'শুরু', 'Start Date', 'StartTime']) || "চলমান";
            const applyMethod = extractFromTableOrText(['আবেদনের পদ্ধতি', 'আবেদন পদ্ধতি', 'পদ্ধতি', 'How to Apply', 'Apply Method']) || "অনলাইনে / ডাকযোগে";
            const noticeSource = extractFromTableOrText(['বিজ্ঞপ্তির সোর্স', 'সূত্র', 'সোর্স', 'Source']) || "অনলাইন / অফিসিয়াল ওয়েবসাইট";
            
            let orgName = extractFromTableOrText(['প্রতিষ্ঠানের নাম', 'প্রতিষ্ঠান', 'Organisation', 'Organization', 'Company Name']);
            if (!orgName) {
              orgName = title.split(/Job|Circular|নিয়োগ|বিজ্ঞপ্তি/i)[0].trim();
              if (!orgName || orgName.length < 3) orgName = source.name;
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

            const pubDateText = extractFromTableOrText(['বিজ্ঞপ্তি প্রকাশের তারিখ', 'প্রকাশের তারিখ', 'বিজ্ঞপ্তি প্রকাশ', 'Publish Date', 'Published Date']);
            let finalPubDate = pubDate;
            if (pubDateText) {
              const parsedCustom = parseBengaliDate(pubDateText);
              if (parsedCustom && !isNaN(parsedCustom.getTime())) {
                const yr = parsedCustom.getFullYear();
                if (yr >= 2024 && yr <= 2030) {
                  finalPubDate = parsedCustom;
                }
              }
            }

            if (cleanContent.length > 50) {
              jobs.push({
                id: `${post.id}`,
                slug: generateSlug(titleText, orgName, post.slug ? post.slug.toString() : `${post.id}`),
                title: titleText,
                organization: orgName,
                publishedDate: finalPubDate.toISOString(),
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
              });
            }
          });
        } else {
          break;
        }
      }
    } catch (e: any) {
      console.error(`${source.name} API failed:`, e.response?.status, e.message);
    }
  }

  // NOTE: do not sort here, retain API natural fetch order
  
  if (isFull) {
    cachedJobsFull = jobs;
    lastFetchFull = now;
  } else {
    cachedJobsBrief = jobs;
    lastFetchBrief = now;
  }

  if (jobs.length > 0) return jobs;

  const todayDate = new Date().toISOString();
  return [
    {
      id: "f1",
      slug: "assistant-director-bangladesh-bank",
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
}

async function fetchSingleJob(slugOrId: string) {
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
    const response = await axios.get(endpoint, { timeout: 15000 });
    const post = isId ? response.data : (Array.isArray(response.data) ? response.data[0] : null);

    if (!post || !post.id) return null;

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
      return null;
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

    return {
      id: `${post.id}`,
      slug: generateSlug(titleText, title.split(/Job|Circular|নিয়োগ|বিজ্ঞপ্তি/i)[0].trim(), post.slug ? post.slug.toString() : `${post.id}`),
      title: titleText,
      organization: title.split(/Job|Circular|নিয়োগ|বিজ্ঞপ্তি/i)[0].trim() || "Job Circular",
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { id, full } = req.query;
    
    if (id) {
      const job = await fetchSingleJob(id as string);
      if (job) {
        return res.status(200).json(job);
      } else {
        return res.status(404).json({ error: 'Job not found' });
      }
    }

    const isFull = full === 'true';
    const jobs = await fetchLatestJobs(isFull);
    
    // PREVENT CACHING: Tell Vercel and browsers to always revalidate
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.status(200).json(jobs);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
}
