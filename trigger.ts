import axios from 'axios';
axios.get('http://0.0.0.0:3000/api/sync-firebase').then(console.log).catch(console.error);
