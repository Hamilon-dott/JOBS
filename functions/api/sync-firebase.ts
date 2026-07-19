export async function onRequest(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const isFull = url.searchParams.get('full') === 'true';
  const baseUrl = `${url.protocol}//${url.host}`;
  
  console.log("CF Cron: Warming up jobs API cache...");
  try {
    await fetch(`${baseUrl}/api/jobs?full=${isFull}`, { 
       signal: AbortSignal.timeout(45000)
    });
  } catch (e: any) {
    console.log("Cache warming ping resulted in:", e.message);
  }

  return new Response(JSON.stringify({
    success: true,
    message: `Cache warmed up successfully.`,
    stats: {
      syncedCount: 1,
      cleanedCount: 0
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
