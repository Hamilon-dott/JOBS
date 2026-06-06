const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

content = content.replace(
`  // API Route to manually sync jobs to Firebase
  app.get('/api/sync-firebase', async (req, res) => {
    try {
      const isQuick = req.query.quick === 'true' || req.query.q === '1';
      const isFull = req.query.full === 'true';
      const result = await syncJobsToFirebase(isQuick, isFull);
      res.json(result);
    } catch (error) {
      console.error('Error syncing:', error);
      res.status(500).json({ error: 'Failed to sync to Firebase' });
    }
  });`,
`  // API Route to manually refresh RAM cache
  app.get('/api/refresh-cache', async (req, res) => {
    try {
      const result = await refreshRAMCache();
      res.json(result);
    } catch (error) {
      console.error('Error refreshing cache:', error);
      res.status(500).json({ error: 'Failed to refresh cache' });
    }
  });`
);

fs.writeFileSync('server.ts', content);
