const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function check() {
  const keys = ['상암__춘식', '십일__춘식'];
  for (const key of keys) {
    const docSnap = await db.collection('mission_exam_submissions').doc(key.toLowerCase()).get();
    if (docSnap.exists) {
      console.log(`Document mission_exam_submissions/${key} exists!`);
      const data = docSnap.data();
      console.log(`  attempts count: ${data.attempts?.length}`);
      data.attempts?.forEach((att, idx) => {
        console.log(`    Attempt ${idx+1}: id=${att.id}, eventId=${att.eventId}, eventTitle=${att.eventTitle}, score=${att.score}, startCh=${att.startChapter}, endCh=${att.endChapter}`);
      });
    } else {
      console.log(`Document mission_exam_submissions/${key} does not exist`);
    }
  }
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
