const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

db.collection('settings').doc('global').get().then(doc => {
  if (doc.exists) {
    console.log("SETTINGS GLOBAL DOC:", doc.data());
  } else {
    console.log("SETTINGS GLOBAL DOC DOES NOT EXIST!");
  }
  process.exit(0);
}).catch(err => {
  console.error("ERROR READING GLOBAL SETTINGS:", err);
  process.exit(1);
});
