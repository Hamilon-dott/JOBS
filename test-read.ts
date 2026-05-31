import * as fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, query, orderBy, limit, getDoc } from 'firebase/firestore';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function check() {
  const jobsRef = collection(db, 'jobs');
  const q = query(jobsRef, orderBy('publishedDate', 'desc'), limit(5));
  const snapshot = await getDocs(q);
  console.log("Empty?", snapshot.empty);
  console.log("Docs:", snapshot.docs.map(doc => doc.data().title));
  
  process.exit(0);
}
check();
