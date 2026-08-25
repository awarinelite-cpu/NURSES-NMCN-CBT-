// functions/src/telegramLinkCode.js
//
// Callable Cloud Function used by the React app to generate a short-lived
// code the user pastes into the Telegram bot with /link CODE, pairing their
// Telegram chat to their Firebase account.
//
// FRONTEND USAGE (e.g. in a "Link Telegram" button in ProfilePage.jsx):
//
//   import { getFunctions, httpsCallable } from 'firebase/functions';
//   const generateCode = httpsCallable(getFunctions(), 'createTelegramLinkCode');
//   const { data } = await generateCode();
//   // data.code -> show to user: "Send /link ${data.code} to @YourBotName"
//   // data.expiresInMinutes -> 10

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
const CODE_LENGTH = 6;
const EXPIRY_MINUTES = 10;

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

const createTelegramLinkCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const userId = context.auth.uid;

  // Clean up any previous unused codes for this user to avoid clutter.
  const existing = await db.collection('telegramLinkCodes').where('userId', '==', userId).get();
  const batch = db.batch();
  existing.docs.forEach((d) => batch.delete(d.ref));

  let code = generateCode();
  const codeRef = db.collection('telegramLinkCodes').doc(code);
  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60_000);

  batch.set(codeRef, {
    userId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
  });
  await batch.commit();

  return { code, expiresInMinutes: EXPIRY_MINUTES };
});

module.exports = { createTelegramLinkCode };
