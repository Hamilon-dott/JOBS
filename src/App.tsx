/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import InstallPWA from './components/InstallPWA';
import ScrollButtons from './components/ScrollButtons';
import { 
  Building2, 
  Calendar, 
  Calculator,
  Clock, 
  Search, 
  Briefcase, 
  ChevronRight,
  ChevronLeft,
  X,
  Download,
  TrendingUp,
  LayoutDashboard,
  ShieldCheck,
  Users,
  Globe,
  CreditCard,
  Bookmark,
  BookOpen,
  Heart,
  Share2,
  LogOut,
  ArrowRight,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Tag
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { clsx, type ClassValue } from 'clsx';
import Markdown from 'react-markdown';
import { twMerge } from 'tailwind-merge';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Slug generation function
function generateSlug(title: string, orgName?: string | null, fallbackId?: string, wpSlug?: string | null): string {
  const extractEnglish = (text?: string | null) => {
    if (!text) return '';
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Keep words in English language, numbers, spaces, hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  };

  let slug = wpSlug ? String(wpSlug).trim() : '';

  if (!slug || /^\d+$/.test(slug)) {
    slug = extractEnglish(title);
    if (!slug || slug.length < 3 || /^\d+$/.test(slug)) {
      if (orgName) {
        const orgSlug = extractEnglish(orgName);
        if (orgSlug && orgSlug.length >= 2 && !/^\d+$/.test(orgSlug)) {
          slug = `${orgSlug}-job-circular`;
        }
      }
    }
  }

  if (!slug || /^\d+$/.test(slug)) {
    slug = fallbackId ? `job-circular-${fallbackId}` : `job-circular-${Date.now()}`;
  }

  return slug;
}

interface Job {
  id: string;
  slug?: string;
  title: string;
  organization: string;
  publishedDate: string;
  fetchedAt?: string;
  deadline: string;
  deadlineISO?: string | null;
  remainingDays?: string;
  startTime?: string;
  applyMethod?: string;
  applyLink?: string;
  noticeSource?: string;
  source: string; // Can be comma-separated categories like "Bank,Government"
  link: string;
  location?: string;
  type?: string;
  content?: string;
  imageUrls?: string[];
}

// Helper to format remaining days text
const toBengaliNumber = (num: number | string) => {
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return num.toString().replace(/\d/g, (digit) => bengaliDigits[parseInt(digit)]);
};

const calculateReadingTime = (content?: string): string => {
  if (!content) return '১ মিনিট';
  const noHtmlContent = content.replace(/<[^>]*>?/gm, '');
  const wordCount = noHtmlContent.split(/\s+/).filter(word => word.length > 0).length;
  let minutes = Math.ceil(wordCount / 150);
  if (minutes < 1) minutes = 1;
  return `${toBengaliNumber(minutes)} মিনিট`;
};

const isNewJob = (publishedDate?: string): boolean => {
  if (!publishedDate) return false;
  try {
    const pubDate = new Date(publishedDate);
    const now = new Date();
    const diffTime = now.getTime() - pubDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 2;
  } catch {
    return false;
  }
};

const formatRemainingDays = (days: number | null) => {
  if (days === null) return "";
  if (days > 0) return `${toBengaliNumber(days)} দিন বাকি`;
  if (days === 0) return "আজ শেষ দিন";
  return "সময় শেষ";
};

// Helper to parse Bengali/English deadline strings
const getDaysRemaining = (deadlineStr: string) => {
  if (!deadlineStr || deadlineStr.includes('দেখুন') || deadlineStr.includes('চলমান')) return null;

  try {
    // Convert Bengali numerals to English
    const bengaliToEnglish = (str: string) => {
      const numerals: { [key: string]: string } = {
        '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
      };
      return str.replace(/[০-৯]/g, d => numerals[d]);
    };

    let cleanStr = bengaliToEnglish(deadlineStr);
    
    // Support common separators
    cleanStr = cleanStr.replace(/[।\/]/g, '-').replace(/\s+/g, ' ').trim();

    // Mapping for Bengali months
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

    // Try to extract date components
    let deadlineDate: Date | null = null;

    // Handle DD-MM-YYYY or DD Month YYYY
    const dateMatch = cleanStr.match(/(\d{1,2})[\/\-\s\.,]([a-zA-Z]+|\d{1,2})[\/\-\s\.,](\d{2,4})/);
    if (dateMatch) {
      let day = parseInt(dateMatch[1]);
      let year = parseInt(dateMatch[3]);
      if (year < 100) year += 2000;
      
      let monthIndex: number;
      if (isNaN(parseInt(dateMatch[2]))) {
        const engMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        monthIndex = engMonths.findIndex(m => dateMatch[2].toLowerCase().startsWith(m));
      } else {
        monthIndex = parseInt(dateMatch[2]) - 1;
      }

      if (monthIndex !== -1) {
        deadlineDate = new Date(year, monthIndex, day);
      }
    } else {
      // Fallback to native Date parser
      const date = new Date(cleanStr);
      if (!isNaN(date.getTime())) {
        deadlineDate = date;
      }
    }

    if (!deadlineDate) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  } catch (e) {
    return null;
  }
};

const BD_GOVT_LOGO = "/img.png";

const InFeedAdComponent = () => {
  const isAdSet = React.useRef(false);
  const insRef = React.useRef<HTMLModElement>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let attempts = 0;

    const pushAd = () => {
      if (isAdSet.current || attempts > 10) return;
      
      const el = insRef.current;
      if (el && el.offsetWidth > 0) {
        try {
          isAdSet.current = true;
          const adsbygoogle = (window as any).adsbygoogle || [];
          adsbygoogle.push({});
        } catch (e: any) {
          // completely swallow adsense errors to avoid console noise
        }
      } else {
        attempts++;
        timeoutId = setTimeout(pushAd, 500);
      }
    };

    timeoutId = setTimeout(pushAd, 200);

    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div className="w-full flex justify-center my-4 overflow-hidden min-h-[100px] min-w-[250px] bg-slate-50/50 rounded-xl relative">
      <div className="absolute top-2 left-2 text-[10px] text-slate-400 font-medium tracking-wider uppercase">Advertisement</div>
      <ins ref={insRef}
           className="adsbygoogle w-full inline-block"
           style={{ display: "block", minWidth: "250px" }}
           data-ad-format="fluid"
           data-ad-layout-key="-fb+5w+4e-db+86"
           data-ad-client="ca-pub-7608093638667157"
           data-ad-slot="7997452271"></ins>
    </div>
  );
};

const AdComponent = () => {
  const isAdSet = React.useRef(false);
  const insRef = React.useRef<HTMLModElement>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let attempts = 0;

    const pushAd = () => {
      if (isAdSet.current || attempts > 10) return;
      
      const el = insRef.current;
      if (el && el.offsetWidth > 0) {
        try {
          isAdSet.current = true;
          const adsbygoogle = (window as any).adsbygoogle || [];
          adsbygoogle.push({});
        } catch (e: any) {
          // completely swallow adsense errors to avoid console noise
        }
      } else {
        attempts++;
        timeoutId = setTimeout(pushAd, 500);
      }
    };

    timeoutId = setTimeout(pushAd, 200);

    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div className="w-full flex justify-center my-4 overflow-hidden min-h-[100px] min-w-[250px] bg-slate-50/50 rounded-xl relative">
      <div className="absolute top-2 left-2 text-[10px] text-slate-400 font-medium tracking-wider uppercase">Advertisement</div>
      <ins ref={insRef}
           className="adsbygoogle w-full inline-block"
           style={{ display: "block", minWidth: "250px" }}
           data-ad-client="ca-pub-7608093638667157"
           data-ad-slot="8382578589"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>
  );
};

function FacebookComments({ url }: { url: string }) {
  useEffect(() => {
    let attempts = 0;
    const interval = setInterval(() => {
      if ((window as any).FB) {
        (window as any).FB.XFBML.parse();
        clearInterval(interval);
      }
      attempts++;
      if (attempts > 10) clearInterval(interval); // give up after 5 seconds
    }, 500);

    return () => clearInterval(interval);
  }, [url]);

  return (
    <div className="w-full overflow-hidden flex justify-center" key={url}>
      <div 
        className="fb-comments" 
        data-href={url} 
        data-width="100%" 
        data-numposts="5"
      ></div>
    </div>
  );
}

