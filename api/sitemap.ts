import { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import axios from 'axios';
import https from 'https';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const httpsAgent = new https.Agent({  
  rejectUnauthorized: false
});

// Initialize Firebase
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
      return null;
    }
  }

  try {
    firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp, firestoreDatabaseId);
    return db;
  } catch (err) {
    console.error("Firebase init error in sitemap:", err);
    return null;
  }
};

// Slug generation utility
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

// Fetch from Firestore (Fast & Accurate)
async function fetchJobSlugsFromFirestore(): Promise<string[] | null> {
  try {
    const firestoreDb = initializeFirebaseInVercel();
    if (!firestoreDb) return null;

    const jobsRef = collection(firestoreDb, 'jobs');
    const q = query(jobsRef, orderBy('publishedDate', 'desc'), limit(500));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    const slugs: string[] = [];
    snapshot.docs.forEach(docSnapshot => {
      const data = docSnapshot.data();
      if (data.slug) {
        slugs.push(data.slug);
      }
    });
    return slugs;
  } catch (err: any) {
    console.error("Sitemap Firestore fetch failed:", err.message);
    return null;
  }
}

// WordPress fallback fetcher
async function fetchJobSlugsFromWP(): Promise<string[]> {
  const slugs: string[] = [];
  try {
    for (let page = 1; page <= 3; page++) {
      const response = await axios.get(`https://bdgovtjob.net/wp-json/wp/v2/posts?per_page=100&page=${page}`, { 
        httpsAgent,
        timeout: 8000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' 
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
    console.error('Sitemap WP API fallback fetch failed:', e);
  }
  return slugs;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const isLocalhost = (req.headers.host || '').includes('localhost');
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const domainHost = req.headers.host || 'jobs.talukdaracademy.com.bd';
  const baseUrl = isLocalhost ? `${protocol}://${domainHost}` : 'https://jobs.talukdaracademy.com.bd';
  
  // Try Firestore, then fallback to API
  let jobSlugs = await fetchJobSlugsFromFirestore();
  if (!jobSlugs || jobSlugs.length === 0) {
    console.log("Sitemap: Firestore database empty or failed. Falling back to WP API...");
    jobSlugs = await fetchJobSlugsFromWP();
  } else {
    console.log(`Sitemap: Successfully served ${jobSlugs.length} job URLs from Firestore.`);
  }

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
    <loc>${baseUrl}/jobs/${slug}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, max-age=14400, s-maxage=14400'); // Cache for 4 hours
  res.status(200).send(sitemap);
}
