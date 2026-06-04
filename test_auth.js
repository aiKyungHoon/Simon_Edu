const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

console.log("Checking service account authentication...");

const credential = admin.credential.cert(serviceAccount);

credential.getAccessToken()
  .then(token => {
    console.log("🎉 SUCCESS! Access token fetched successfully:");
    console.log(`- Token type: ${token.type}`);
    console.log(`- Expires in: ${token.expires_in} seconds`);
    console.log(`- Token starts with: ${token.access_token.slice(0, 15)}...`);
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ ERROR fetching access token:");
    console.error(err);
    process.exit(1);
  });
