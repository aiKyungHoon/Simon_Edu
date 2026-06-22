const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function check() {
  console.log("=== USERS WITH NAME 춘식 ===");
  const usersSnapshot = await db.collection('users').get();
  let targetUser = null;
  usersSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.name?.includes("춘식") || data.examApplicantName?.includes("춘식")) {
      console.log(`User ID: ${doc.id}, Name: ${data.name}, Region: ${data.examRegion}, ExamName: ${data.examApplicantName}`);
      targetUser = { id: doc.id, ...data };
    }
  });

  console.log("\n=== ACTIVE EVENTS ===");
  const eventsSnapshot = await db.collection('events').get();
  eventsSnapshot.forEach(doc => {
    const data = doc.data();
    console.log(`Event ID: ${doc.id}, Title: ${data.title}, Active: ${data.active}, StartCh: ${data.examStartChapter || data.startChapter}, EndCh: ${data.examEndChapter || data.endChapter}`);
  });

  if (targetUser) {
    console.log("\n=== TARGET USER EXAM SUBMISSION ===");
    console.log(JSON.stringify(targetUser.examSubmission || null, null, 2));

    console.log("\n=== TARGET USER IN MISSION EXAM SUBMISSIONS COLLECTION ===");
    const key = `십일__춘식`.toLowerCase(); // from the console logs: 십일__춘식
    const docSnap = await db.collection('mission_exam_submissions').doc(key).get();
    if (docSnap.exists) {
      console.log(JSON.stringify(docSnap.data(), null, 2));
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
