import axios from 'axios';

async function checkCORS() {
  try {
    const res = await axios.options('https://bdgovtjob.net/wp-json/wp/v2/posts');
    console.log(res.headers);
  } catch (e) {
    if (e.response) console.log(e.response.headers);
    else console.error(e.message);
  }
}
checkCORS();
