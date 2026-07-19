import { fetchSingleJob } from '../jobs';

export async function onRequest(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  
  // Extract the slug or id from the path segments
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const slugOrId = pathSegments[pathSegments.length - 1]; // This will be the dynamic job slug or id
  
  if (!slugOrId || slugOrId === 'job') {
    return new Response(JSON.stringify({ error: 'Job slug or id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const job = await fetchSingleJob(decodeURIComponent(slugOrId));
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
  } catch (error: any) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch job details', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
