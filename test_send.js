const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

console.log("Initializing test send...");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const messaging = admin.messaging();

// Using a dummy token to test the API gateway response
const message = {
  token: "d1y-token-12345-d1y-token-12345-d1y-token-12345",
  notification: {
    title: "Test Diagnostic",
    body: "Checking FCM v1 API gateway authorization"
  }
};

console.log("Sending dummy FCM request...");
messaging.send(message)
  .then(response => {
    console.log("🎉 Success! (Though dummy token should fail with registration error, not auth error):", response);
  })
  .catch(error => {
    console.log("\n❌ Send Error Caught:");
    console.log(`- Code: ${error.code}`);
    console.log(`- Message: ${error.message}`);
    console.log("\n- Error Details:");
    console.dir(error, { depth: null });
  });
