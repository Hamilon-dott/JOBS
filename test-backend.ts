import axios from 'axios';
async function test() {
  try {
    const res = await axios.get('http://127.0.0.1:3000/api/jobs?full=true');
    console.log("length:", res.data?.length);
    console.log("first item:", JSON.stringify(res.data?.[0], null, 2));
    process.exit(0);
  } catch (e: any) {
    console.error("HTTP error:", e.message);
    process.exit(1);
  }
}
test();
