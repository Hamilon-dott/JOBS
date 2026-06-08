import { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, query, orderBy, limit, deleteDoc, writeBatch } from 'firebase/firestore';
import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import fs from 'fs';
import path from 'path';

const httpsAgent = new https.Agent({  
  rejectUnauthorized: false
});

// Initialize Firebase from environment variables on Vercel
let firebaseApp: any;
let db: any;

const initializeFirebaseInVercel = () => {
  if (db) return db;
  
  let firebaseConfig: any;
  let firestoreDatabaseId: string | undefined;

  if (process.env.FIREBASE_API_KEY) {
    firebaseConfig = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
      measurementId: process.env.FIREBASE_MEASUREMENT_ID || ""
    };
    firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID;
  } else {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      firebaseConfig = configData;
      firestoreDatabaseId = configData.firestoreDatabaseId;
    } else {
      throw new Error("Firebase configuration not found. Please set FIREBASE_API_KEY env variables or ensure firebase-applet-config.json exists.");
    }
  }

  firebaseApp = initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp, firestoreDatabaseId);
  return db;
};

// Help generate english/seo safe sluggified text
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

// Fetch Word Press content & parse
async function fetchJobsFromWP(isQuick: boolean = false): Promise<any[]> {
  const jobs: any[] = [];
  const sources = [
    { name: 'BD Govt Job', baseUrl: 'https://bdgovtjob.net/wp-json/wp/v2/posts?_embed' }
  ];

  const seenTitles = new Set();
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  const targetCount = isQuick ? 80 : 500; // Store up to 500 active jobs per guidelines
  const maxSearchPages = isQuick ? 2 : 10;

  for (const source of sources) {
    try {
      for (let page = 1; page <= maxSearchPages; page++) {
        if (jobs.length >= targetCount) break;

        const timestamp = Date.now();
        const response = await axios.get(`${source.baseUrl}&per_page=100&page=${page}&_t=${timestamp}`, { 
          httpsAgent, 
          timeout: 45000,
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
            
            // Filter out old expired circulars
            if (deadlineDate && deadlineDate < thirtyDaysAgo) {
              return; 
            }

            // Exclude single very old listings
            const pubDateDefault = new Date(post.date);
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(today.getDate() - 90);
            if (pubDateDefault < ninetyDaysAgo && (!deadlineDate || deadlineDate < today)) {
               return;
            }

            seenTitles.add(titleText.toLowerCase());

            // Image collection
            const imgMatches = rawContent.matchAll(/src=["']([^"'>]+\.(?:jpg|jpeg|png|webp|gif)[^"'>]*)["']/gi);
            const imageUrls = Array.from(imgMatches, m => m[1]);

            // Category classification
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

            const remainingDays = extractFromTableOrText(['কয়দিন বাকি', 'আবেদনের সময় বাকি', 'সময় বাকি', 'Time Remaining', 'Remaining Days', 'Days Remaining']);
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
              const urlText = $(el).text().toLowerCase();
              if (commonDomains.some(d => href.includes(d)) || urlText.includes('apply online') || urlText.includes('আবেদন করুন')) {
                applyLink = href;
                return false;
              }
            });

            // Get exact published date
            const pubDateText = extractFromTableOrText(['বিজ্ঞপ্তি প্রকাশের তারিখ', 'প্রকাশের তারিখ', 'বিজ্ঞপ্তি প্রকাশ', 'Publish Date', 'Published Date']);
            let finalPubDate = pubDateDefault;
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
      console.error(`${source.name} API parsing error:`, e.message);
    }
  }

  return jobs.sort((a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime());
}

// Expired cleanup routine (older than 3 months of deadline)
async function cleanupExpired(firestoreDb: any) {
  try {
    const jobsRef = collection(firestoreDb, 'jobs');
    const snapshot = await getDocs(jobsRef);
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 3);

    let count = 0;
    for (const jobDoc of snapshot.docs) {
      const data = jobDoc.data();
      if (data && data.deadlineISO) {
        const dDate = new Date(data.deadlineISO);
        if (!isNaN(dDate.getTime()) && dDate < cutoffDate) {
          await deleteDoc(doc(firestoreDb, 'jobs', jobDoc.id));
          count++;
        }
      }
    }
    return count;
  } catch (error: any) {
    console.error("Expired job cleanup error on Vercel:", error.message);
    return 0;
  }
}

// Serverless Handler Entrypoint
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const isQuick = req.query.quick === 'true' || req.query.q === '1';
    
    // 1. Authorize trigger (Can be open or optionally protected)
    const firestoreDb = initializeFirebaseInVercel();
    
    console.log("Vercel Cron: Running cleanups standard...");
    const cleanedCount = await cleanupExpired(firestoreDb);

    console.log(`Vercel Cron: Running direct WP parser sync to Firebase Firestore (isQuick: ${isQuick})...`);
    const jobs = await fetchJobsFromWP(isQuick);
    
    let syncedCount = 0;
    
    // Write in batch chunk sizes of 200 (Firestore max batch size is 500)
    const chunkSize = 200;
    for (let i = 0; i < jobs.length; i += chunkSize) {
      const chunk = jobs.slice(i, i + chunkSize);
      const batch = writeBatch(firestoreDb);
      
      for (const job of chunk) {
        const jobRef = doc(firestoreDb, 'jobs', job.id);
        batch.set(jobRef, {
          ...job,
          _syncToken: "BdGovtJobAdminSyncX123"
        });
      }
      
      await batch.commit();
      syncedCount += chunk.length;
    }

    return res.status(200).json({
      success: true,
      message: `Sync complete successfully on Vercel. Synced ${syncedCount} jobs.`,
      stats: {
        cleanedCount,
        syncedCount,
        totalWPFetched: jobs.length
      }
    });
  } catch (error: any) {
    console.error("Vercel Cron failure handlings:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed during serverless sync process."
    });
  }
}
