import axios from 'axios';
console.log("Fetching jobs...");
axios.get('http://0.0.0.0:3000/api/jobs').then(r => console.log(r.data.length)).catch(e => console.error(e.message));
