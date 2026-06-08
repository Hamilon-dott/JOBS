import http from 'http';
http.get('http://localhost:3000/api/jobs', res => {
  console.log(res.statusCode);
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => console.log(data.slice(0, 500)));
}).on('error', console.error);
