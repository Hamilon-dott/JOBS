import { GoogleGenAI } from "@google/genai";

export async function onRequest(context: any) {
  const { request, env } = context;
  
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { title, organization, content } = await request.json();

    if (!content) {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured on Cloudflare' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const systemInstruction = `You are an expert job assistant in Bangladesh.
Summarize the key details of this job circular in Bengali in a bulleted list.
Include fields like:
- প্রতিষ্ঠানের নাম (Organization Name)
- পদের নাম (Job Title/Position)
- খালি পদের সংখ্যা (Number of Vacancies)
- শিক্ষাগত যোগ্যতা (Educational Qualification)
- বেতন ও অন্যান্য সুযোগ-সুবিধা (Salary & Benefits)
- আবেদনের শেষ তারিখ (Application Deadline)
Format the output beautifully with standard Bengali markdown bullet points. Do not include introductory or concluding conversational text.`;

    const prompt = `Title: ${title}
Organization: ${organization}
Content: ${content}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2,
      },
    });

    const summaryText = response.text || "সারসংক্ষেপ তৈরি করা সম্ভব হয়নি।";

    return new Response(JSON.stringify({ summary: summaryText }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch (error: any) {
    console.error('Failed to generate summary:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate summary', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
