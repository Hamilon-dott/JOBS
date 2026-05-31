import { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, query, orderBy, limit, updateDoc } from 'firebase/firestore';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

// Parse/Get Service Account credentials
function getGoogleCredentials() {
  // Option 1: Env variable GOOGLE_SERVICE_ACCOUNT_KEY containing the entire JSON object
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      return {
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
        projectId: parsed.project_id
      };
    } catch (e: any) {
      console.warn("Could not parse GOOGLE_SERVICE_ACCOUNT_KEY env string:", e.message);
    }
  }

  // Option 2: Individual variables
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
      privateKey: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      projectId: process.env.GOOGLE_PROJECT_ID || ""
    };
  }

  // Option 3: Local file for preview/development
  try {
    const localFilePath = path.join(process.cwd(), 'service-account.json');
    if (fs.existsSync(localFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(localFilePath, 'utf-8'));
      return {
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
        projectId: parsed.project_id
      };
    }
  } catch (e: any) {
    console.warn("Could not load local service-account.json:", e.message);
  }

  return null;
}

// Initialize Firestore
let firebaseApp: any;
let db: any;

const getDb = () => {
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
      throw new Error("Firebase config not found.");
    }
  }

  firebaseApp = initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp, firestoreDatabaseId);
  return db;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Check if configuration exists
    const creds = getGoogleCredentials();
    if (!creds || !creds.clientEmail || !creds.privateKey) {
      return res.status(200).json({
        configured: false,
        message: "Google Indexing API is not configured. Please add GOOGLE_SERVICE_ACCOUNT_KEY env variable or service-account.json file.",
        credentialsChecked: {
          clientEmailExists: !!creds?.clientEmail,
          privateKeyExists: !!creds?.privateKey
        }
      });
    }

    const firestoreDb = getDb();
    
    // Check path for manual single URL trigger
    const { action, manualUrl } = req.body || {};
    
    // Auth client
    const jwtClient = new google.auth.JWT({
      email: creds.clientEmail,
      key: creds.privateKey,
      scopes: ['https://www.googleapis.com/auth/indexing']
    });

    await jwtClient.authorize();
    const indexing = google.indexing({
      version: 'v3',
      auth: jwtClient
    });

    const isLocalhost = (req.headers.host || '').includes('localhost');
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const domainHost = req.headers.host || 'jobs.talukdaracademy.com.bd';
    const baseUrl = isLocalhost ? `${protocol}://${domainHost}` : 'https://jobs.talukdaracademy.com.bd';

    // 1. If checking status, return config and counts without executing index requests
    if (action === 'status' || action === 'get_status') {
      const jobsRef = collection(firestoreDb, 'jobs');
      const q = query(jobsRef, orderBy('publishedDate', 'desc'), limit(150));
      const snapshot = await getDocs(q);
      
      const jobs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];

      const numGoogleIndexed = jobs.filter(j => j.isGoogleIndexed).length;
      const numPending = jobs.filter(j => !j.isGoogleIndexed && j.slug).length;

      return res.status(200).json({
        configured: true,
        success: true,
        clientEmail: creds.clientEmail,
        stats: {
          totalChecked: jobs.length,
          totalIndexed: numGoogleIndexed,
          totalPending: numPending
        }
      });
    }

    // 2. If manualUrl is specified, index it directly
    if (action === 'index_url' && manualUrl) {
      console.log(`Manual indexing request for: ${manualUrl}`);
      try {
        const response = await indexing.urlNotifications.publish({
          requestBody: {
            url: manualUrl,
            type: 'URL_UPDATED'
          }
        });
        return res.status(200).json({
          success: true,
          configured: true,
          message: `Successfully submitted manual indexing request for ${manualUrl}`,
          googleResponse: response.data
        });
      } catch (err: any) {
        return res.status(400).json({
          success: false,
          configured: true,
          message: `Google Indexing error: ${err.message}`,
          details: err.response?.data || {}
        });
      }
    }

    // 2. Default trigger: Index pending (non-indexed) jobs in Firestore
    const jobsRef = collection(firestoreDb, 'jobs');
    const q = query(jobsRef, orderBy('publishedDate', 'desc'), limit(150));
    const snapshot = await getDocs(q);
    
    const jobs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];

    // Filter jobs that have not been indexed yet
    const pendingJobs = jobs.filter(j => !j.isGoogleIndexed && j.slug).slice(0, 50); // Batch index up to 50 at a time to stay safe in quotas

    if (pendingJobs.length === 0) {
      return res.status(200).json({
        configured: true,
        success: true,
        syncedCount: 0,
        message: "All jobs are already indexed! No new URLs require update.",
        stats: {
          totalChecked: jobs.length,
          totalIndexed: jobs.filter(j => j.isGoogleIndexed).length
        }
      });
    }

    console.log(`Submitting ${pendingJobs.length} URLs to Google Indexing API...`);
    const successfulUrls: string[] = [];
    const failedUrls: any[] = [];

    for (const job of pendingJobs) {
      const targetUrl = `${baseUrl}/jobs/${job.slug}`;
      try {
        await indexing.urlNotifications.publish({
          requestBody: {
            url: targetUrl,
            type: 'URL_UPDATED'
          }
        });
        
        // Mark as indexed in Firestore
        const docRef = doc(firestoreDb, 'jobs', job.id);
        await updateDoc(docRef, {
          isGoogleIndexed: true,
          googleIndexedAt: new Date().toISOString()
        });
        
        successfulUrls.push(targetUrl);
      } catch (err: any) {
        console.error(`Failed to index URL ${targetUrl}:`, err.message);
        failedUrls.push({ url: targetUrl, error: err.message });
        
        // If we hit dynamic quota restrictions, break early
        if (err.message?.includes('Quota') || err.message?.includes('429')) {
          console.warn("Google Indexing API Quota exceeded. Halting loop.");
          break;
        }
      }
    }

    return res.status(200).json({
      configured: true,
      success: true,
      syncedCount: successfulUrls.length,
      failedCount: failedUrls.length,
      successfulUrls,
      failedUrls,
      stats: {
        totalChecked: jobs.length,
        totalIndexed: jobs.filter(j => j.isGoogleIndexed).length + successfulUrls.length
      }
    });

  } catch (error: any) {
    console.error("Index handler overall error:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
