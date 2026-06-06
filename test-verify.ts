import axios from 'axios';
async function test() {
  const res = await axios.get('http://127.0.0.1:3000/api/jobs?full=true');
  const jobs = res.data;
  let noDeadline = 0;
  for(const j of jobs) {
    if(!j.deadline) {
       console.log("No deadline:", j.id);
       noDeadline++;
    }
  }
  console.log({noDeadline});
}
test();
