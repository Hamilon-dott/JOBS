import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import https from 'https';

const httpsAgent = new https.Agent({  
  rejectUnauthorized: false
});

// Serverless Handler Entrypoint
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const isFull = req.query.full === 'true';
    const baseUrl = `http://${req.headers.host || 'localhost'}`;
    
    // Warm up the Vercel jobs API cache by pinging it 
    console.log("Vercel Cron: Warming up jobs API cache...");
    try {
      await axios.get(`${baseUrl}/api/jobs?full=${isFull}`, { 
        timeout: 45000,
        httpsAgent 
      });
    } catch (e: any) {
      console.log("Cache warming ping resulted in:", e.message);
    }

    return res.status(200).json({
      success: true,
      message: `Cache warmed up successfully.`,
      stats: {
        syncedCount: 1,
        cleanedCount: 0
      }
    });
  } catch (error: any) {
    console.error("Vercel Cron failure handlings:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed during serverless sync process."
    });
  }
}
