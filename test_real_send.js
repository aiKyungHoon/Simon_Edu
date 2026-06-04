const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

console.log("Fetching token for user '춘식'...");

db.collection("users")
  .where("username", "==", "kh91")
  .limit(1)
  .get()
  .then(async (snap) => {
    if (snap.empty) {
      console.log("User '춘식' not found in database.");
      process.exit(1);
    }

    const uDoc = snap.docs[0];
    const uData = uDoc.data();
    const token = uData.pushToken || uData.fcmToken;

    if (!token) {
      console.log("User '춘식' has no registered token.");
      process.exit(1);
    }

    console.log(`Found token: ...${token.slice(-8)}`);
    console.log("Sending diagnostic request to FCM v1 with real token...");

    const message = {
      token: token,
      notification: {
        title: "실제 토큰 테스트",
        body: "인증 에러 검증"
      },
      data: {
        click_action: "FLUTTER_NOTIFICATION_CLICK"
      }
    };

    try {
      const response = await messaging.send(message);
      console.log("🎉 Success! Send response:", response);
      process.exit(0);
    } catch (error) {
      console.log("\n❌ Send Error Caught:");
      console.log(`- Code: ${error.code}`);
      console.log(`- Message: ${error.message}`);
      console.log("\n- Error details:");
      console.dir(error, { depth: null });
      process.exit(1);
    }
  })
  .catch(err => {
    console.error("Firestore read error:", err);
    process.exit(1);
  });
