const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function check() {
  console.log("=== ACTIVE EVENTS DETAILS ===");
  const eventsSnapshot = await db.collection('events').get();
  eventsSnapshot.forEach(doc => {
    const data = doc.data();
    console.log(`Event ID: ${doc.id}`);
    console.log(`  Title: ${data.title}`);
    console.log(`  Active: ${data.active}`);
    console.log(`  EventType: ${data.eventType}`);
    console.log(`  examStartChapter: ${data.examStartChapter}, examEndChapter: ${data.examEndChapter}`);
    console.log(`  startDate: ${data.startDate}, endDate: ${data.endDate}`);
    console.log(`  purpose: ${data.purpose}`);
    console.log(`  rewardPoints: ${data.rewardPoints}`);
    console.log(`  examMaxPoints: ${data.examMaxPoints}`);
  });
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
