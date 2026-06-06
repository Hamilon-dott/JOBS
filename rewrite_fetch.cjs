const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

// 1. Remove Firebase imports
content = content.replace(/import \{ initializeApp \} from 'firebase\/app';[\s\S]*?setLogLevel\('error'\); \/\/ Suppress benign GrpcConnection idle stream warnings\n+/m, '');

// 2. Remove scheduleDailySyncAtOnePmBST content related to Firebase, replace with Ram Cache
const syncJobsMatchOld = content.match(/async function syncJobsToFirebase[\s\S]*?async function fetchLatestJobs/);
if (syncJobsMatchOld) {
  content = content.replace(syncJobsMatchOld[0], 
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

// 3. Remove cleanupExpiredJobsFromFirebase
const cleanupMatch = content.match(/async function cleanupExpiredJobsFromFirebase[\s\S]*?interface FirestoreCache/);
if (cleanupMatch) {
  content = content.replace(cleanupMatch[0], `interface RAMCache`);
}

// 4. Update the sync in scheduler
content = content.replace(/const result = await syncJobsToFirebase\(false, true\);/g, 'const result = await refreshRAMCache();');
content = content.replace(/await cleanupExpiredJobsFromFirebase\(\);/g, '');

// 5. Replace fetchLatestJobs and fetchSingleJob completely
const fetchLatestJobsRegex = /async function fetchLatestJobs\([\s\S]*$/;
const replacement = `async function fetchLatestJobs(isFull: boolean = false, isAdmin: boolean = false) {
  const now = Date.now();
  // Serve from memory cache if active and clean
  if (!isAdmin) {
    if (isFull) {
      if (cachedLatestJobsFull && (now - cachedLatestJobsFull.timestamp < RAM_CACHE_TTL)) {
        console.log("Serving full jobs from Server memory cache...");
        return cachedLatestJobsFull.jobs;
      }
    } else {
      if (cachedLatestJobsBrief && (now - cachedLatestJobsBrief.timestamp < RAM_CACHE_TTL)) {
        console.log("Serving brief jobs from Server memory cache...");
        return cachedLatestJobsBrief.jobs;
      }
    }
  }

  console.log("Fetching jobs from WP API...");
  const jobs = await fetchJobsFromWP(isFull);
  
  if (!jobs || jobs.length === 0) {
    return [];
  }

  // Populate server memory caches
  if (isFull) {
    cachedLatestJobsFull = { jobs, timestamp: now };
  } else {
    cachedLatestJobsBrief = { jobs, timestamp: now };
  }

  return jobs;
}

async function fetchSingleJob(slugOrId: string) {
  const now = Date.now();
  
  if (cachedLatestJobsFull && (now - cachedLatestJobsFull.timestamp < RAM_CACHE_TTL)) {
    const job = cachedLatestJobsFull.jobs.find((j: any) => String(j.id) === String(slugOrId) || j.slug === slugOrId);
    if (job && job.content) {
      return job;
    }
  }
  
  if (cachedLatestJobsBrief && (now - cachedLatestJobsBrief.timestamp < RAM_CACHE_TTL)) {
    const job = cachedLatestJobsBrief.jobs.find((j: any) => String(j.id) === String(slugOrId) || j.slug === slugOrId);
    if (job && job.content) {
      return job;
    }
  }

  if (singleJobMapCache.has(slugOrId)) {
    const cachedItem = singleJobMapCache.get(slugOrId)!;
    if (now - cachedItem.timestamp < SINGLE_JOB_CACHE_TTL) {
       return cachedItem.job;
    } else {
       singleJobMapCache.delete(slugOrId);
    }
  }

  // Fallback to fetch from WP API
  try {
    const isId = /^\\d+$/.test(slugOrId);
    let jobData = null;
    if (!isId) {
      const resp = await axios.get(\`https://bdgovtjob.net/wp-json/wp/v2/posts?slug=\${slugOrId}&_embed\`, { timeout: 15000 });
      if (resp.data && resp.data.length > 0) {
        jobData = resp.data[0];
      }
    } else {
      const resp = await axios.get(\`https://bdgovtjob.net/wp-json/wp/v2/posts/\${slugOrId}?_embed\`, { timeout: 15000 });
      if (resp.data) {
        jobData = resp.data;
      }
    }
    
    if (jobData) {
      const pubDate = new Date(jobData.date);
      const rawContent = jobData.content.rendered;
      const strippedContent = rawContent.replace(/<a\\b[^>]*>(.*?)<\\/a>/gi, '$1').trim();
      const imageUrls = [
          jobData._embedded?.['wp:featuredmedia']?.[0]?.source_url,
      ].filter(Boolean);

      const parsedJob = {
          id: jobData.id,
          title: jobData.title.rendered.replace(/&#8211;/g, '-').replace(/&#8217;/g, "'"),
          organization: "Job Circular",
          publishedDate: pubDate.toISOString(),
          deadline: "See Details", 
          source: 'General',
          link: jobData.link,
          location: 'Bangladesh',
          content: strippedContent,
          imageUrls: imageUrls,
          slug: jobData.slug // Save the slug directly
      };
      
      singleJobMapCache.set(slugOrId, { job: parsedJob, timestamp: now });
      return parsedJob;
    }
  } catch (error) {
    console.error("Error fetching single job from WP API:", error);
  }

  return null;
}
`;

content = content.replace(fetchLatestJobsRegex, replacement);

// Rename types and replace FIRESTORE_CACHE_TTL
content = content.replace(/FIRESTORE_CACHE_TTL/g, 'RAM_CACHE_TTL');
content = content.replace(/FirestoreCache/g, 'RAMCache');

fs.writeFileSync('server.ts', content);
