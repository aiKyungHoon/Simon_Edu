/**
 * Local Node.js Test Listener Script
 * 
 * You can run this script locally on your computer to process the push queue immediately.
 * 
 * Setup Instructions:
 * 1. Go to Firebase Console > Project Settings > Service Accounts.
 * 2. Click "Generate new private key" to download a JSON file.
 * 3. Place that JSON file in the same directory as this script and rename it to `serviceAccountKey.json`.
 * 4. Run:
 *    npm install firebase-admin
 *    node local_push_listener.js
 */

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

console.log("🚀 실시간 푸시 큐 감시 시작 (대기 중인 푸시 처리 중...)");

db.collection("push_queue")
  .where("status", "==", "pending")
  .onSnapshot(async (snapshot) => {
    if (snapshot.empty) {
      return;
    }

    console.log(`\n🔔 새로운 펜딩 푸시 감지: ${snapshot.size}건`);

    for (const changeDoc of snapshot.docs) {
      const pushId = changeDoc.id;
      const data = changeDoc.data();
      const docRef = changeDoc.ref;

      console.log(`\n[처리 시작] ID: ${pushId}`);
      console.log(`- 수신자: ${data.targetName || data.target}`);
      console.log(`- 제목: ${data.title}`);
      console.log(`- 내용: ${data.body}`);

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
            throw new Error("지정된 사용자의 FCM 토큰이 존재하지 않습니다.");
          }

          const message = {
            token: token,
            ...payload
          };

          console.log(`-> FCM 단건 알림 발송 중...`);
          const response = await messaging.send(message);
          
          await docRef.update({
            status: "success",
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            messageId: response
          });
          console.log(`✅ 발송 성공! (Message ID: ${response})`);

          if (data.targetUid) {
            console.log(`-> 유저 수신함에 알림 추가 중...`);
            const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            await db.collection("users").doc(data.targetUid).update({
              notifications: admin.firestore.FieldValue.arrayUnion({
                id: notifId,
                message: `📢 ${data.title}\n${data.body}`,
                read: false,
                timestamp: Date.now()
              })
            });
            console.log(`✅ 유저 수신함 저장 성공!`);
          }

        } else if (data.target === "all" || data.target === "roles") {
          const targetRoles = Array.isArray(data.targetRoles) ? data.targetRoles : [];
          console.log(data.target === "roles" ? `-> 권한 대상(${targetRoles.join(", ")}) 발송을 위해 토큰 수집 중...` : `-> 전체 발송을 위해 토큰 수집 중...`);
          
          // Query users with pushToken or fcmToken
          let usersSnap = await db.collection("users").get();
          const tokens = [];
          const targetUserRefs = [];
          
          usersSnap.forEach((userDoc) => {
            const uData = userDoc.data();
            if (data.target === "roles" && !targetRoles.includes(uData.role)) {
              return;
            }
            targetUserRefs.push(userDoc.ref);
            const token = uData.pushToken || uData.fcmToken;
            if (token) {
              tokens.push(token);
            }
          });

          const uniqueTokens = [...new Set(tokens)];
          console.log(`-> 유효 토큰 수: ${uniqueTokens.length}개`);

          if (uniqueTokens.length === 0) {
            await docRef.update({
              status: "success",
              sentAt: admin.firestore.FieldValue.serverTimestamp(),
              details: "등록된 토큰이 없어 발송을 건너뛰었습니다."
            });
            console.log("⚠️ 발송 가능한 토큰이 없습니다.");
            continue;
          }

          // Batching (max 500 per request)
          const batchSize = 500;
          let totalSuccess = 0;
          let totalFailure = 0;
          const failedTokens = [];

          for (let i = 0; i < uniqueTokens.length; i += batchSize) {
            const batch = uniqueTokens.slice(i, i + batchSize);
            const multicastMessage = {
              tokens: batch,
              ...payload
            };

            const batchResponse = await messaging.sendEachForMulticast(multicastMessage);
            totalSuccess += batchResponse.successCount;
            totalFailure += batchResponse.failureCount;

            batchResponse.responses.forEach((resp, idx) => {
              if (!resp.success) {
                failedTokens.push(batch[idx]);
              }
            });
          }

          // Expired token cleanup
          if (failedTokens.length > 0) {
            console.log(`-> 비활성/만료된 토큰 ${failedTokens.length}개 정리 중...`);
            const batchDb = db.batch();
            for (const badToken of failedTokens) {
              const userQuery1 = await db.collection("users").where("pushToken", "==", badToken).get();
              userQuery1.forEach(uDoc => {
                batchDb.update(uDoc.ref, { pushToken: admin.firestore.FieldValue.delete() });
              });

              const userQuery2 = await db.collection("users").where("fcmToken", "==", badToken).get();
              userQuery2.forEach(uDoc => {
                batchDb.update(uDoc.ref, { fcmToken: admin.firestore.FieldValue.delete() });
              });
            }
            await batchDb.commit();
          }

          await docRef.update({
            status: "success",
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            successCount: totalSuccess,
            failureCount: totalFailure,
            details: `성공: ${totalSuccess}건, 실패: ${totalFailure}건`
          });
          console.log(`✅ 전체 발송 완료 (성공: ${totalSuccess}, 실패: ${totalFailure})`);

          console.log(`-> 대상 유저 수신함에 공지 알림 추가 중...`);
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
          console.log(`✅ 대상 유저 수신함 저장 성공! (${targetUserRefs.length}명)`);
        }

      } catch (error) {
        console.error(`❌ 발송 오류 (ID: ${pushId}):`, error);
        await docRef.update({
          status: "failed",
          error: error.message || String(error),
          sentAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
  }, (error) => {
    console.error("Firestore 리스너 에러:", error);
  });
