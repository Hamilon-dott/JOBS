import axios from 'axios';

async function checkOrigin() {
  try {
    const res = await axios.get('https://bdgovtjob.net/wp-json/wp/v2/posts?per_page=1', {
        headers: {
            'Origin': 'http://localhost:3000'
        }
    });
    console.log(res.headers);
  } catch (e) {
    if (e.response) console.log(e.response.headers);
    else console.error(e.message);
  }
}
checkOrigin();
