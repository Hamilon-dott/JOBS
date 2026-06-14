import handler from './api/sitemap.js';

const mockReq = { headers: { host: 'localhost:3000' } };
const mockRes = {
  setHeader: (k,v) => console.log('SetHeader', k, v),
  status: (s) => ({ send: (d) => console.log(d.substring(0, 200) + '...') })
};

handler(mockReq, mockRes).then(() => console.log('Done')).catch(console.error);
