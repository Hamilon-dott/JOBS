const fs = require('fs');

let appCode = fs.readFileSync('src/App.tsx', 'utf8');

// Find imports and add helpers if not exist
if (!appCode.includes('DOMParser')) {
  // It's a standard class, doesn't need import
}

const wpParserLogic = `
function parseBengaliDate(dateStr: string): Date | null {
  const bengaliToEnglish: { [key: string]: string } = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
  };
  const bengaliMonthsMap: { [key: string]: string } = {
    'জানুয়ারি': '01', 'ফেব্রুয়ারি': '02', 'মার্চ': '03', 'এপ্রিল': '04',
    'মে': '05', 'জুন': '06', 'জুলাই': '07', 'আগস্ট': '08',
    'সেপ্টেম্বর': '09', 'অক্টোবর': '10', 'নভেম্বর': '11', 'ডিসেম্বর': '12'
  };
  let engStr = dateStr;
  for (const [bn, en] of Object.keys(bengaliToEnglish).map(k => [k, bengaliToEnglish[k]])) {
      engStr = engStr.replace(new RegExp(bn, 'g'), en);
  }
  let monthMatched = false;
  for (const [bnMonth, enMonth] of Object.keys(bengaliMonthsMap).map(k => [k, bengaliMonthsMap[k]])) {
    if (engStr.includes(bnMonth)) {
      engStr = engStr.replace(bnMonth, enMonth);
      monthMatched = true;
      break;
    }
  }
  const dateMatch = engStr.match(/(\\d{1,2})[-\\s\\/]+(\\d{1,2})[-\\s\\/]+(\\d{4})/);
  if (dateMatch) {
    return new Date(\`\${dateMatch[3]}-\${dateMatch[2].padStart(2,'0')}-\${dateMatch[1].padStart(2,'0')}T00:00:00.000Z\`);
  }
  return null;
}

function processWpPostClient(post: any, thirtyDaysAgo: Date, today: Date) {
  const title = post.title?.rendered || "Job Circular";
  const titleText = title.replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").replace(/<\\/?[^>]+(>|$)/g, "").trim();

  const rawContent = post.content?.rendered || "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawContent, 'text/html');

  const extractFromTableOrText = (labels: string[]) => {
    let result = null;
    const rows = doc.querySelectorAll('tr');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowText = row.textContent?.toLowerCase() || '';
      if (labels.some(label => rowText.includes(label.toLowerCase()))) {
        const tds = row.querySelectorAll('td');
        if (tds.length > 0) {
          const value = tds[tds.length - 1].textContent?.trim();
          if (value && value.length > 2 && value.length < 150) {
            result = value;
            break;
          }
        }
      }
    }
    if (result) return result;

    for (const label of labels) {
      const regex = new RegExp(\`\${label}\\\\s*[:\\sম=]+(?:<[^>]+>)*\\s*([^<>\\n]+)\`, 'i');
      const match = rawContent.match(regex);
      if (match && match[1]) {
        const val = match[1].replace(/<\\/?[^>]+(>|$)/g, "").trim();
        if (val.length > 2 && val.length < 150) return val;
      }
    }
    return null;
  };

  let deadlineDate = null;
  const deadlineText = extractFromTableOrText(['আবেদনের শেষ তারিখ', 'আবেদনের শেষ সময়', 'আবেদন শেষ', 'Last Date', 'Deadline']) || "সার্কুলার দেখুন";
  const pdMatch = parseBengaliDate(deadlineText);
  if (pdMatch && !isNaN(pdMatch.getTime())) {
      deadlineDate = pdMatch;
  }

  if (deadlineDate && deadlineDate < thirtyDaysAgo) {
    return null;
  }

  const postPubDate = new Date(post.date_gmt && post.date_gmt !== '0001-11-30T00:00:00' ? \`\${post.date_gmt}Z\` : post.date);
  let pubDate = postPubDate;
  
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(today.getDate() - 90);
  if (pubDate < ninetyDaysAgo && (!deadlineDate || deadlineDate < today)) {
     return null;
  }

  const imgMatches = rawContent.matchAll(/src=["']([^"'>]+\\.(?:jpg|jpeg|png|webp|gif)[^"'>]*)["']/gi);
  const imageUrls = Array.from(imgMatches, m => m[1]);

  let categories: string[] = [];
  const embeddedTerms = post._embedded?.['wp:term']?.flat() || [];
  const termNames = embeddedTerms.map((t: any) => (t.name || '').toLowerCase());
  const titleLower = titleText.toLowerCase();

  const hasGovtTag = termNames.some((name: string) => name === 'সরকারি চাকরি' || name.includes('govt job') || name === 'government job');
  const hasBankTag = termNames.some((name: string) => name === 'ব্যাংক চাকরির খবর' || name.includes('bank job') || name === 'bank');
  const isGovtPhrase = titleLower.includes('সরকারি চাকরি') || titleLower.includes('govt job');
  const isBankPhrase = titleLower.includes('ব্যাংক চাকরির খবর') || titleLower.includes('bank job');

  if ((hasGovtTag || isGovtPhrase)) categories.push('Government');
  if (hasBankTag || isBankPhrase) {
    if (!categories.includes('Bank')) categories.push('Bank');
    if (!categories.includes('Private')) categories.push('Private');
  }
  if (termNames.some((n: string) => n.includes('ngo') || n.includes('এনজিও')) || titleLower.includes('ngo') || titleLower.includes('এনজিও')) {
    if (!categories.includes('NGO')) categories.push('NGO');
  }
  const isPrivate = termNames.some((n: string) => n.includes('বেসরকারি') || n.includes('private')) || 
                    titleLower.includes('private') || 
                    ['private', 'company', 'limited', 'group', 'pvt', 'financial', 'insurance', 'সীমিত', 'গ্রুপ', 'লিমিটেড', 'কোম্পানি', 'বীমা']
                    .some(k => titleLower.includes(k) || termNames.some(t => t.includes(k)));
  
  if (isPrivate && !categories.includes('Private') && !categories.includes('Bank') && !categories.includes('Government') && !categories.includes('NGO')) {
    categories.push('Private');
  }
  if (categories.length === 0) categories.push('General');

  const cleanContent = rawContent.replace(/<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>/gi, '')
    .replace(/<style\\b[^<]*(?:(?!<\\/style>)<[^<]*)*<\\/style>/gi, '')
    .replace(/<a\\b[^>]*>(.*?)<\\/a>/gi, '$1')
    .replace(/Source:|Powered by/gi, '')
    .trim();

  let orgName = extractFromTableOrText(['প্রতিষ্ঠানের নাম', 'প্রতিষ্ঠান', 'Organisation', 'Organization', 'Company Name']);
  if (!orgName) {
    orgName = titleText.split(/Job|Circular|নিয়োগ|বিজ্ঞপ্তি/i)[0].trim();
    if (!orgName || orgName.length < 3) orgName = "BD Govt Job";
  }

  let applyLink = "https://jobs.talukdaracademy.com.bd";
  const commonDomains = ['teletalk.com.bd', 'apply', 'registration', 'form', 'jobs.'];
  const links = doc.querySelectorAll('a');
  for(let i=0; i<links.length; i++) {
    const href = links[i].getAttribute('href') || '';
    const text = links[i].textContent?.toLowerCase() || '';
    if (commonDomains.some(d => href.includes(d)) || text.includes('apply online') || text.includes('আবেদন করুন')) {
      applyLink = href;
      break;
    }
  }

  if (cleanContent.length > 50) {
    return {
      id: String(post.id),
      slug: (titleText.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + post.id).replace(/^-+|-+$/g, ''),
      title: titleText,
      organization: orgName,
      publishedDate: pubDate.toISOString(),
      deadline: deadlineText,
      deadlineISO: deadlineDate ? deadlineDate.toISOString() : null,
      remainingDays: extractFromTableOrText(['কয়দিন বাকি', 'আবেদনের সময় বাকি', 'সময় বাকি', 'Time Remaining', 'Remaining Days', 'Days Remaining']),
      startTime: extractFromTableOrText(['আবেদন শুরুর তারিখ', 'আবেদন শুরু তারিখ', 'আবেদন শুরু', 'শুরু', 'Start Date', 'StartTime']) || "চলমান",
      applyMethod: extractFromTableOrText(['আবেদনের পদ্ধতি', 'আবেদন পদ্ধতি', 'পদ্ধতি', 'How to Apply', 'Apply Method']) || "অনলাইনে / ডাকযোগে",
      noticeSource: extractFromTableOrText(['বিজ্ঞপ্তির সোর্স', 'সূত্র', 'সোর্স', 'Source']) || "অনলাইন / অফিসিয়াল ওয়েবসাইট",
      applyLink: applyLink,
      source: categories.join(','),
      link: post.link,
      location: 'Bangladesh',
      content: cleanContent,
      imageUrls: imageUrls
    };
  }
  return null;
}
`;

