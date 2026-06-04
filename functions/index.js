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

    } else if (data.target === "all") {
      console.log("Broadcasting push notification to all users...");
      
      const usersSnap = await db.collection("users").get();
      const tokens = [];
      usersSnap.forEach((userDoc) => {
        const uData = userDoc.data();
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
      const allUsersSnap = await db.collection("users").get();
      let batchDbNotice = db.batch();
      let batchCountNotice = 0;

      for (const uDoc of allUsersSnap.docs) {
        batchDbNotice.update(uDoc.ref, {
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
