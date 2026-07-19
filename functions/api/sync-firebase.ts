import { fetchLatestJobs } from './jobs';

export async function onRequest(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  
  try {
    const full = url.searchParams.get('full') === 'true';
    
    // Force warm up/refresh the jobs cache
    const jobs = await fetchLatestJobs(true);
    
    return new Response(JSON.stringify({ 
      success: true, 
      count: jobs.length,
      message: 'Cache updated successfully' 
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('Failed to sync cache:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Failed to sync cache', 
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
