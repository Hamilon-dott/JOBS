import { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json({ summary: "No API key configured." });
    }

    const ai = new GoogleGenAI({ apiKey });
    const { title, organization, content } = req.body;
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

    return res.json({ summary: response.text || '' });
  } catch (error: any) {
    console.error("Failed to generate summary via backend", error?.message || "Unknown error");
    return res.json({ summary: "বিজ্ঞপ্তির সারাংশ তৈরি করা সম্ভব হয়নি (AI generation failed)। অনুগ্রহ করে নিচের বিস্তারিত তথ্য অথবা সার্কুলার ছবিটি দেখুন।" });
  }
}
