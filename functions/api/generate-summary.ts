import { GoogleGenAI } from '@google/genai';

export async function onRequestPost(context: any) {
  const { request, env } = context;

  try {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ summary: "No API key configured." }), { headers: { 'Content-Type': 'application/json' }});
    }

    const ai = new GoogleGenAI({ apiKey });
    const { title, organization, content } = await request.json();

    const prompt = `Please provide a 1-2 paragraph engaging summary in Bengali for the following job posting. 
    Highlight the key benefits of this job and clearly explain who is eligible to apply in simple Bengali.
    Be concise, professional, and encouraging. Do not use Markdown headings like # or ==, but bold texts are fine.
    
    Job Title: ${title}
    Organization: ${organization}
    Details: ${(content || '').substring(0, 4000)}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return new Response(JSON.stringify({ summary: response.text || '' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error("Failed to generate summary via backend", error?.message || "Unknown error");
    return new Response(JSON.stringify({ summary: "বিজ্ঞপ্তির সারাংশ তৈরি করা সম্ভব হয়নি (AI generation failed)। অনুগ্রহ করে নিচের বিস্তারিত তথ্য অথবা সার্কুলার ছবিটি দেখুন।" }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