// Insert the parser logic above the App component
appCode = appCode.replace(/export default function App\(\) \{/, wpParserLogic + '\nexport default function App() {\n');

// Replace fetchJobs entirely
const fetchJobsRegex = /const fetchJobs = async \(force: boolean = false\) => \{[\s\S]*?\n  \};\n\n  useEffect/m;
const newFetchJobs = `const fetchJobs = async (force: boolean = false) => {
    const CACHE_KEY = 'job_db_cache_v2';
    let hasCachedData = false;
    let cachedSyncTime: number | null = null;
    let cachedJobs: Job[] = [];

    setIsLoadingJobs(true);

    try {
      const cachedObjStr = localStorage.getItem(CACHE_KEY);
      if (cachedObjStr) {
        const cachedObj = JSON.parse(cachedObjStr);
        if (cachedObj && Array.isArray(cachedObj.jobs) && cachedObj.jobs.length > 0) {
          cachedJobs = cachedObj.jobs;
          cachedSyncTime = cachedObj.lastSyncTime || null;
          hasCachedData = true;
          
          setJobs(cachedJobs);
          if (cachedSyncTime) {
            setLastSyncTime(cachedSyncTime);
          }
          if (!force && cachedSyncTime && Date.now() - cachedSyncTime < 2 * 60 * 60 * 1000) {
            // Under 2 hours, no need to fetch unless forced
            setLoading(false);
            return;
          }
        }
      }
    } catch (e) {
       console.error("Local storage error:", e);
    }

    if (hasCachedData) {
      setUpdateStatus('checking');
    } else {
      setLoading(true);
    }

    try {
      // Direct WP API Fetch
      const newJobsArr: Job[] = [];
      const seenIds = new Set();
      const seenTitles = new Set();
      
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);
      
      const baseUrl = 'https://bdgovtjob.net/wp-json/wp/v2/posts';
      // Fetch 3 pages, 100 per page to hit 300
      for (let page = 1; page <= 3; page++) {
        try {
          const res = await axios.get(\`\${baseUrl}?_embed=1&per_page=100&page=\${page}\`);
          if (res.data && Array.isArray(res.data)) {
            for(const post of res.data) {
                const job = processWpPostClient(post, thirtyDaysAgo, today);
                if (job && !seenIds.has(job.id) && !seenTitles.has(job.title.toLowerCase())) {
                    seenIds.add(job.id);
                    seenTitles.add(job.title.toLowerCase());
                    newJobsArr.push(job);
                }
            }
          }
        } catch(e) {
          console.warn('WP API Page Fetch Failed', page);
        }
      }
      
      if (newJobsArr.length > 0) {
         setJobs(newJobsArr);
         setLastSyncTime(Date.now());
         localStorage.setItem(CACHE_KEY, JSON.stringify({
            jobs: newJobsArr,
            lastSyncTime: Date.now()
         }));
         
         if (hasCachedData) {
            setUpdateStatus('updated');
            setTimeout(() => setUpdateStatus('idle'), 6000);
         } else {
            setUpdateStatus('idle');
         }
      } else {
         if (hasCachedData) setUpdateStatus('up-to-date');
         setTimeout(() => setUpdateStatus('idle'), 3000);
      }

    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      if (!hasCachedData) {
        setJobs(getFallbackJobs());
      }
      setUpdateStatus('idle');
    } finally {
      setLoading(false);
      setIsFirstVisit(false);
      setIsLoadingJobs(false);
    }
  };

  useEffect`;

appCode = appCode.replace(fetchJobsRegex, newFetchJobs);

// We also need to fix `handleManualSync`
const handleManualRegex = /const handleManualSync = async[\s\S]*?\} catch \(err: any\) \{[\s\S]*?\n  \};\n/m;
const newHandleManual = `const handleManualSync = async (forceFull: boolean = false) => {
    if (isRefreshingCache) return;
    setIsRefreshingCache(true);
    setSyncMessage({ text: '', type: 'idle' });
    try {
      await fetchJobs(true);
      setSyncMessage({ text: 'সফলভাবে নতুন বিজ্ঞপ্তি আপডেট হয়েছে!', type: 'success' });
    } catch (err: any) {
      console.error("Error executing manual sync:", err);
      setSyncMessage({ text: 'আপডেট ব্যর্থ হয়েছে: ' + (err.message || 'অজানা ত্রুটি'), type: 'error' });
    } finally {
      setTimeout(() => setSyncMessage({ text: '', type: 'idle' }), 5000);
      setIsRefreshingCache(false);
    }
  };
`;

appCode = appCode.replace(handleManualRegex, newHandleManual);


// Also remove fetchAdminJobs fetching from /api/
appCode = appCode.replace(/const fetchAdminJobs = async \(\) => \{[\s\S]*?\}\n  \};\n/, `const fetchAdminJobs = async () => {};\n`);

// Handle single direct fetch of job `/api/job/`
appCode = appCode.replace(/const response = await axios.get\(\`\/api\/job\/\${jobId}\`\);\n\s*if \(response.data && response.data.id && activePage === 'home'\) \{\n\s*setSelectedJob\(response.data\);\n\s*\}/m, 
`// Find directly in jobs array
const foundJob = jobs.find(j => String(j.id) === String(jobId));
if (foundJob && activePage === 'home') { setSelectedJob(foundJob); }`);

fs.writeFileSync('src/App.tsx', appCode);
console.log('App.tsx rewrite complete');
