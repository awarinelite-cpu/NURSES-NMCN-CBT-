// functions/src/telegramBot.js
//
// Firebase Cloud Function — Telegram bot webhook for NURSES-NMCN-CBT.
//
// Commands:
//   /start          — welcome + instructions
//   /link CODE      — pair this Telegram chat to a Firebase account using a
//                      one-time code generated in-app (see telegramLinkCode.js)
//   /unlink         — remove the pairing
//   /status         — show subscription / entrance-exam access status
//   /quiz           — send a random question as a native Telegram quiz poll
//   /help           — list commands
//
// DEPLOY:
//   cd functions
//   npm install
//   firebase functions:secrets:set TELEGRAM_BOT_TOKEN
//   firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET   (any random string you choose)
//   firebase deploy --only functions:telegramWebhook
//
// AFTER DEPLOY — register the webhook with Telegram (run once, replace values):
//   curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
//     -d "url=https://<your-region>-<project-id>.cloudfunctions.net/telegramWebhook" \
//     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { defineSecret } = require('firebase-functions/params');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');
const TELEGRAM_WEBHOOK_SECRET = defineSecret('TELEGRAM_WEBHOOK_SECRET');

// ── Telegram API helper ─────────────────────────────────────────────────────

async function tg(method, token, payload) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error on ${method}:`, data);
  }
  return data;
}

function sendMessage(token, chatId, text, extra = {}) {
  return tg('sendMessage', token, { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatExpiry(ts) {
  if (!ts) return 'N/A';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toISOString().slice(0, 10);
}

/** Pull a pseudo-random batch of questions and pick one.
 *  NOTE: Firestore has no native random query. This samples the first 30
 *  docs ordered by document ID starting from a random point in the ID
 *  keyspace. Good enough for MVP; for true uniform randomness, add a
 *  `randomKey: Math.random()` field to each question doc and query on that. */
async function getRandomQuestion() {
  const randomStart = Math.random().toString(36).slice(2, 10);
  let snap = await db
    .collection('questions')
    .orderBy(admin.firestore.FieldPath.documentId())
    .startAt(randomStart)
    .limit(30)
    .get();

  if (snap.empty) {
    snap = await db.collection('questions').limit(30).get();
  }
  if (snap.empty) return null;

  const docs = snap.docs;
  return docs[Math.floor(Math.random() * docs.length)];
}

// ── Command handlers ─────────────────────────────────────────────────────────

async function handleStart(token, chatId) {
  await sendMessage(
    token,
    chatId,
    `👋 Welcome to the <b>NMCN CBT</b> bot!\n\n` +
      `To link this chat to your account, open the app → Profile → "Link Telegram", ` +
      `then send me:\n<code>/link YOUR_CODE</code>\n\n` +
      `Once linked you can use:\n` +
      `/quiz — get a practice question\n` +
      `/status — check your subscription\n` +
      `/unlink — remove this pairing\n` +
      `/help — show this again`
  );
}

async function handleLink(token, chatId, code) {
  if (!code) {
    await sendMessage(token, chatId, 'Usage: <code>/link YOUR_CODE</code>');
    return;
  }
  const codeRef = db.collection('telegramLinkCodes').doc(code.trim().toUpperCase());
  const codeSnap = await codeRef.get();

  if (!codeSnap.exists) {
    await sendMessage(token, chatId, '❌ That code is invalid or already used. Generate a new one in the app.');
    return;
  }
  const { userId, expiresAt } = codeSnap.data();
  if (expiresAt && expiresAt.toDate() < new Date()) {
    await codeRef.delete();
    await sendMessage(token, chatId, '❌ That code has expired. Generate a new one in the app.');
    return;
  }

  await db.collection('telegramUsers').doc(String(chatId)).set({
    userId,
    linkedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await codeRef.delete();

  await sendMessage(token, chatId, '✅ Linked! Try /status or /quiz.');
}

async function handleUnlink(token, chatId) {
  await db.collection('telegramUsers').doc(String(chatId)).delete();
  await sendMessage(token, chatId, '🔓 Unlinked. Send /link CODE any time to reconnect.');
}

async function getLinkedUserId(chatId) {
  const snap = await db.collection('telegramUsers').doc(String(chatId)).get();
  return snap.exists ? snap.data().userId : null;
}

async function handleStatus(token, chatId) {
  const userId = await getLinkedUserId(chatId);
  if (!userId) {
    await sendMessage(token, chatId, 'Not linked yet. Send <code>/link YOUR_CODE</code> first.');
    return;
  }
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) {
    await sendMessage(token, chatId, '⚠️ Linked account not found. Try /unlink and re-link.');
    return;
  }
  const u = userSnap.data();
  const lines = ['<b>Your access status</b>'];

  if (u.subscribed) {
    lines.push(`✅ NMCN CBT: active until ${formatExpiry(u.subscriptionExpiry)} (${u.accessLevel || 'standard'})`);
  } else {
    lines.push('❌ NMCN CBT: not subscribed');
  }

  if (u.entranceExamPaid) {
    lines.push(`✅ Entrance Exam: active until ${formatExpiry(u.entranceExamExpiry)}`);
  } else {
    lines.push('❌ Entrance Exam: not subscribed');
  }

  await sendMessage(token, chatId, lines.join('\n'));
}

async function handleQuiz(token, chatId) {
  const doc = await getRandomQuestion();
  if (!doc) {
    await sendMessage(token, chatId, 'No questions available right now — check back later.');
    return;
  }
  const q = doc.data();
  const options = Array.isArray(q.options) ? q.options : [];
  const correctIndex = typeof q.correctIndex === 'number' ? q.correctIndex : 0;

  if (options.length < 2 || options.length > 10) {
    await sendMessage(token, chatId, 'That question format isn\'t supported for polls — try /quiz again.');
    return;
  }

  await tg('sendPoll', token, {
    chat_id: chatId,
    question: q.question.slice(0, 300),
    options: options.map((o) => String(o).slice(0, 100)),
    type: 'quiz',
    correct_option_id: correctIndex,
    explanation: (q.explanation || '').slice(0, 200),
    is_anonymous: false,
  });
}

async function handleHelp(token, chatId) {
  await handleStart(token, chatId);
}

// ── Webhook entry point ───────────────────────────────────────────────────────

const telegramWebhook = functions
  .runWith({ secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET] })
  .https.onRequest(async (req, res) => {
    const token = TELEGRAM_BOT_TOKEN.value();
    const expectedSecret = TELEGRAM_WEBHOOK_SECRET.value();

    // Verify the request actually came from Telegram.
    const incomingSecret = req.get('X-Telegram-Bot-Api-Secret-Token');
    if (expectedSecret && incomingSecret !== expectedSecret) {
      res.status(401).send('Unauthorized');
      return;
    }

    const update = req.body;
    const message = update.message;

    // Always ack quickly; Telegram retries on non-2xx / timeout.
    res.status(200).send('OK');

    if (!message || !message.text) return;
    const chatId = message.chat.id;
    const text = message.text.trim();
    const [cmdRaw, ...rest] = text.split(/\s+/);
    const cmd = cmdRaw.toLowerCase().split('@')[0]; // strip @BotName if present

    try {
      switch (cmd) {
        case '/start':
          await handleStart(token, chatId);
          break;
        case '/link':
          await handleLink(token, chatId, rest[0]);
          break;
        case '/unlink':
          await handleUnlink(token, chatId);
          break;
        case '/status':
          await handleStatus(token, chatId);
          break;
        case '/quiz':
          await handleQuiz(token, chatId);
          break;
        case '/help':
          await handleHelp(token, chatId);
          break;
        default:
          await sendMessage(token, chatId, "Sorry, I didn't understand that. Send /help for commands.");
      }
    } catch (err) {
      console.error('telegramWebhook handler error:', err);
      await sendMessage(token, chatId, '⚠️ Something went wrong. Please try again.').catch(() => {});
    }
  });

module.exports = { telegramWebhook };
