const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function check() {
  console.log("=== ACTIVE EVENTS ===");
  const eventsSnapshot = await db.collection('events').get();
  eventsSnapshot.forEach(doc => {
    const data = doc.data();
    console.log(`Event ID: ${doc.id}`);
    console.log(`  Title: ${data.title}`);
    console.log(`  Active: ${data.active}`);
    console.log(`  EventType: ${data.eventType}`);
    console.log(`  examStartChapter: ${data.examStartChapter}, examEndChapter: ${data.examEndChapter}`);
    console.log(`  startChapter: ${data.startChapter}, endChapter: ${data.endChapter}`);
  });

  console.log("\n=== USERS WITH NAME 춘식 ===");
  const usersSnapshot = await db.collection('users').get();
  usersSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.name?.includes("춘식") || data.examApplicantName?.includes("춘식")) {
      console.log(`User ID: ${doc.id}, Name: ${data.name}, Region: ${data.examRegion}, ExamName: ${data.examApplicantName}`);
      if (data.examSubmission) {
        console.log("  examSubmission keys:", Object.keys(data.examSubmission));
        console.log("  examSubmission.score:", data.examSubmission.score);
        console.log("  examSubmission.pointsEarned:", data.examSubmission.pointsEarned);
        console.log("  examSubmission.lastAttemptDate:", data.examSubmission.lastAttemptDate);
        if (data.examSubmission.attempts) {
          console.log(`  examSubmission.attempts count: ${data.examSubmission.attempts.length}`);
          data.examSubmission.attempts.forEach((att, idx) => {
            console.log(`    Attempt ${idx+1}: id=${att.id}, eventId=${att.eventId}, eventTitle=${att.eventTitle}, score=${att.score}, startChapter=${att.startChapter}, endChapter=${att.endChapter}`);
          });
        }
      }
    }
  });

  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