const AdminPanel = ({ 
  onSync, 
  allJobs,
  isSyncingFirebase,
  syncMessage
}: { 
  onSync: (forceFull: boolean) => Promise<void>, 
  allJobs: Job[],
  isSyncingFirebase: boolean,
  syncMessage: { text: string; type: 'success' | 'error' | 'idle' }
}) => {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [filter, setFilter] = useState<'all' | 'new' | 'recently-fetched' | 'expiring' | 'outdated'>('all');
  const [adminJobs, setAdminJobs] = useState<Job[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

  const fetchAdminJobs = async () => {
    setIsLoadingJobs(true);
    try {
      const resp = await axios.get('/api/jobs?full=true');
      if (Array.isArray(resp.data)) {
        setAdminJobs(resp.data);
      }
    } catch (e) {
      console.error("Admin fetch jobs error:", e);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      if (allJobs.length > 0) {
        setAdminJobs(allJobs);
      } else {
        fetchAdminJobs();
      }
    }
  }, [isAuthenticated, allJobs]);

  const handleSyncAndRefresh = async () => {
    await onSync(true); // Call the full sync
    await fetchAdminJobs();
  };

  const getFilteredJobs = () => {
    const now = new Date();
    return adminJobs.filter(job => {
      if (filter === 'all') return true;
      
      let deadlineDate = null;
      if (job.deadlineISO) {
        deadlineDate = new Date(job.deadlineISO);
      }

      if (filter === 'outdated') {
        // Deadline is more than 3 months ago
        if (!deadlineDate || isNaN(deadlineDate.getTime())) return false;
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        return deadlineDate < threeMonthsAgo;
      }

      if (filter === 'expiring') {
        // Deadline is in next 7 days
        if (!deadlineDate || isNaN(deadlineDate.getTime())) return false;
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
        return deadlineDate >= now && deadlineDate <= sevenDaysFromNow;
      }

      if (filter === 'new') {
        // Published within last 48 hours
        if (!job.publishedDate) return false;
        const pubDate = new Date(job.publishedDate);
        if (isNaN(pubDate.getTime())) return false;
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        return pubDate >= twoDaysAgo;
      }
      
      if (filter === 'recently-fetched') {
        // Fetched within last 24 hours
        if (!job.fetchedAt) return false;
        const fetchedDate = new Date(job.fetchedAt);
        if (isNaN(fetchedDate.getTime())) return false;
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        return fetchedDate >= oneDayAgo;
      }

      return true;
    });
  };

  if (!isAuthenticated) return (
    <div className="flex flex-col items-center justify-center h-screen w-full bg-slate-100">
      <h2 className="mb-4 text-xl font-bold text-slate-800">Admin Login</h2>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="p-3 border border-slate-300 rounded mb-4 shadow-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter Password" onKeyDown={(e) => { if (e.key === 'Enter') { if (password === '0011') setIsAuthenticated(true); else alert('Wrong Password'); } }} />
      <button onClick={() => { if (password === '0011') setIsAuthenticated(true); else alert('Wrong Password'); }} className="px-6 py-2 bg-blue-600 text-white font-medium rounded shadow-sm hover:bg-blue-700 transition">Login</button>
    </div>
  );

  const filteredJobs = getFilteredJobs();

  return (
    <div className="p-4 md:p-8 min-h-screen w-full bg-slate-50 flex flex-col font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
          Admin Dashboard
        </h1>
        <button onClick={() => window.location.href = '/'} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded hover:bg-slate-100 transition whitespace-nowrap">
          Exit Admin
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-700 mb-2">Manual Data Sync</h2>
          <p className="text-sm text-slate-500 mb-4 tracking-wide">
            Fetch the latest circulars from the source and save them to Firebase. Automatically updates the lists.
          </p>
          {syncMessage.text && (
            <div className={`p-3 mb-4 rounded text-sm font-medium flex items-start gap-2 ${syncMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {syncMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
              {syncMessage.text}
            </div>
          )}
          <button 
            onClick={handleSyncAndRefresh} 
            disabled={isSyncingFirebase}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-blue-700 disabled:opacity-75 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {isSyncingFirebase ? <Loader2 className="animate-spin w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
            {isSyncingFirebase ? 'Syncing...' : 'Fetch & Save to Firebase'}
          </button>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-700 mb-2">Automated Sync Status</h2>
          <p className="text-sm text-slate-500 mb-4 tracking-wide">
            The server is configured to automatically fetch and save data every 24 hours. No manual action is completely required but available if needed immediately.
          </p>
          <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium bg-emerald-50 px-3 py-2 rounded-md border border-emerald-100 w-fit">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            Auto-Sync is Active (24-hour intervals)
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
          <h2 className="font-semibold text-slate-700 whitespace-nowrap">Circular Management</h2>
          <div className="flex overflow-x-auto pb-1 md:pb-0 gap-2 w-full md:w-auto">
            <button onClick={() => setFilter('all')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition whitespace-nowrap ${filter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              All ({adminJobs.length})
            </button>
            <button onClick={() => setFilter('new')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition whitespace-nowrap ${filter === 'new' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              Newly Added
            </button>
            <button onClick={() => setFilter('recently-fetched')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition whitespace-nowrap ${filter === 'recently-fetched' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              Newly Fetched
            </button>
            <button onClick={() => setFilter('expiring')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition whitespace-nowrap ${filter === 'expiring' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              Expiring (7 Days)
            </button>
            <button onClick={() => setFilter('outdated')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition whitespace-nowrap ${filter === 'outdated' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              Outdated
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto p-0">
          <table className="w-full text-left border-collapse text-sm min-w-[700px]">
            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm z-10">
              <tr>
                <th className="py-3 px-4 text-slate-600 font-medium">Job Title</th>
                <th className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">Organization</th>
                <th className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">Published</th>
                <th className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingJobs ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">Loading jobs from Firebase...</td>
                </tr>
              ) : filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">No jobs found for this filter.</td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr key={job.id} className="border-b last:border-0 border-slate-100 hover:bg-slate-50 transition">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{job.title}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Tag className="w-3 h-3" />
                        {job.source}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-[200px] truncate" title={job.organization}>{job.organization}</td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(job.publishedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded inline-block text-xs font-medium ${
                        job.deadlineISO && new Date(job.deadlineISO) < new Date() 
                          ? 'bg-red-50 text-red-700 border border-red-100' 
                          : 'bg-green-50 text-green-700 border border-green-100'
                      }`}>
                        {job.deadline || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [filterCategory, setFilterCategory] = useState('সকল ক্যাটাগরি');
  const [filterDeadline, setFilterDeadline] = useState('যেকোনো সময়সীমা');
  const [filterPublishDate, setFilterPublishDate] = useState('যেকোনো প্রকাশের তারিখ');
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isJobDetailLoading, setIsJobDetailLoading] = useState(false);
  const [loadedImagesCount, setLoadedImagesCount] = useState(0);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [activePage, setActivePage] = useState<'home' | 'privacy' | 'terms' | 'contact' | 'admin'>('home');
  const [jobSummaries, setJobSummaries] = useState<Record<string, { text: string; loading: boolean; error?: string }>>({});
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'updated' | 'up-to-date'>('idle');
  const [isSyncingFirebase, setIsSyncingFirebase] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; type: 'success' | 'error' | 'idle' }>({ text: '', type: 'idle' });

  const aiRef = React.useRef<GoogleGenAI | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const getAI = () => {
    if (!aiRef.current) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        aiRef.current = new GoogleGenAI({ apiKey });
      }
    }
    return aiRef.current;
  };
  const selectedJobRef = React.useRef(selectedJob);
  const showExitConfirmRef = React.useRef(showExitConfirm);
  const activePageRef = React.useRef(activePage);
  const jobsRef = React.useRef(jobs);
  
  useEffect(() => {
    selectedJobRef.current = selectedJob;
  }, [selectedJob]);

  useEffect(() => {
    showExitConfirmRef.current = showExitConfirm;
  }, [showExitConfirm]);

  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    const STATE_KEY = 'job_bd_active';
    
    // Only initialized once per session history
    if (window.history.state !== STATE_KEY) {
      window.history.replaceState(window.history.state, '', window.location.href);
      window.history.pushState(STATE_KEY, '', window.location.href);
    }

    const handlePopState = (e: PopStateEvent) => {
      const urlParams = new URLSearchParams(window.location.search);
      const pathMatch = window.location.pathname.match(/^\/jobs\/([^/]+)\/?$/) || window.location.pathname.match(/^\/([^/]+)\/?$/);
      const jobId = pathMatch ? pathMatch[1] : urlParams.get('job');

      if (activePageRef.current !== 'home') {
        setActivePage('home');
      } else if (selectedJobRef.current && !jobId) {
        setSelectedJob(null);
      } else if (jobId && jobsRef.current.length > 0) {
        const job = jobsRef.current.find(j => j.id === jobId || j.slug === jobId || generateSlug(j.title, j.organization, j.id) === jobId);
        if (job) setSelectedJob(job);
      } else if (!showExitConfirmRef.current && !selectedJobRef.current) {
        // Only show exit confirm if we're at the root and moving back
        window.history.pushState(STATE_KEY, '', window.location.href);
        setShowExitConfirm(true);
      } else {
        setShowExitConfirm(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [isClosing, setIsClosing] = useState(false);

  const handleConfirmExit = () => {
    setIsClosing(true);
    setShowExitConfirm(false);
    
    // Attempt multiple ways to signal exit
    setTimeout(() => {
      try {
        // Standard close
        window.close();
        
        // Trick for some browsers to allow close
        const win = window.open("about:blank", "_self");
        if (win) {
          win.close();
        }

        // If still here, use navigation
        setTimeout(() => {
          if (!window.closed) {
            window.location.href = "https://www.google.com"; // Redirect away as fallback
          }
        }, 500);
      } catch (e) {
        window.location.href = "https://www.google.com";
      }
    }, 800);
  };

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('jobSyncFavorites');
    return saved ? JSON.parse(saved) : [];
  });

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // SEO Helpers
  useEffect(() => {
    if (selectedJob) {
      const title = `${selectedJob.title} - ${selectedJob.organization}`;
      const description = `Apply for ${selectedJob.title} at ${selectedJob.organization}. Deadline: ${selectedJob.deadline}. Find more details and application instructions for this BD Govt Job Circular 2026.`;
      
      document.title = title;
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', description);
      }
      
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) {
        ogImage.setAttribute('content', selectedJob.imageUrls?.[0] || 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Government_Seal_of_Bangladesh.svg/1200px-Government_Seal_of_Bangladesh.svg.png');
      }
      
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        ogTitle.setAttribute('content', title);
      }
      
      // Update URL without reloading
      const url = new URL(window.location.href);
      const pathMatch = url.pathname.match(/^\/jobs\/([^/]+)\/?$/) || url.pathname.match(/^\/([^/]+)\/?$/);
      const currentId = pathMatch ? pathMatch[1] : url.searchParams.get('job');
      
      const jobSlug = selectedJob.slug || generateSlug(selectedJob.title, selectedJob.organization, selectedJob.id);
      if (url.pathname !== `/jobs/${jobSlug}` || url.searchParams.get('job')) {
        url.pathname = `/jobs/${jobSlug}`;
        url.searchParams.delete('job');
        window.history.pushState({ job: selectedJob.id }, '', url.toString());
      }

      // Add/Update Canonical Link (Client-Side)
      // Client-side নেভিগেশনের সময় Canonical Tag আপডেট করা হচ্ছে যেন Google সঠিক URL ইনডেক্স করে
      const domain = window.location.hostname.includes('localhost') ? window.location.origin : 'https://jobs.talukdaracademy.com.bd';
      let canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      const canonicalUrl = url.pathname === '/' ? domain + '/' : domain + url.pathname;
      canonical.setAttribute('href', canonicalUrl);

      // JSON-LD for Google Jobs
      const existingScript = document.getElementById('job-jsonld');
      if (existingScript) existingScript.remove();

      const script = document.createElement('script');
      script.id = 'job-jsonld';
      script.type = 'application/ld+json';
      
      // Helper to safely format dates for JSON-LD
      const formatISO = (dateStr: string | null | undefined) => {
        if (!dateStr) return undefined;
        try {
          const d = new Date(dateStr);
          return isNaN(d.getTime()) ? undefined : d.toISOString();
        } catch {
          return undefined;
        }
      };

      const jobSchema = {
        "@context": "https://schema.org/",
        "@type": "NewsArticle",
        "headline": selectedJob.title,
        "description": selectedJob.content || selectedJob.title,
        "datePublished": formatISO(selectedJob.publishedDate),
        "dateModified": formatISO(selectedJob.publishedDate),
        "author": {
          "@type": "Organization",
          "name": "BD Govt Job Circular"
        },
        "publisher": {
          "@type": "Organization",
          "name": "BD Govt Job Circular",
          "logo": {
            "@type": "ImageObject",
            "url": BD_GOVT_LOGO
          }
        },
        "image": [
          selectedJob.imageUrls?.[0] || 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Government_Seal_of_Bangladesh.svg/1200px-Government_Seal_of_Bangladesh.svg.png'
        ],
        "mainEntityOfPage": {
          "@type": "WebPage",
          "@id": domain + url.pathname
        }
      };
      
      script.textContent = JSON.stringify(jobSchema);
      document.head.appendChild(script);
    } else {
      document.title = "Jobs.talukdaracademy.com.bd - BD Govt Job Circular 2026 | All Govt Jobs BD";
      
      const homeDescription = "All Government Job Circulars in Bangladesh. Find recent govt job circular 2026, new govt recruitment, government job news and more at bd govt job.";
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', homeDescription);
      }
      
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        ogTitle.setAttribute('content', "Jobs.talukdaracademy.com.bd - BD Govt Job Circular 2026 | All Govt Jobs BD");
      }
      
      const ogDescription = document.querySelector('meta[property="og:description"]');
      if (ogDescription) {
        ogDescription.setAttribute('content', homeDescription);
      }
      
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) {
        ogImage.setAttribute('content', 'https://jobs.talukdaracademy.com.bd/img.png');
      }

      const url = new URL(window.location.href);
      
      // Reset Canonical Link to Home
      const domain = window.location.hostname.includes('localhost') ? window.location.origin : 'https://jobs.talukdaracademy.com.bd';
      const canonicalUrl = domain + '/';
      let canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) {
        canonical.setAttribute('href', canonicalUrl);
      }

      // Only clear the URL if it actually has a job param/path and we explicitly want to clear it (not just initial state)
      const pathMatch = url.pathname.match(/^\/jobs\/([^/]+)\/?$/) || url.pathname.match(/^\/([^/]+)\/?$/);
      const urlJobId = pathMatch ? pathMatch[1] : url.searchParams.get('job');

      if (urlJobId) {
        if (jobs.length > 0) {
           const jobExistsInList = jobs.some(j => j.id === urlJobId || j.slug === urlJobId || generateSlug(j.title, j.organization, j.id) === urlJobId);
           const isExactlyOnHomeWithoutJob = activePage === 'home' && !selectedJob;
           
           // Only clear if it's not in the list AND we've potentially already tried direct fetching
           // Or if we are explicitly on home and current selectedJob doesn't match the URL (meaning we navigated away)
           if (isExactlyOnHomeWithoutJob) {
              const currentIdInState = selectedJob?.id;
              if (urlJobId !== currentIdInState) {
                // If the URL has an ID but our state is null, we check if we should keep waiting or clear
                // If jobs are loaded and we've waited a bit, we can clear
                url.pathname = '/';
                url.searchParams.delete('job');
                window.history.pushState({}, '', url.toString());
              }
           }
        }
      }
      
      const existingScript = document.getElementById('job-jsonld');
      if (existingScript) existingScript.remove();
    }
  }, [selectedJob]);

  useEffect(() => {
    // Initial deep link check
    const checkDeepLink = async () => {
      if (window.location.pathname === '/admin') {
        setActivePage('admin');
        return;
      }
      const urlParams = new URLSearchParams(window.location.search);
      const pathMatch = window.location.pathname.match(/^\/jobs\/([^/]+)\/?$/) || window.location.pathname.match(/^\/([^/]+)\/?$/);
      const jobId = pathMatch ? pathMatch[1] : urlParams.get('job');
      
      if (jobId) {
        // If we have jobs loaded, check if it's there
        if (jobs.length > 0) {
          const job = jobs.find(j => j.id === jobId || j.slug === jobId || generateSlug(j.title, j.organization, j.id) === jobId);
          if (job) {
             if (activePage === 'home') setSelectedJob(job);
          } else {
             // Not in current list, try fetching directly from API
             try {
               const response = await axios.get(`/api/job/${jobId}`);
               if (response.data && response.data.id && activePage === 'home') {
                 setSelectedJob(response.data);
               }
             } catch (e) {
               console.warn("Direct job fetch failed", e);
             }
          }
        }
      }
    };
    
    checkDeepLink();
  }, [jobs, activePage]);

  useEffect(() => {
    localStorage.setItem('jobSyncFavorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  // Cleanup expired favorites
  useEffect(() => {
    if (jobs.length > 0 && favorites.length > 0) {
      const activeFavorites = favorites.filter(favId => {
        const job = jobs.find(j => j.id === favId);
        if (!job) return true; // Keep it if we can't find the job in current list yet (might be pagination/loading)
        
        const days = getDaysRemaining(job.deadline);
        // Only remove if we definitely know it has expired (days < 0)
        // Keep if days is null (couldn't parse or ongoing)
        return days === null || days >= 0;
      });

      if (activeFavorites.length !== favorites.length) {
        setFavorites(activeFavorites);
      }
    }
  }, [jobs, favorites]);

  useEffect(() => {
    if (selectedJob) {
      if (!jobSummaries[selectedJob.id]) {
        generateSummary(selectedJob);
      }
      if (selectedJob.imageUrls && selectedJob.imageUrls.length > 0) {
        setIsJobDetailLoading(true);
        setLoadedImagesCount(0);
      } else {
        setIsJobDetailLoading(false);
      }
    }
  }, [selectedJob]);

  const handleImageLoad = () => {
    setLoadedImagesCount(prev => {
      const nextCount = prev + 1;
      if (selectedJob?.imageUrls && nextCount >= selectedJob.imageUrls.length) {
        // Add a small delay for smoother transition
        setTimeout(() => setIsJobDetailLoading(false), 300);
      }
      return nextCount;
    });
  };

  const generateSummary = async (job: Job) => {
    // Check cache first
    try {
      const cached = localStorage.getItem('job_summary_cache');
      const summaries = cached ? JSON.parse(cached) : {};
      if (summaries[job.id]) {
        setJobSummaries(prev => ({ ...prev, [job.id]: { text: summaries[job.id], loading: false } }));
        return;
      }
    } catch (e) {
      console.warn("Failed to read summary cache", e);
    }

    const ai = getAI();
    if (!ai) {
      setJobSummaries(prev => ({ ...prev, [job.id]: { text: '', loading: false, error: 'API key not configured. Please check your Vercel environment variables.' } }));
      return;
    }

    setJobSummaries(prev => ({ ...prev, [job.id]: { text: '', loading: true } }));
    
    try {
      const prompt = `Please provide a 1-2 paragraph engaging summary in Bengali for the following job posting. 
      Highlight the key benefits of this job and clearly explain who is eligible to apply in simple Bengali.
      Be concise, professional, and encouraging. Do not use Markdown headings like # or ==, but bold texts are fine.
      
      Job Title: ${job.title}
      Organization: ${job.organization}
      Details: ${(job.content || '').substring(0, 4000)}`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      const summaryText = response.text || '';
      setJobSummaries(prev => ({ ...prev, [job.id]: { text: summaryText, loading: false } }));

      // Save to cache
      try {
        const cached = localStorage.getItem('job_summary_cache');
        const summaries = cached ? JSON.parse(cached) : {};
        summaries[job.id] = summaryText;
        localStorage.setItem('job_summary_cache', JSON.stringify(summaries));
      } catch (e) {
        console.warn("Failed to update summary cache", e);
      }
    } catch (error: any) {
      console.error("Failed to generate summary", error);
      setJobSummaries(prev => ({ ...prev, [job.id]: { text: '', loading: false, error: 'সারসংক্ষেপ তৈরি করতে সমস্যা হয়েছে (Failed to generate summary)' } }));
    }
  };

  useEffect(() => {
    fetchJobs();
    
    // Check for new jobs every 15 minutes in the background
    const intervalId = setInterval(() => {
      fetchJobs();
    }, 15 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  const handleManualSync = async (forceFull: boolean = false) => {
    if (isSyncingFirebase) return;
    setIsSyncingFirebase(true);
    setSyncMessage({ text: '', type: 'idle' });
    try {
      const response = await axios.get(`/api/sync-firebase?quick=${forceFull ? 'false' : 'true'}&full=${forceFull ? 'true' : 'false'}`);
      if (response.data && response.data.success) {
        setSyncMessage({ text: 'সফলভাবে নতুন বিজ্ঞপ্তি আপডেট হয়েছে!', type: 'success' });
        // Force-refetch jobs list from Firebase
        await fetchJobs(true);
      } else {
        setSyncMessage({ text: `আপডেট ব্যর্থ হয়েছে: ${response.data.error || 'অজানা ত্রুটি'}`, type: 'error' });
      }
    } catch (err: any) {
      console.error("Error executing manual sync:", err);
      setSyncMessage({ text: 'সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না।', type: 'error' });
    } finally {
      setIsSyncingFirebase(false);
      setTimeout(() => {
        setSyncMessage({ text: '', type: 'idle' });
      }, 5000);
    }
  };

  const getFallbackJobs = () => {
    const today = new Date().toLocaleDateString();
    return [
      {
        id: "f1",
        title: "Assistant Director (General) - 100 Posts",
        organization: "Bangladesh Bank",
        publishedDate: today,
        deadline: "May 25, 2026",
        source: "Bank",
        link: "https://bdgovtjob.net/",
        location: "Dhaka",
        content: "Bangladesh Bank is recruiting for Assistant Director (General) post. Total 100 vacancies. Apply online."
      },
      {
        id: "f2",
        title: "Senior Officer (Circular No. 2026/04)",
        organization: "Sonali Bank PLC",
        publishedDate: today,
        deadline: "May 20, 2026",
        source: "Bank",
        link: "https://bdgovtjob.net/",
        location: "Nationwide",
        content: "Sonali Bank PLC is looking for Senior Officers. Apply online."
      },
      {
        id: "f3",
        title: "Railway Assistant Station Master",
        organization: "Bangladesh Railway",
        publishedDate: today,
        deadline: "June 10, 2026",
        source: "Government",
        link: "https://bdgovtjob.net/",
        location: "Regional",
        content: "Bangladesh Railway is hiring Assistant Station Masters."
      }
    ];
  };

  const fetchJobs = async (force: boolean = false) => {
    const CACHE_KEY = 'job_db_cache';

    let hasCachedData = false;

    // Priority Cache Load
    try {
      // First try idb (the new way)
      let cachedObj: any = await idbGet(CACHE_KEY);
      
      // Fallback: If not in idb, check localStorage and migrate
      if (!cachedObj) {
        const localCached = localStorage.getItem(CACHE_KEY);
        if (localCached) {
          cachedObj = JSON.parse(localCached);
          await idbSet(CACHE_KEY, cachedObj); // migrate to idb
          localStorage.removeItem(CACHE_KEY); // clear localStorage
        }
      }

      if (cachedObj) {
        const { lastSyncTime, jobs: cachedJobs } = cachedObj;
        if (Array.isArray(cachedJobs) && cachedJobs.length > 0) {
          console.log("Showing cached jobs immediately...");
          setJobs(cachedJobs);
          setCurrentPage(1);
          setLoading(false);
          hasCachedData = true;
        }
      }
    } catch (e) {
      console.warn("Failed to read job cache", e);
    }

    const lastCheckKey = 'last_job_check_timestamp';
    const now = Date.now();
    let shouldCheckForUpdates = force;

    if (!hasCachedData) {
      setLoading(true);
      setIsFirstVisit(true);
      shouldCheckForUpdates = true;
      localStorage.setItem(lastCheckKey, now.toString());
    } else if (!force) {
      const lastCheck = localStorage.getItem(lastCheckKey);
      const hoursSinceLastCheck = lastCheck ? (now - parseInt(lastCheck, 10)) / (1000 * 60 * 60) : Infinity;
      
      if (hoursSinceLastCheck >= 24) {
        shouldCheckForUpdates = true;
        setUpdateStatus('checking');
        localStorage.setItem(lastCheckKey, now.toString());
      }
    } else {
      setUpdateStatus('checking');
      localStorage.setItem(lastCheckKey, now.toString());
    }
    
    if (!shouldCheckForUpdates) {
      // Skip background check if already checked today
      return;
    }

    // Background Full Load
    try {
      const timestamp = Date.now();
      const response = await axios.get(`/api/jobs?full=true&t=${timestamp}`);
      const data = response.data;
      
      if (Array.isArray(data) && data.length > 0) {
        // Refresh cache in background using idb
        try {
          await idbSet(CACHE_KEY, {
            lastSyncTime: Date.now(),
            jobs: data
          });
        } catch (e) {
          console.warn("Failed to set job cache to idb", e);
        }
        
        // Always store all known IDs separately (takes very little space) to avoid false "new job" alerts
        let lastKnownIds: string[] = [];
        try {
           const stored = localStorage.getItem('last_known_ids');
           if (stored) lastKnownIds = JSON.parse(stored);
           const allIds = Array.from(new Set([...lastKnownIds, ...data.map((j: Job) => String(j.id))]));
           localStorage.setItem('last_known_ids', JSON.stringify(allIds.slice(0, 500))); // keep last 500
        } catch (e) {
           // ignore
        }

        if (hasCachedData) {
          const existingIds = new Set(jobsRef.current.map(j => String(j.id)));
          const knownIdsSet = new Set(lastKnownIds);
          const existingTitles = new Set(jobsRef.current.map(j => j.title.toLowerCase()));
          
          const newJobs = data.filter(j => !existingIds.has(String(j.id)) && !knownIdsSet.has(String(j.id)) && !existingTitles.has(j.title.toLowerCase()));
          
          if (newJobs.length > 0 && jobsRef.current.length > 0) {
             // Instant show new jobs
             setJobs(data);
             setUpdateStatus('updated');
             setTimeout(() => setUpdateStatus('idle'), 6000);
          } else {
             // If no completely new items, just update items silently
             setJobs(data);
             setUpdateStatus('up-to-date');
             setTimeout(() => setUpdateStatus('idle'), 3000);
          }
        } else {
          setJobs(data);
          setLoading(false);
          setUpdateStatus('idle');
        }
      } else {
        if (hasCachedData) setUpdateStatus('idle');
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
    }
  };

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          job.organization.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Check if the source (comma separated) contains the active filter
    const jobCategories = job.source.split(',').map(s => s.trim());
    
    let matchesFilter = activeFilter === 'All' || jobCategories.includes(activeFilter);
    
    if (activeFilter === 'Expiring Soon') {
      const days = getDaysRemaining(job.deadline);
      
      // Also check remainingDays field from server if parsing failed
      const bengaliToEnglish = (str: string) => {
        const numerals: { [key: string]: string } = {
          '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
        };
        return str.replace(/[০-৯]/g, d => numerals[d]);
      };
      
      const serverRemaining = job.remainingDays ? bengaliToEnglish(job.remainingDays).match(/(\d+)/) : null;
      const serverDays = serverRemaining ? parseInt(serverRemaining[1]) : null;
      
      const isSoon = (days !== null && days >= 0 && days <= 3) || (serverDays !== null && serverDays >= 0 && serverDays <= 3);
      matchesFilter = isSoon;
    }

    if (activeFilter === 'Favourite List') {
      matchesFilter = favorites.includes(job.id);
    }

    // New Bengali Filters Logic
    if (filterCategory !== 'সকল ক্যাটাগরি') {
      const categoryMap: { [key: string]: string } = {
        'সরকারি চাকরি': 'Government',
        'ব্যাংক জব': 'Bank',
        'এনজিও চাকরি': 'NGO',
        'বেসরকারি চাকরি': 'Private',
      };
      const engCat = categoryMap[filterCategory];
      if (engCat && !jobCategories.includes(engCat)) {
        matchesFilter = false;
      }
    }

    if (filterDeadline !== 'যেকোনো সময়সীমা') {
      const days = getDaysRemaining(job.deadline);
      if (filterDeadline === 'আজকের মধ্যে') {
        if (days !== 0) matchesFilter = false;
      } else if (filterDeadline === '২ দিনের মধ্যে') {
        if (days === null || days > 2) matchesFilter = false;
      } else if (filterDeadline === '১ সপ্তাহের মধ্যে') {
        if (days === null || days > 7) matchesFilter = false;
      }
    }

    if (filterPublishDate !== 'যেকোনো প্রকাশের তারিখ') {
      const pubDate = new Date(job.publishedDate);
      const today = new Date();
      const diffTime = today.getTime() - pubDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (filterPublishDate === 'আজকের বিজ্ঞপ্তি') {
        if (diffDays > 1) matchesFilter = false;
      } else if (filterPublishDate === 'গতকালে বিজ্ঞপ্তি') {
        if (diffDays > 2) matchesFilter = false;
      } else if (filterPublishDate === 'এই সপ্তাহের') {
        if (diffDays > 7) matchesFilter = false;
      }
    }
    
    return matchesSearch && matchesFilter;
  });

  const paginatedJobs = filteredJobs;

  // Effects to reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeFilter, filterCategory, filterDeadline, filterPublishDate]);

  // Scroll to top on page change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage]);

  const handleFilterClick = (cat: string) => {
    setActiveFilter(cat);
    setIsSidebarOpen(false);
    setSelectedJob(null);
    setActivePage('home');
  };

  const categories = ['All', 'Expiring Soon', 'Government', 'Private', 'Bank', 'NGO', 'General'];
  const sourcesCount = new Set(jobs.map(j => j.source)).size;
  
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;

      // Use Intl.DateTimeFormat with Asia/Dhaka timezone to avoid client-side timezone offset discrepancies
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      });
      
      const parts = formatter.formatToParts(d);
      let dayVal = d.getDate();
      let monthVal = d.getMonth();
      let yearVal = d.getFullYear();
      
      for (const part of parts) {
        if (part.type === 'day') {
          dayVal = parseInt(part.value, 10);
        } else if (part.type === 'month') {
          monthVal = parseInt(part.value, 10) - 1; // 0-indexed month
        } else if (part.type === 'year') {
          yearVal = parseInt(part.value, 10);
        }
      }

      const day = toBengaliNumber(dayVal);
      const monthNames = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
      const month = monthNames[monthVal];
      const year = toBengaliNumber(yearVal);
      return `${day} ${month} ${year}`;
    } catch {
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = toBengaliNumber(d.getDate());
        const monthNames = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
        const month = monthNames[d.getMonth()];
        const year = toBengaliNumber(d.getFullYear());
        return `${day} ${month} ${year}`;
      } catch {
        return dateStr;
      }
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const newTodayCount = jobs.filter(j => j.publishedDate && j.publishedDate.startsWith(todayStr)).length;
  const expiringSoonCount = jobs.filter(j => {
    const days = getDaysRemaining(j.deadline);
    
    const bengaliToEnglish = (str: string) => {
      const numerals: { [key: string]: string } = {
        '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
      };
      return str.replace(/[০-৯]/g, d => numerals[d]);
    };

    const serverRemaining = j.remainingDays ? bengaliToEnglish(j.remainingDays).match(/(\d+)/) : null;
    const serverDays = serverRemaining ? parseInt(serverRemaining[1]) : null;
    
    const isExpiringSoon = (days !== null && days >= 0 && days <= 7) || (serverDays !== null && serverDays >= 0 && serverDays <= 7);
    return isExpiringSoon;
  }).length;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <div className={`flex bg-[#f8fafc] text-[#1e293b] font-sans ${activePage === 'admin' ? 'min-h-screen' : 'h-screen overflow-hidden'}`}>
      {activePage === 'admin' ? (
        <AdminPanel 
          onSync={handleManualSync} 
          allJobs={jobs}
          isSyncingFirebase={isSyncingFirebase} 
          syncMessage={syncMessage} 
        />
      ) : (
        <>
        <AnimatePresence>
        {isClosing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[2000] bg-slate-950 flex flex-col items-center justify-center text-white"
          >
            <motion.div
              animate={{ 
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0]
              }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(37,99,235,0.4)]"
            >
              <Briefcase size={40} className="text-white" />
            </motion.div>
            <h2 className="text-2xl font-black mb-2 animate-pulse">বিদায় (Goodbye)</h2>
            <p className="text-slate-400 font-medium">অ্যাপটি বন্ধ করা হচ্ছে... (Closing app...)</p>
            <div className="mt-8 flex gap-1">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isOnline && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="relative mb-8">
              <div className="w-24 h-24 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Globe size={32} className="text-blue-500 animate-pulse" />
              </div>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 mb-3">ইন্টারনেট সংযোগ বিচ্ছিন্ন!</h1>
            <p className="text-slate-500 max-w-xs mb-8 leading-relaxed font-medium">
              সার্কুলারগুলো লোড করার জন্য ইন্টারনেট প্রয়োজন। আমরা সংযোগ পুনস্থাপনের জন্য অপেক্ষা করছি...
            </p>
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-blue-600 font-bold bg-blue-50 px-4 py-2 rounded-full text-sm">
                <span className="w-2 h-2 bg-blue-600 rounded-full animate-ping" />
                সংযুক্ত হওয়ার চেষ্টা করা হচ্ছে
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="text-xs font-bold text-slate-400 hover:text-[#3b82f6] underline transition-colors"
              >
                পেজটি রিফ্রেশ করুন (Refresh Page)
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="bg-[#0f172a] text-[#f8fafc] overflow-hidden flex flex-col shrink-0 border-r border-white/5 h-full"
          >
            <div className="p-6 flex flex-col justify-between h-full bg-[#0f172a] overflow-y-auto custom-scrollbar">
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-10 selection:bg-none">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#3b82f6] w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0">
                      <Briefcase size={20} />
                    </div>
                    <span className="text-white font-black tracking-wider text-xl">JOBS</span>
                  </div>
                  <button 
                    onClick={() => setIsSidebarOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <ArrowRight size={22} />
                  </button>
                </div>

                <nav className="space-y-1">
                  {categories.map((cat) => (
                    <div
                      key={cat}
                      onClick={() => handleFilterClick(cat)}
                      className={cn(
                        "nav-item px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap",
                        activeFilter === cat
                          ? "bg-[#1e293b] text-[#3b82f6]"
                          : "text-[#94a3b8] hover:bg-white/5 hover:text-[#f8fafc]"
                      )}
                    >
                      {cat === 'All' && <LayoutDashboard size={18} />}
                      {cat === 'Expiring Soon' && <Clock size={18} />}
                      {cat === 'Bank' && <CreditCard size={18} />}
                      {cat === 'Government' && <ShieldCheck size={18} />}
                      {cat === 'NGO' && <Users size={18} />}
                      {cat === 'Private' && <Briefcase size={18} />}
                      {cat === 'General' && <Globe size={18} />}
                      {cat}
                    </div>
                  ))}
                  
                  <div className="pt-6 pb-2">
                    <h3 className="px-4 text-[11px] font-bold text-[#475569] uppercase tracking-widest mb-2 whitespace-nowrap">My Desk</h3>
                    <div 
                      onClick={() => handleFilterClick('Favourite List')}
                      className={cn(
                        "nav-item px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap",
                        activeFilter === 'Favourite List'
                          ? "bg-[#1e293b] text-[#3b82f6]"
                          : "text-[#94a3b8] hover:bg-white/5 hover:text-[#f8fafc]"
                      )}
                    >
                      <Heart size={18} fill={activeFilter === 'Favourite List' ? "#3b82f6" : "none"} />
                      Favourite List
                    </div>
                    
                    <a 
                      href="https://www.talukdaracademy.com.bd/p/birth-date-calculate-your-age-year-here.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="nav-item px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap text-[#94a3b8] hover:bg-white/5 hover:text-[#f8fafc]"
                    >
                      <Calculator size={18} />
                      Age Calculator
                    </a>

                    <div 
                      onClick={() => setShowExitConfirm(true)}
                      className="nav-item px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-bold cursor-pointer transition-all duration-200 whitespace-nowrap text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 mt-4 border border-rose-500/10"
                    >
                      <LogOut size={18} />
                      Exit App
                    </div>
                  </div>
                </nav>
              </div>

              <div className="pt-6 border-t border-white/5 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => handleManualSync()}
                    disabled={isSyncingFirebase}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 shadow-md",
                      isSyncingFirebase 
                        ? "bg-slate-800 text-[#94a3b8] cursor-not-allowed border border-slate-700"
                        : "bg-[#1e293b] hover:bg-white/5 text-slate-300 hover:text-white active:scale-95 border border-white/10"
                    )}
                  >
                    <RefreshCw size={14} className={cn(isSyncingFirebase && "animate-spin")} />
                    {isSyncingFirebase ? "আপডেট হচ্ছে..." : "নতুন সার্কুলার রিফ্রেশ"}
                  </button>
                  
                  <AnimatePresence mode="wait">
                    {syncMessage.text && (
                      <motion.p
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className={cn(
                          "text-[10px] font-semibold text-center px-1 leading-normal whitespace-pre-wrap",
                          syncMessage.type === 'success' && "text-emerald-400",
                          syncMessage.type === 'error' && "text-rose-400",
                          syncMessage.type === 'idle' && "text-slate-400"
                        )}
                      >
                        {syncMessage.text}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <div className="text-[11px] text-[#475569] leading-relaxed whitespace-nowrap text-center">
                  <a 
                    href="https://youtube.com/@talukdaracademy" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="hover:text-[#3b82f6] transition-colors"
                  >
                    Powered by Talukdar Academy
                  </a>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-[60px] md:h-[72px] bg-white border-b border-[#e2e8f0] flex items-center justify-between px-4 md:px-6 shrink-0 shadow-sm relative z-10">
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 md:p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
            >
              <div className="space-y-1 md:space-y-1.5 font-bold">
                <div className="w-5 md:w-6 h-0.5 bg-current"></div>
                <div className="w-5 md:w-6 h-0.5 bg-current"></div>
                <div className="w-5 md:w-6 h-0.5 bg-current"></div>
              </div>
            </button>
            <div className="md:hidden flex items-center">
              <div className="flex items-center gap-1.5 font-bold text-slate-700">
                <div className="bg-[#3b82f6] w-7 h-7 rounded-lg flex items-center justify-center text-white">
                  <Briefcase size={16} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-black tracking-tighter animate-rgb-glow uppercase whitespace-nowrap">
                    Jobs.talukdaracademy
                  </span>
                  <div className="h-[1px] w-6 bg-blue-400/40 rounded-full" />
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center ml-2">
              <div className="flex items-center gap-2 font-bold text-slate-700">
                <div className="bg-[#3b82f6] w-10 h-10 rounded-lg flex items-center justify-center text-white">
                  <Briefcase size={20} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[16px] font-black tracking-tight animate-rgb-glow uppercase whitespace-nowrap">
                    Jobs.talukdaracademy.com.bd
                  </span>
                  <div className="h-[2px] w-12 bg-blue-400/40 rounded-full mt-0.5" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
              <InstallPWA />
              <a 
                href="https://www.talukdaracademy.com.bd/p/birth-date-calculate-your-age-year-here.html"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-[#3b82f6]/10 text-[#3b82f6] rounded-full text-xs font-bold hover:bg-[#3b82f6]/20 transition-all border border-[#3b82f6]/20"
              >
                <Calculator size={14} />
                Age Calculator
              </a>
          </div>
        </header>

        {/* Dashboard/Detail View Switch */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto custom-scrollbar relative"
        >
          <AnimatePresence mode="wait">
            {!selectedJob ? (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-6xl mx-auto p-4 lg:p-8"
              >
                {/* Search and Filter Section (Mimicking bdgovtjob.net) */}
            <div className="mb-8">
              {!isFilterExpanded ? (
                <motion.button
                  layoutId="filter-panel"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setIsFilterExpanded(true)}
                  className="w-full bg-[#057a41] text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-3 transition-all hover:bg-[#046335] border-2 border-transparent hover:border-[#057a41]/20"
                >
                  <Search size={22} className="stroke-[2.5]" />
                  <span className="text-lg">সার্চ করুন</span>
                </motion.button>
              ) : (
                <motion.div 
                  layoutId="filter-panel"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white p-6 rounded-xl border-2 border-[#057a41]/10 shadow-xl relative"
                >
                  <button 
                    onClick={() => {
                      setIsFilterExpanded(false);
                      setSearchTerm('');
                    }}
                    className="absolute -top-3 -right-3 w-8 h-8 bg-white border border-[#e2e8f0] rounded-full flex items-center justify-center text-[#64748b] hover:text-rose-500 shadow-md transition-colors z-20"
                  >
                    <X size={16} />
                  </button>

                  <div className="grid grid-cols-1 gap-4">
                    {/* Keyword Search */}
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="কীওয়ার্ড লিখে চাকরি খুঁজুন"
                        className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-lg py-3 px-4 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#057a41]/20 focus:border-[#057a41] transition-all placeholder:text-slate-400"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                      />
                      {searchTerm && (
                        <button 
                          onClick={() => setSearchTerm('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>

                    {/* Dropdowns Row */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                      {/* Category Filter */}
                      <div className="space-y-1.5">
                        <label className="text-[12px] md:text-[14px] font-bold text-slate-700 block">ক্যাটাগরি</label>
                        <select 
                          value={filterCategory}
                          onChange={(e) => setFilterCategory(e.target.value)}
                          className="w-full bg-white border border-[#e2e8f0] rounded-lg p-2 text-sm focus:outline-none focus:border-[#057a41] transition-all cursor-pointer"
                        >
                          {['সকল ক্যাটাগরি', 'সরকারি চাকরি', 'ব্যাংক জব', 'এনজিও চাকরি', 'বেসরকারি চাকরি'].map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>

                      {/* Deadline Filter */}
                      <div className="space-y-1.5">
                        <label className="text-[12px] md:text-[14px] font-bold text-slate-700 block">আবেদনের সময়সীমা</label>
                        <select 
                          value={filterDeadline}
                          onChange={(e) => setFilterDeadline(e.target.value)}
                          className="w-full bg-white border border-[#e2e8f0] rounded-lg p-2 text-sm focus:outline-none focus:border-[#057a41] transition-all cursor-pointer"
                        >
                          {['যেকোনো সময়সীমা', 'আজকের মধ্যে', '২ দিনের মধ্যে', '১ সপ্তাহের মধ্যে'].map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>

                      {/* Publish Date Filter */}
                      <div className="space-y-1.5">
                        <label className="text-[12px] md:text-[14px] font-bold text-slate-700 block">প্রকাশের তারিখ</label>
                        <select 
                          value={filterPublishDate}
                          onChange={(e) => setFilterPublishDate(e.target.value)}
                          className="w-full bg-white border border-[#e2e8f0] rounded-lg p-2 text-sm focus:outline-none focus:border-[#057a41] transition-all cursor-pointer"
                        >
                          {['যেকোনো প্রকাশের তারিখ', 'আজকের বিজ্ঞপ্তি', 'গতকালে বিজ্ঞপ্তি', 'এই সপ্তাহের'].map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>

                      {/* Search Button (now also serves as hide button in expanded state) */}
                      <button 
                        onClick={() => setIsFilterExpanded(false)}
                        className="w-full bg-[#057a41] text-white font-bold py-2 rounded-lg hover:bg-[#046335] transition-colors shadow-sm"
                      >
                        সার্চ করুন
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>


            <div className="flex justify-between items-center mb-6">
              <h2 className="text-[20px] font-bold text-[#0f172a]">সর্বশেষ সার্কুলারসমূহ</h2>
              <div className="flex items-center gap-2 text-[14px] text-[#64748b] font-medium bg-slate-100 px-3 py-1 rounded-full">
                {toBengaliNumber(filteredJobs.length)} টি সার্কুলার পাওয়া গেছে
              </div>
            </div>

            <AnimatePresence>
              {updateStatus !== 'idle' && (
                <motion.div
                   initial={{ opacity: 0, y: -20, height: 0 }}
                   animate={{ opacity: 1, y: 0, height: 'auto' }}
                   exit={{ opacity: 0, scale: 0.9, height: 0 }}
                   className="flex justify-center mb-6 overflow-hidden sticky top-[80px] z-50"
                >
                   <div 
                     className={cn(
                       "px-5 py-2.5 rounded-full shadow-lg font-bold text-sm flex items-center gap-2 transition-all",
                       updateStatus === 'checking' ? "bg-slate-800 text-white shadow-slate-500/30" :
                       updateStatus === 'updated' ? "bg-[#10b981] text-white shadow-[#10b981]/30" :
                       "bg-slate-100 text-slate-700 border border-slate-200"
                     )}
                   >
                     {updateStatus === 'checking' && (
                       <>
                         <Loader2 size={16} className="animate-spin" />
                         <span>নতুন বিজ্ঞপ্তি খোঁজা হচ্ছে... (Checking for new circulars)</span>
                       </>
                     )}
                     {updateStatus === 'updated' && (
                       <>
                         <Sparkles size={18} className="animate-pulse" />
                         <span>নতুন বিজ্ঞপ্তি পাওয়া গেছে! (New circulars found!)</span>
                       </>
                     )}
                     {updateStatus === 'up-to-date' && (
                       <>
                         <Clock size={16} />
                         <span>সব বিজ্ঞপ্তি আপডেট করা আছে। (Fully updated)</span>
                       </>
                     )}
                   </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Job Grid/List */}
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="animate-spin text-[#3b82f6]" size={32} />
                    <p className="text-sm font-medium text-[#64748b]">
                      {isFirstVisit 
                        ? "আপনি প্রথমবারের মতো এসেছেন। একটু সময় দিন, সার্ভারের সাথে কানেক্ট হচ্ছে..." 
                        : "Updating dashboard..."}
                    </p>
                  </div>
                ) : paginatedJobs.length > 0 ? (
                  paginatedJobs.flatMap((job, idx) => {
                    const elements = [
                      <motion.a
                        href={`/${job.slug || generateSlug(job.title, job.organization, job.id)}`}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        key={job.id}
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedJob(job);
                        }}
                        className="bg-white text-left text-inherit block border border-[#e2e8f0] rounded-lg p-3 flex flex-col md:flex-row md:items-center justify-between group hover:border-[#3b82f6]/50 hover:shadow-md transition-all duration-200 gap-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
                          <div className={cn(
                            "w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center font-bold text-xs md:text-sm shrink-0 border transition-all overflow-hidden bg-white px-1",
                            job.source.includes('Government') ? "border-emerald-200" : "bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0] group-hover:bg-[#3b82f6]/5 group-hover:text-[#3b82f6]"
                          )}>
                            {job.source.includes('Government') ? (
                              <img src={BD_GOVT_LOGO} alt="Govt Logo" width={48} height={48} className="w-full h-full object-contain" referrerPolicy="no-referrer" loading="lazy" />
                            ) : (
                              getInitials(job.organization)
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2 mb-1">
                              <h4 className="font-bold text-[15px] md:text-[17px] text-[#0f172a] group-hover:text-[#3b82f6] transition-colors line-clamp-2 md:line-clamp-1 leading-snug">
                                {job.title}
                              </h4>
                              {isNewJob(job.publishedDate) && (
                                <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 mt-0.5 md:mt-0 shadow-sm animate-pulse">New</span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] md:text-[13px] text-[#64748b]">
                              <span className="font-bold text-[#334155]">{job.organization}</span>
                              <span className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded">
                                <Calendar size={11} className="shrink-0" />
                                {formatDate(job.publishedDate)}
                              </span>
                              <span className="flex items-center gap-1 text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                                <Clock size={11} className="shrink-0" />
                                {job.deadline}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-none pt-2 md:pt-0">
                          <div className="flex flex-wrap gap-1.5 justify-end">
                            {job.source.split(',').map((src) => (
                              <span key={src} className={cn(
                                "tag px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                src === 'Government' 
                                  ? "bg-[#dcfce7] text-[#166534]" 
                                  : src === 'Bank'
                                  ? "bg-[#fff2f2] text-[#c53030]"
                                  : src === 'Private'
                                  ? "bg-[#eff6ff] text-[#1d4ed8]"
                                  : src === 'NGO'
                                  ? "bg-[#fffbeb] text-[#b45309]"
                                  : src === 'Expiring Soon'
                                  ? "bg-[#fff1f2] text-[#e11d48]"
                                  : "bg-[#f1f5f9] text-[#475569]"
                              )}>
                                {src}
                              </span>
                            ))}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const shareUrl = `${window.location.origin}/jobs/${job.slug || generateSlug(job.title, job.organization, job.id)}`;
                                
                                const fallbackCopy = () => {
                                  navigator.clipboard.writeText(shareUrl)
                                    .then(() => alert('লিঙ্কটি কপি করা হয়েছে! (Link Copied!)'))
                                    .catch(() => alert('শেয়ার লিঙ্ক কপি করা সম্ভব হয়নি।'));
                                };

                                if (navigator.share) {
                                  navigator.share({
                                    title: job.title,
                                    text: `${job.organization} - Job Circular`,
                                    url: shareUrl
                                  }).catch(() => {
                                    fallbackCopy();
                                  });
                                } else {
                                  fallbackCopy();
                                }
                              }}
                              className="p-2 rounded-full text-[#94a3b8] hover:bg-slate-100 hover:text-[#3b82f6] transition-all duration-200"
                              title="Share Job"
                            >
                              <Share2 size={18} />
                            </button>
                            <button 
                              onClick={(e) => toggleFavorite(job.id, e)}
                              className={cn(
                                "p-2 rounded-full transition-all duration-200",
                                favorites.includes(job.id) 
                                  ? "bg-rose-50 text-rose-500 shadow-sm" 
                                  : "text-[#94a3b8] hover:bg-slate-100 hover:text-rose-400"
                              )}
                            >
                              <Heart size={18} fill={favorites.includes(job.id) ? "currentColor" : "none"} />
                            </button>
                            <div className="text-[#3b82f6] group-hover:translate-x-1 transition-transform ml-1 hidden md:block">
                              <ChevronRight size={18} />
                            </div>
                          </div>
                        </div>
                      </motion.a>
                    ];
                    if ((idx + 1) % 5 === 0) {
                      elements.push(<div key={`ad-${job.id}`}><InFeedAdComponent /></div>);
                    }
                    return elements;
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 bg-white border-2 border-dashed border-[#e2e8f0] rounded-2xl">
                    <Search className="text-[#cbd5e1] mb-2" size={40} />
                    <p className="text-sm font-bold text-[#64748b]">No circulars found</p>
                    <p className="text-xs text-[#94a3b8] mt-1">Try a different search term or category</p>
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <footer className="mt-8 py-8 text-center text-slate-500 border-t border-slate-200">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 max-w-5xl mx-auto px-4">
                <div className="text-sm font-medium">© {toBengaliNumber(new Date().getFullYear())} Jobs.talukdaracademy.com.bd. All rights reserved.</div>
                <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-medium">
                  <button onClick={() => { setActivePage('privacy'); setSelectedJob(null); }} className="hover:text-blue-600 transition-colors hover:underline">Privacy Policy</button>
                  <button onClick={() => { setActivePage('terms'); setSelectedJob(null); }} className="hover:text-blue-600 transition-colors hover:underline">Terms of Service</button>
                  <button onClick={() => { setActivePage('contact'); setSelectedJob(null); }} className="hover:text-blue-600 transition-colors hover:underline">Contact Us</button>
                </div>
              </div>
            </footer>
          </motion.div>
            ) : (
              <motion.div 
                key="detail"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                id="details-wrapper"
                className="max-w-4xl mx-auto w-full p-4 lg:p-8"
              >
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 relative w-full">
                  {/* Fixed Header Wrapper */}
                  <div className="fixed top-0 left-0 right-0 z-[150] bg-white/98 backdrop-blur-xl border-b border-slate-100 shadow-lg px-3 md:px-4">
                    <div className="max-w-4xl mx-auto flex items-center justify-between py-3 md:py-5">
                      <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0 pr-2">
                        <button 
                          onClick={() => setSelectedJob(null)}
                          className="flex items-center gap-1 text-slate-700 hover:text-[#3b82f6] transition-all duration-200 font-bold text-xs md:text-sm bg-white px-2.5 md:px-5 py-2 md:py-2.5 rounded-lg md:rounded-xl border border-slate-200 shadow-sm hover:shadow-md active:scale-95 group shrink-0"
                        >
                          <ChevronLeft size={16} className="text-[#3b82f6] group-hover:-translate-x-0.5 transition-transform" />
                          <span>ফিরে যান</span>
                        </button>

                        <div className="flex flex-col items-start pointer-events-none min-w-0">
                          <span className="text-[10px] md:text-[17px] font-black tracking-tighter animate-rgb-glow whitespace-nowrap uppercase truncate drop-shadow-sm">
                            Jobs.talukdaracademy
                          </span>
                          <div className="h-[1.5px] md:h-[2.5px] w-8 md:w-20 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 rounded-full opacity-40 mt-0.5" />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const shareUrl = `${window.location.origin}/jobs/${selectedJob.slug || generateSlug(selectedJob.title, selectedJob.organization, selectedJob.id)}`;
                            
                            const fallbackCopy = () => {
                              navigator.clipboard.writeText(shareUrl)
                                .then(() => alert('লিঙ্কটি কপি করা হয়েছে! (Link Copied!)'))
                                .catch(() => alert('শেয়ার লিঙ্ক কপি করা সম্ভব হয়নি।'));
                            };

                            if (navigator.share) {
                              navigator.share({
                                title: selectedJob.title,
                                text: `${selectedJob.organization} - Job Circular`,
                                url: shareUrl
                              }).catch(() => {
                                fallbackCopy();
                              });
                            } else {
                              fallbackCopy();
                            }
                          }}
                          className="w-9 h-9 md:w-11 md:h-11 flex items-center justify-center rounded-lg md:rounded-xl transition-all duration-300 border shadow-sm active:scale-90 bg-white text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-blue-500"
                          title="Share Selected Job"
                        >
                          <Share2 size={20} />
                        </button>
                        <button 
                          onClick={(e) => toggleFavorite(selectedJob.id, e)}
                          className={cn(
                            "w-9 h-9 md:w-11 md:h-11 flex items-center justify-center rounded-lg md:rounded-xl transition-all duration-300 border shadow-sm active:scale-90",
                            favorites.includes(selectedJob.id) 
                              ? "bg-rose-50 text-rose-500 border-rose-200 shadow-rose-200" 
                              : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-rose-500"
                          )}
                        >
                          <Heart 
                            size={20} 
                            fill={favorites.includes(selectedJob.id) ? "currentColor" : "none"} 
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Spacer to push content below fixed header */}
                  <div className="h-[64px] md:h-[88px] w-full" />
                
                <div className="p-4 sm:p-6 md:p-8 relative min-h-[400px]">
                  <AnimatePresence mode="wait">
                    {isJobDetailLoading ? (
                      <motion.div 
                        key="loader"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white gap-6"
                      >
                        <div className="relative">
                          <div className="w-16 h-16 border-4 border-slate-100 border-t-[#3b82f6] rounded-full animate-spin"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                              <Loader2 size={16} className="text-[#3b82f6] animate-pulse" />
                            </div>
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-[#0f172a] mb-1">Circular images are loading...</p>
                          <p className="text-xs text-[#64748b]">Please wait while we fetch high-quality data</p>
                        </div>
                        
                        {selectedJob.imageUrls && (
                          <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-[#3b82f6]"
                              initial={{ width: 0 }}
                              animate={{ width: `${(loadedImagesCount / Math.max(selectedJob.imageUrls.length, 1)) * 100}%` }}
                            />
                          </div>
                        )}
                        
                        {/* Off-screen images to trigger loading */}
                        <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}>
                          {selectedJob.imageUrls?.map((url, idx) => (
                            <img key={idx} src={url} alt={`Preload ${idx}`} onLoad={handleImageLoad} onError={handleImageLoad} referrerPolicy="no-referrer" />
                          ))}
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="content"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                      >
                        <div className="mb-6">
                          <div className="flex flex-wrap gap-2 mb-4">
                            {selectedJob.source.split(',').map((src) => (
                              <span key={src} className={cn(
                                "tag px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider",
                                src === 'Government' 
                                  ? "bg-[#dcfce7] text-[#166534]" 
                                  : src === 'Bank'
                                  ? "bg-[#fff2f2] text-[#c53030]"
                                  : src === 'Private'
                                  ? "bg-[#eff6ff] text-[#1d4ed8]"
                                  : src === 'NGO'
                                  ? "bg-[#fffbeb] text-[#b45309]"
                                  : src === 'Expiring Soon'
                                  ? "bg-[#fff1f2] text-[#e11d48]"
                                  : "bg-[#f1f5f9] text-[#475569]"
                              )}>
                                {src} Category
                              </span>
                            ))}
                          </div>
                          <h1 className="text-2xl md:text-3xl font-bold text-[#0f172a] mb-4 leading-tight">{selectedJob.title}</h1>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-2">
                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 px-4 py-3 rounded-xl inline-flex w-full sm:w-auto">
                              {selectedJob.source.includes('Government') && (
                                <img src={BD_GOVT_LOGO} alt="Govt Logo" width={32} height={32} className="w-8 h-8 object-contain shrink-0" referrerPolicy="no-referrer" loading="lazy" />
                              )}
                              <p className="text-lg text-[#3b82f6] font-semibold">{selectedJob.organization}</p>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-slate-500 bg-white border border-slate-200 px-4 py-3 rounded-xl inline-flex w-full sm:w-auto shadow-sm">
                              <span className="flex items-center gap-1.5 font-medium">
                                <Calendar size={16} className="text-slate-400" />
                                <span className="hidden sm:inline">প্রকাশিত:</span> {formatDate(selectedJob.publishedDate)}
                              </span>
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                              <span className="flex items-center gap-1.5 font-medium">
                                <BookOpen size={16} className="text-slate-400" />
                                {calculateReadingTime(selectedJob.content)} পড়া
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Circular Image and Info Section */}
                        {selectedJob.imageUrls && selectedJob.imageUrls.length > 0 && (
                          <div className="mb-6 md:mb-8 space-y-6 md:space-y-8">
                            {selectedJob.imageUrls.map((url, idx) => (
                              <React.Fragment key={idx}>
                                <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white">
                                  <p className="px-3 md:px-4 py-2 md:py-3 bg-slate-50 text-[12px] sm:text-[14px] font-bold text-[#3b82f6] uppercase tracking-widest text-center border-b border-slate-100 flex items-center justify-center gap-2">
                                    <Globe size={14} /> নিয়োগ বিজ্ঞপ্তি / সার্কুলার ছবি {selectedJob.imageUrls && selectedJob.imageUrls.length > 1 ? `(${idx + 1}/${selectedJob.imageUrls.length})` : ''}
                                  </p>
                                  <div className="p-1 sm:p-2 bg-slate-100/50">
                                    <Zoom>
                                      <img 
                                        src={url} 
                                        alt={`${selectedJob.title} Circular Image ${idx + 1}`} 
                                        width={800}
                                        height={1200}
                                        className="w-full h-auto object-contain max-h-[1200px] rounded-lg"
                                        referrerPolicy="no-referrer"
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    </Zoom>
                                  </div>
                                </div>
                                <AdComponent />
                              </React.Fragment>
                            ))}
                            
                            {/* Information Table Section requested by user - shown after the images */}
                            <div className="p-4 md:p-6 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3">
                              <h3 className="font-bold text-base md:text-lg text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
                                <Bookmark size={18} className="text-[#3b82f6]" /> এক নজরে বিজ্ঞপ্তির বিস্তারিত
                              </h3>
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-1 md:gap-4 text-[13px] md:text-sm items-center">
                                  <span className="font-bold text-slate-500">প্রতিষ্ঠানের নামঃ</span>
                                  <span className="text-slate-800 font-bold bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">{selectedJob.organization}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-1 md:gap-4 text-[13px] md:text-sm items-center">
                                  <span className="font-bold text-slate-500">বিজ্ঞপ্তির সোর্সঃ</span>
                                  <span className="text-slate-800 font-medium px-3 py-1.5">{selectedJob.noticeSource || "অনলাইন / অফিসিয়াল ওয়েবসাইট"}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-1 md:gap-4 text-[13px] md:text-sm items-center">
                                  <span className="font-bold text-slate-500">অনলাইনে আবেদন শুরুর সময়ঃ</span>
                                  <span className="text-slate-800 px-3 py-1.5">{selectedJob.startTime || "চলমান"}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-1 md:gap-4 text-[13px] md:text-sm items-center">
                                  <span className="font-bold text-slate-500">আবেদনের শেষ সময়ঃ</span>
                                  <span className="text-rose-600 font-bold bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100 inline-flex items-center flex-wrap gap-2">
                                    {selectedJob.deadline}
                                    {getDaysRemaining(selectedJob.deadline) !== null && (
                                      <span className="text-rose-500 text-[11px] px-2 py-0.5 rounded-full bg-white border border-rose-100 shadow-sm">
                                        ({formatRemainingDays(getDaysRemaining(selectedJob.deadline))})
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-1 md:gap-4 text-[13px] md:text-sm items-center">
                                  <span className="font-bold text-slate-500">আবেদনের পদ্ধতিঃ</span>
                                  <span className="text-slate-800 px-3 py-1.5">{selectedJob.applyMethod || "অনলাইনে / ডাকযোগে"}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-1 md:gap-4 text-[13px] md:text-sm items-center">
                                  <span className="font-bold text-slate-500">আবেদনের লিংকঃ</span>
                                  <div className="py-1.5">
                                    <a 
                                      href={selectedJob.applyLink || selectedJob.link} 
                                      target="_blank" 
                                      rel="noopener noreferrer" 
                                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#3b82f6] text-white font-bold rounded-lg hover:bg-[#2563eb] transition-all shadow-md shadow-blue-100 w-full sm:w-auto text-sm md:text-base"
                                    >
                                      {selectedJob.applyLink ? "আবেদন করতে এখানে ক্লিক করুন" : "ওয়েবসাইট ভিজিট করুন"} <ExternalLink size={16} />
                                    </a>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* AI Summary Section */}
                        {jobSummaries[selectedJob.id] && (
                          <div className="mb-6 md:mb-8 bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 md:p-6 shadow-sm relative overflow-hidden">
                            <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-100/50 rounded-full blur-2xl"></div>
                            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-blue-100/50 rounded-full blur-2xl"></div>
                            
                            <div className="flex items-center gap-2 mb-3 md:mb-4 relative z-10">
                              <h3 className="font-bold text-indigo-900 border-b border-indigo-100/50 pb-1 w-full flex items-center justify-between">
                                সারসংক্ষেপ
                              </h3>
                            </div>
                            
                            <div className="relative z-10 text-slate-700 text-[13px] md:text-sm leading-relaxed max-w-none">
                              {jobSummaries[selectedJob.id].loading ? (
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2 text-indigo-500 font-medium pb-2">
                                      <Loader2 size={16} className="animate-spin" />
                                      <span>অপেক্ষা করুন, জেনারেট হচ্ছে...</span>
                                  </div>
                                  <div className="space-y-2 animate-pulse w-full">
                                    <div className="h-2 bg-indigo-100 rounded w-full"></div>
                                    <div className="h-2 bg-indigo-100 rounded w-[90%]"></div>
                                    <div className="h-2 bg-indigo-100 rounded w-[95%]"></div>
                                    <div className="h-2 bg-indigo-100 rounded w-[80%]"></div>
                                  </div>
                                </div>
                              ) : jobSummaries[selectedJob.id].error ? (
                                <p className="text-rose-500 bg-rose-50 p-3 rounded-lg border border-rose-100 flex items-center gap-2">
                                  <span className="text-[16px]">⚠️</span> {jobSummaries[selectedJob.id].error}
                                </p>
                              ) : (
                                <div className="prose prose-sm prose-indigo md:prose-base prose-p:my-2 prose-strong:text-indigo-900">
                                  <Markdown>{jobSummaries[selectedJob.id].text}</Markdown>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className="bg-blue-50/80 p-3 rounded-xl w-14 h-14 flex items-center justify-center border border-blue-100">
                              <Calendar size={24} className="text-[#3b82f6]" />
                            </div>
                            <div>
                              <p className="text-[11px] uppercase font-bold text-slate-400 mb-1 tracking-wider">Published Date</p>
                              <p className="text-[15px] font-bold text-slate-800">{formatDate(selectedJob.publishedDate)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="bg-rose-50/80 p-3 rounded-xl w-14 h-14 flex items-center justify-center border border-rose-100">
                              <Clock size={24} className="text-rose-500" />
                            </div>
                            <div>
                              <p className="text-[11px] uppercase font-bold text-slate-400 mb-1 tracking-wider">Time Remaining</p>
                              <p className="text-[15px] font-bold text-rose-600">
                                {selectedJob.remainingDays || formatRemainingDays(getDaysRemaining(selectedJob.deadline)) || selectedJob.deadline}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-8 p-5 bg-orange-50/80 border border-orange-100/80 rounded-xl shadow-sm">
                          <p className="text-[13px] md:text-sm text-orange-900 text-center flex flex-col sm:flex-row items-center justify-center gap-2 font-medium leading-relaxed">
                            <span className="text-xl shrink-0">⚠️</span>
                            <span><strong>সতর্কতা:</strong> আমরা বিভিন্ন বিশ্বস্ত মাধ্যম থেকে তথ্য সংগ্রহ করে সহজভাবে উপস্থাপন করি, আবেদনের পূর্বে মূল বিজ্ঞপ্তি যাচাই করে নিন।</span>
                          </p>
                        </div>
                        
                        {/* Facebook Comments */}
                        <div className="mt-8 bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
                          <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">মতামত দিন</h3>
                          <FacebookComments url={`${window.location.origin}/jobs/${selectedJob.slug || generateSlug(selectedJob.title, selectedJob.organization, selectedJob.id)}`} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {showExitConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExitConfirm(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden p-6 text-center"
            >
              <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldCheck size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">বের হতে চান? (Exit?)</h3>
              <p className="text-slate-500 mb-6 font-medium">আপনি কি সত্যিই ওয়েবসাইট থেকে বের হতে চান?<br/><span className="text-sm">(Do you really want to exit the website?)</span></p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  না (No)
                </button>
                <button 
                  onClick={handleConfirmExit}
                  className="flex-1 py-3 px-4 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-colors"
                >
                  হ্যাঁ (Yes)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Static Pages Modals */}
      <AnimatePresence>
        {activePage !== 'home' && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActivePage('home')}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-10">
                <h2 className="text-xl font-bold text-slate-800">
                  {activePage === 'privacy' && 'Privacy Policy'}
                  {activePage === 'terms' && 'Terms of Service'}
                  {activePage === 'contact' && 'Contact Us'}
                </h2>
                <button 
                  onClick={() => setActivePage('home')}
                  className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 hover:text-rose-500 rounded-full transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              
              <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar flex-1 prose prose-sm md:prose-base prose-slate max-w-none">
                {activePage === 'privacy' && (
                  <div>
                    <p>Last updated: {new Date().toLocaleDateString()}</p>
                    <h3>1. Information We Collect</h3>
                    <p>We may collect personal information such as your name, email address, and job preferences when you use our services. We also automatically collect certain information about your device and usage of our platform.</p>
                    
                    <h3>2. How We Use Your Information</h3>
                    <p>We use the information we collect to provide, maintain, and improve our services, as well as to personalize your experience and communicate with you.</p>

                    <h3>3. Cookies and Technologies</h3>
                    <p>We use cookies and similar tracking technologies to track activity on our platform and hold certain information. We also use third-party services like Google AdSense which may use cookies to serve ads based on your prior visits to our platform or other websites.</p>
                    
                    <h3>4. Data Security</h3>
                    <p>We implement reasonable security measures to protect your personal information, but please remember that no method of transmission over the internet is 100% secure.</p>
                  </div>
                )}
                {activePage === 'terms' && (
                  <div>
                    <p>Last updated: {new Date().toLocaleDateString()}</p>
                    <h3>1. Terms</h3>
                    <p>By accessing this website, you agree to be bound by these Terms of Service and comply with all applicable laws and regulations.</p>
                    
                    <h3>2. Disclaimer</h3>
                    <p>The materials on our platform are provided on an 'as is' basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>
                    <p><strong>Job Information Accuracy:</strong> We collect and present job circular information from various sources to simplify your search. We recommend verifying the original circular before submitting any application.</p>

                    <h3>3. Limitations</h3>
                    <p>In no event shall we or our suppliers be liable for any damages arising out of the use or inability to use the materials on our platform.</p>
                  </div>
                )}
                {activePage === 'contact' && (
                  <div className="flex flex-col items-center justify-center text-center py-8">
                    <div className="w-16 h-16 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mb-6">
                      <Globe size={32} />
                    </div>
                    <h3>Get in Touch</h3>
                    <p className="text-slate-500 max-w-md mx-auto mb-6">We'd love to hear from you. Please reach out to us for any queries, feedback, or support related to our services.</p>
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 w-full max-w-sm">
                      <p className="flex items-center justify-center gap-3 font-bold text-slate-800">
                        Email: admin@talukdaracademy.com.bd
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button 
                  onClick={() => setActivePage('home')}
                  className="px-6 py-2 bg-[#3b82f6] text-white font-bold text-sm rounded-lg hover:bg-blue-600 transition-colors shadow-sm shadow-blue-100"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
        .job-detail-content img {
          max-width: 100%;
          height: auto;
          margin-top: 10px;
          border-radius: 8px;
        }
        .job-detail-content p {
          margin-bottom: 16px;
          line-height: 1.8;
          color: #475569;
        }
        .job-detail-content h1, .job-detail-content h2, .job-detail-content h3 {
          font-weight: bold;
          color: #0f172a;
          margin-top: 24px;
          margin-bottom: 12px;
          font-size: 1.1rem;
        }
        .job-detail-content strong {
          color: #1e293b;
          font-weight: 600;
        }
        .job-detail-content ul, .job-detail-content ol {
          margin-bottom: 16px;
          padding-left: 20px;
        }
        .job-detail-content li {
          margin-bottom: 8px;
          list-style: disc;
        }
        #details-wrapper {
          transform: none !important;
          will-change: auto !important;
        }
      `}</style>
      <ScrollButtons containerRef={scrollContainerRef} />
      </>
      )}
    </div>
  );
}
