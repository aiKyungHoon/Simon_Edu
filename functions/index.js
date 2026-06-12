/**
 * Firebase Cloud Functions v2 Template
 * Secure Queue-based FCM Push Processor
 * Deploy Revision: v1.0.4 - force container rollout
 * 
 * Triggered when a new document is written to the `push_queue` collection.
 * Processes the message and dispatches it to FCM.
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

// Initialize Admin SDK securely
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "simon-edu-bible-game"
  });
}

const db = admin.firestore();
const messaging = admin.messaging();

exports.processPushQueue = onDocumentCreated("push_queue/{pushId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    console.log("No snapshot data found.");
    return null;
  }

  const pushId = event.params.pushId;
  const data = snapshot.data();

  // Guard: Only process pending notifications
  if (data.status !== "pending") {
    console.log(`Document ${pushId} is not in pending state. Skipping.`);
    return null;
  }

  console.log(`Processing push request ${pushId}: target=${data.target}, title="${data.title}"`);

  try {
    const payload = {
      notification: {
        title: data.title,
        body: data.body,
      },
      data: {
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        type: "bible_challenge",
      },
      android: {
        notification: {
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
          sound: "default",
        }
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          }
        }
      }
    };

    if (data.target === "user") {
      const token = data.fcmToken;
      if (!token) {
        throw new Error("No FCM Token registered for individual user target.");
      }

      const message = {
        token: token,
        ...payload
      };

      console.log(`Sending single push to token ending with ...${token.slice(-6)}`);
      const response = await messaging.send(message);
      
      await snapshot.ref.update({
        status: "success",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        messageId: response
      });
      console.log(`Successfully sent push ${pushId}`);

      if (data.targetUid) {
        const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        await db.collection("users").doc(data.targetUid).update({
          notifications: admin.firestore.FieldValue.arrayUnion({
            id: notifId,
            message: `📢 ${data.title}\n${data.body}`,
            read: false,
            timestamp: Date.now()
          })
        });
      }

    } else if (data.target === "all" || data.target === "roles") {
      const targetRoles = Array.isArray(data.targetRoles) ? data.targetRoles : [];
      console.log(data.target === "roles" ? `Broadcasting to roles: ${targetRoles.join(",")}` : "Broadcasting push notification to all users...");
      
      const usersSnap = await db.collection("users").get();
      const tokens = [];
      const targetUserRefs = [];
      usersSnap.forEach((userDoc) => {
        const uData = userDoc.data();
        if (data.target === "roles" && !targetRoles.includes(uData.role)) {
          return;
        }
        targetUserRefs.push(userDoc.ref);
        const t = uData.pushToken || uData.fcmToken;
        if (t) {
          tokens.push(t);
        }
      });

      const uniqueTokens = [...new Set(tokens)];
      console.log(`Found ${uniqueTokens.length} unique registered tokens.`);

      if (uniqueTokens.length === 0) {
        await snapshot.ref.update({
          status: "success",
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          details: "No users registered with FCM tokens."
        });
        return null;
      }

      const batches = [];
      const batchSize = 500;
      for (let i = 0; i < uniqueTokens.length; i += batchSize) {
        batches.push(uniqueTokens.slice(i, i + batchSize));
      }

      let totalSuccess = 0;
      let totalFailure = 0;
      const failedTokens = [];

      for (const batch of batches) {
        const multicastMessage = {
          tokens: batch,
          ...payload
        };

        const batchResponse = await messaging.sendEachForMulticast(multicastMessage);
        totalSuccess += batchResponse.successCount;
        totalFailure += batchResponse.failureCount;

        batchResponse.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const token = batch[idx];
            console.error(`Failed to send to token: ${token}. Error:`, resp.error);
            failedTokens.push({ token, errorCode: resp.error.code });
          }
        });
      }

      console.log(`Broadcast summary: success=${totalSuccess}, failure=${totalFailure}`);

      if (failedTokens.length > 0) {
        console.log(`Cleaning up ${failedTokens.length} invalid/expired tokens...`);
        const batchDb = db.batch();
        for (const fail of failedTokens) {
          if (fail.errorCode === "messaging/registration-token-not-registered" || 
              fail.errorCode === "messaging/invalid-argument") {
            const userQuery = await db.collection("users")
              .where("pushToken", "==", fail.token)
              .limit(1)
              .get();
            if (!userQuery.empty) {
              batchDb.update(userQuery.docs[0].ref, { 
                pushToken: admin.firestore.FieldValue.delete()
              });
            }
            const userQuery2 = await db.collection("users")
              .where("fcmToken", "==", fail.token)
              .limit(1)
              .get();
            if (!userQuery2.empty) {
              batchDb.update(userQuery2.docs[0].ref, { 
                fcmToken: admin.firestore.FieldValue.delete()
              });
            }
          }
        }
        await batchDb.commit();
      }

      await snapshot.ref.update({
        status: "success",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        successCount: totalSuccess,
        failureCount: totalFailure,
        details: `Broadcasted to ${totalSuccess} devices successfully. Cleaned up ${failedTokens.length} inactive tokens.`
      });

      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      let batchDbNotice = db.batch();
      let batchCountNotice = 0;

      for (const userRef of targetUserRefs) {
        batchDbNotice.update(userRef, {
          notifications: admin.firestore.FieldValue.arrayUnion({
            id: notifId,
            message: `📢 ${data.title}\n${data.body}`,
            read: false,
            timestamp: Date.now()
          })
        });
        batchCountNotice++;
        if (batchCountNotice === 500) {
          await batchDbNotice.commit();
          batchDbNotice = db.batch();
          batchCountNotice = 0;
        }
      }
      if (batchCountNotice > 0) {
        await batchDbNotice.commit();
      }
    } else {
      throw new Error(`Unsupported target type: ${data.target}`);
    }

  } catch (error) {
    console.error(`Error processing push ${pushId}:`, error);
    await snapshot.ref.update({
      status: "failed",
      error: error.message || String(error),
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  return null;
});

exports.processPasswordReset = onDocumentCreated("password_resets/{resetId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return null;

  const data = snapshot.data();
  if (data.status !== "pending") return null;

  const { username, name, email } = data;
  if (!username || !name || !email) {
    await snapshot.ref.update({
      status: "failed",
      error: "필수 정보가 누락되었습니다."
    });
    return null;
  }

  try {
    // Look up user in Firestore
    let matchedDoc = null;
    const allUsersSnap = await db.collection("users").get();
    allUsersSnap.forEach(doc => {
      const u = doc.data();
      if (u.username && u.username.toLowerCase() === username.toLowerCase()) {
        matchedDoc = doc;
      }
    });

    if (!matchedDoc) {
      throw new Error("일치하는 계정을 찾을 수 없습니다.");
    }
    
    const uData = matchedDoc.data();
    if (uData.name !== name || uData.email.toLowerCase() !== email.toLowerCase()) {
      throw new Error("입력하신 정보가 회원 정보와 일치하지 않습니다.");
    }
    
    const uid = matchedDoc.id;

    // Check if user exists in Firebase Auth
    let authUser = null;
    try {
      authUser = await admin.auth().getUser(uid);
    } catch (authGetErr) {
      if (authGetErr.code !== 'auth/user-not-found') {
        throw authGetErr;
      }
    }

    if (!authUser) {
      // User exists in Firestore but not in Firebase Auth (unmigrated seed user)
      // Create them in Firebase Auth on the fly with their real email and a random/temporary password
      const tempPassword = "Temp" + Math.random().toString(36).substring(2, 10) + "!";
      await admin.auth().createUser({
        uid: uid,
        email: email.toLowerCase(),
        password: tempPassword
      });
    } else {
      // Update email in Auth to the real email
      await admin.auth().updateUser(uid, { email: email.toLowerCase() });
    }

    await snapshot.ref.update({
      status: "email_updated",
      uid: uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("Password reset function error:", error);
    await snapshot.ref.update({
      status: "failed",
      error: error.message || String(error),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  return null;
});
