const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf-8');

// Remove Firebase imports and initialization
content = content.replace(/import \{ initializeApp \} from 'firebase\/app';[\s\S]*?setLogLevel\('error'\); \/\/ Suppress benign GrpcConnection idle stream warnings\n+/m, '');

// Rename FIRESTORE_CACHE_TTL
content = content.replace(/FIRESTORE_CACHE_TTL/g, 'RAM_CACHE_TTL');

// Replace syncJobsToFirebase function block
const syncJobsMatch = content.match(/async function syncJobsToFirebase[\s\S]*?async function fetchLatestJobs/);
if (syncJobsMatch) {
  content = content.replace(syncJobsMatch[0], 
`async function refreshRAMCache() {
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

async function fetchLatestJobs`);
}

// Replace cleanupExpiredJobsFromFirebase function block
const cleanupMatch = content.match(/async function cleanupExpiredJobsFromFirebase[\s\S]*?interface FirestoreCache/);
if (cleanupMatch) {
  content = content.replace(cleanupMatch[0], `interface FirestoreCache`);
}
content = content.replace(/await cleanupExpiredJobsFromFirebase\(\);/g, '');

// Fix BST scheduler
content = content.replace(/const result = await syncJobsToFirebase\(false, true\); \/\/ Full background sync/g, 'const result = await refreshRAMCache();');


fs.writeFileSync('server.ts.new', content);
