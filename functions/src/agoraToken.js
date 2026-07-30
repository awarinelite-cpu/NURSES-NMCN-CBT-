// functions/src/agoraToken.js
//
// Firebase Cloud Function — mints a short-lived Agora RTC token so group
// study calls aren't wide open. Callable (not HTTP), so Firebase Auth does
// the identity check for us: context.auth is only populated for a signed-in
// caller with a valid ID token, no manual verification needed.
//
// Extra check on top of that: the caller must actually be a listed
// participant of the studySessions/{channel} doc they're asking to join —
// so a valid login alone isn't enough to mint a token for an arbitrary
// channel, only for sessions you're actually in.
//
// SETUP:
//   firebase functions:secrets:set AGORA_APP_ID
//   firebase functions:secrets:set AGORA_APP_CERTIFICATE
//   (App ID isn't sensitive on its own, but keeping both in Secret Manager
//   avoids relying on the deprecated functions.config() path.)
//
// DEPLOY:
//   cd functions
//   npm install
//   firebase deploy --only functions:mintAgoraToken

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { defineSecret } = require('firebase-functions/params');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const AGORA_APP_ID          = defineSecret('AGORA_APP_ID');
const AGORA_APP_CERTIFICATE = defineSecret('AGORA_APP_CERTIFICATE');
const TOKEN_TTL_SECONDS = 3600; // 1 hour — client rejoins if a call runs longer

const mintAgoraToken = functions
  .runWith({ secrets: [AGORA_APP_ID, AGORA_APP_CERTIFICATE] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
    }
    const uid = context.auth.uid;
    const channel = String(data?.channel || '').trim();
    const agoraUid = Number(data?.agoraUid);
    if (!channel || !Number.isInteger(agoraUid)) {
      throw new functions.https.HttpsError('invalid-argument', 'channel and agoraUid are required.');
    }

    // Confirm this user is actually a participant of the session they're
    // trying to get a call token for.
    const partSnap = await db.doc(`studySessions/${channel}/participants/${uid}`).get();
    if (!partSnap.exists) {
      throw new functions.https.HttpsError('permission-denied', 'Not a participant of this session.');
    }

    const appId = AGORA_APP_ID.value();
    const appCertificate = AGORA_APP_CERTIFICATE.value();
    if (!appId || !appCertificate) {
      console.error('Agora App ID / Certificate not configured.');
      throw new functions.https.HttpsError('failed-precondition', 'Group calling is not configured on the server.');
    }

    const expireAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId, appCertificate, channel, agoraUid, RtcRole.PUBLISHER, expireAt, expireAt,
    );

    return { token, expireAt };
  });

module.exports = { mintAgoraToken };
