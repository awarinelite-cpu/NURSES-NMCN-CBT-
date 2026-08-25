// functions/src/telegramBot.js
//
// Telegram bot — lets NMCN CBT students practice questions and sit mock/
// entrance exams straight from Telegram, no app visit required.
//
// FREE / PAID MODEL
//   Every Telegram user gets 10 free questions total (lifetime, across every
//   exam mode combined). After that they must redeem an access code
//   (generated the same way as in-app codes, via AccessCodesManager) with
//   /redeem to unlock unlimited access. This mirrors the existing
//   `accessCodes` collection/flow already used by the web app, so codes an
//   admin already knows how to generate work here unchanged.
//
// DATA MODEL (new collections, only used by the bot)
//   telegramUsers/{chatId}   — { chatId, firstName, username, freeQuestionsUsed,
//                                premium, plan, accessCode, awaiting, createdAt,
//                                lastActiveAt }
//   telegramSessions/{chatId} — the in-progress quiz (mode, meta, embedded
//                                question list, index, score, answers, listMap)
//                                Cloud Functions are stateless between
//                                invocations, so all "conversation state"
//                                has to live in Firestore, not memory.
//
// EXISTING COLLECTIONS READ (unchanged, same shape the web app writes)
//   questions              — { question, options[4], correctIndex, explanation,
//                              category, course, topic, mockExamId, active }
//   entranceExamQuestions  — { questionText, options:{A,B,C,D}, correctAnswer,
//                              explanation, subject, active }
//   entranceExamSubjects   — { name, order }
//   mockExams              — { title, category, active }
//   accessCodes            — { code, plan, used, usedBy, boundDeviceId }
//
// EXISTING COLLECTION WRITTEN (so bot attempts show up in admin analytics
// exactly like app attempts do)
//   examSessions — userId is set to `telegram:<chatId>` so it's easy to spot.
//
// SETUP (one-time, after this deploys):
//   1. Create a bot with @BotFather on Telegram, copy the token it gives you.
//   2. Store it in Secret Manager (same pattern as PAYSTACK_SECRET_KEY):
//        cd functions
//        firebase functions:secrets:set TELEGRAM_BOT_TOKEN
//      (paste the token when prompted — never commit it to git)
//   3. After this code deploys (push to main → GitHub Actions deploys
//      functions automatically), register the webhook once:
//        curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://us-central1-elitecarehub-a80da.cloudfunctions.net/telegramWebhook"
//   4. Test by messaging your bot /start on Telegram.
//
// DEPLOY:
//   cd functions
//   npm install
//   firebase deploy --only functions:telegramWebhook

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const { Telegraf, Markup } = require('telegraf');
const { defineSecret } = require('firebase-functions/params');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');

const FREE_QUESTION_LIMIT = 10;

// ── Specialty categories & courses (kept in sync with src/data/categories.js
//    in the web app — trimmed to just what the bot menus need) ─────────────
const CATEGORIES = [
  { id: 'general_nursing',      label: '🏥 General Nursing (RN)' },
  { id: 'midwifery',             label: '👶 Midwifery' },
  { id: 'mental_health',         label: '🧠 Mental Health / Psychiatric' },
  { id: 'public_health',         label: '🌍 Public Health' },
  { id: 'perioperative',         label: '🔪 Peri-operative (Theatre)' },
  { id: 'orthopaedic',           label: '🦴 Orthopaedic' },
  { id: 'paediatric',            label: '🧸 Paediatric' },
  { id: 'critical_care',         label: '🏥 Critical Care' },
  { id: 'accident_emergency',    label: '🚨 Accident & Emergency' },
  { id: 'anaesthetist',          label: '💉 Anaesthetics' },
  { id: 'ophthalmic',            label: '👁️ Ophthalmic' },
  { id: 'ent',                   label: '👂 ENT' },
  { id: 'nephrology',            label: '🫘 Nephrology' },
  { id: 'oncology',              label: '🎗️ Oncology' },
  { id: 'cardiothoracic',        label: '❤️ Cardiothoracic' },
  { id: 'burns_plastic',         label: '🔥 Burns & Plastics' },
  { id: 'occupational_health',   label: '⚕️ Occupational Health' },
  { id: 'community_nursing',     label: '🏘️ Community Nursing' },
];

const COURSES_BY_CATEGORY = {
  general_nursing: [
    ['anatomy', 'Anatomy'], ['physiology', 'Physiology'],
    ['medical_surgical', 'Medical Surgical Nursing'], ['pharmacology', 'Pharmacology'],
    ['fundamentals', 'Fundamentals of Nursing'], ['nutrition', 'Nutrition & Dietetics'],
    ['microbiology', 'Microbiology & Parasitology'], ['nursing_ethics', 'Nursing Ethics & Law'],
    ['nursing_research', 'Nursing Research'], ['health_assessment', 'Health Assessment'],
  ],
  midwifery: [
    ['maternal_child', 'Maternal & Child Health'], ['antenatal_care', 'Antenatal Care'],
    ['labour_delivery', 'Labour & Delivery'], ['postnatal_care', 'Postnatal Care'],
    ['neonatal_care', 'Neonatal Care'], ['family_planning', 'Family Planning'],
    ['obstetric_comp', 'Obstetric Complications'],
  ],
  mental_health: [
    ['psychiatric_nursing', 'Psychiatric Nursing'], ['psychopharmacology', 'Psychopharmacology'],
    ['mental_assessment', 'Mental Health Assessment'], ['therapeutic_comm', 'Therapeutic Communication'],
    ['substance_abuse', 'Substance Abuse Nursing'],
  ],
  public_health: [
    ['community_health', 'Community Health Nursing'], ['epidemiology', 'Epidemiology'],
    ['env_health', 'Environmental Health'], ['health_education', 'Health Education & Promotion'],
  ],
  paediatric: [
    ['paediatric_nursing', 'Paediatric Nursing'], ['child_dev', 'Child Growth & Development'],
    ['paed_pharmacology', 'Paediatric Pharmacology'],
  ],
  critical_care: [
    ['critical_care_nsg', 'Critical Care Nursing'], ['mechanical_vent', 'Mechanical Ventilation'],
    ['haemodynamics', 'Haemodynamic Monitoring'],
  ],
  accident_emergency: [
    ['emergency_nursing', 'Emergency Nursing'], ['trauma_nursing', 'Trauma Nursing'],
    ['triage', 'Triage Principles'],
  ],
  perioperative: [
    ['periop_nursing', 'Peri-operative Nursing'], ['scrub_techniques', 'Scrub & Circulating Techniques'],
    ['anaesthesia_assist', 'Anaesthesia Assistance'],
  ],
  orthopaedic: [
    ['ortho_nursing', 'Orthopaedic Nursing'], ['fracture_mgmt', 'Fracture Management'],
    ['rehabilitation', 'Rehabilitation Nursing'],
  ],
  anaesthetist: [
    ['anaesthetics_nursing', 'Anaesthetics Nursing'], ['anaesthetic_agents', 'Anaesthetic Agents'],
    ['airway_mgmt', 'Airway Management'],
  ],
  ophthalmic: [
    ['ophthalmic_nursing', 'Ophthalmic Nursing'], ['eye_pharmacology', 'Ocular Pharmacology'],
  ],
  ent: [
    ['ent_nursing', 'ENT Nursing'], ['ent_procedures', 'ENT Surgical Procedures'],
  ],
  nephrology: [
    ['renal_nursing', 'Renal Nursing'], ['dialysis', 'Dialysis Nursing'],
  ],
  oncology: [
    ['oncology_nursing', 'Oncology Nursing'], ['chemotherapy', 'Chemotherapy Administration'],
    ['palliative_care', 'Palliative & End-of-Life Care'],
  ],
  cardiothoracic: [
    ['cardio_nursing', 'Cardiothoracic Nursing'], ['cardiac_monitoring', 'Cardiac Monitoring & ECG'],
  ],
  burns_plastic: [
    ['burns_nursing', 'Burns Nursing'], ['wound_care', 'Wound & Plastic Care Nursing'],
  ],
  occupational_health: [
    ['occup_health_nsg', 'Occupational Health Nursing'], ['workplace_safety', 'Workplace Health & Safety'],
  ],
  community_nursing: [
    ['community_nursing_p', 'Community Nursing Practice'], ['home_based_care', 'Home-Based Care'],
  ],
};

const QUESTION_COUNT_OPTIONS = [5, 10, 20];

// ── Small helpers ───────────────────────────────────────────────────────────

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

async function getOrCreateUser(chatId, from) {
  const ref = db.collection('telegramUsers').doc(String(chatId));
  const snap = await ref.get();
  if (snap.exists) {
    await ref.update({ lastActiveAt: FieldValue.serverTimestamp() });
    return { id: ref.id, ...snap.data() };
  }
  const data = {
    chatId: String(chatId),
    firstName: from?.first_name || '',
    username: from?.username || '',
    freeQuestionsUsed: 0,
    premium: false,
    plan: null,
    accessCode: null,
    awaiting: null,
    createdAt: FieldValue.serverTimestamp(),
    lastActiveAt: FieldValue.serverTimestamp(),
  };
  await ref.set(data);
  return { id: ref.id, ...data };
}

function sessionRef(chatId) {
  return db.collection('telegramSessions').doc(String(chatId));
}

// ── Menus ────────────────────────────────────────────────────────────────────

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⚡ Daily Practice', 'mode:daily')],
    [Markup.button.callback('📖 Course Drill', 'mode:course')],
    [Markup.button.callback('🎯 Topic Drill', 'mode:topic')],
    [Markup.button.callback('📝 Mock Exam', 'mode:mock')],
    [Markup.button.callback('🎓 Entrance Exam', 'mode:entrance')],
    [Markup.button.callback('🔑 Redeem Access Code', 'mode:redeem')],
    [Markup.button.callback('📊 My Status', 'mode:status')],
  ]);
}

function categoryKeyboard(prefix) {
  const rows = chunk(CATEGORIES.map(c =>
    Markup.button.callback(c.label, `${prefix}:${c.id}`)
  ), 1);
  rows.push([Markup.button.callback('⬅️ Back', 'menu:main')]);
  return Markup.inlineKeyboard(rows);
}

function countKeyboard(prefix, remaining) {
  const opts = remaining == null
    ? QUESTION_COUNT_OPTIONS
    : QUESTION_COUNT_OPTIONS.filter(n => n <= remaining).length
      ? QUESTION_COUNT_OPTIONS.filter(n => n <= remaining)
      : [remaining];
  const buttons = opts.map(n => Markup.button.callback(String(n), `${prefix}:${n}`));
  return Markup.inlineKeyboard([buttons, [Markup.button.callback('⬅️ Back', 'menu:main')]]);
}

const WELCOME = (name) =>
  `👋 Welcome${name ? ', ' + name : ''}!\n\n` +
  `This is the *NMCN CBT Practice Bot* — take exam-style questions right here, no need to open the app.\n\n` +
  `Every new user gets *${FREE_QUESTION_LIMIT} free questions* to try it out. After that, redeem an access code ` +
  `(the same kind used in the app) with /redeem to unlock unlimited access.\n\n` +
  `Choose a mode to get started 👇`;

const HELP_TEXT =
  `*Commands*\n` +
  `/start — main menu\n` +
  `/redeem CODE — unlock unlimited access with an access code\n` +
  `/status — see your free question balance or plan\n` +
  `/help — this message\n\n` +
  `Just tap a mode from the menu, pick a topic and question count, and answer with the buttons under each question.`;

// ── Question fetching per mode ──────────────────────────────────────────────

async function fetchQuestions({ mode, meta, count }) {
  if (mode === 'entrance') {
    const snap = await db.collection('entranceExamQuestions')
      .where('subject', '==', meta.subject)
      .where('active', '==', true)
      .limit(200)
      .get();
    let pool = snap.docs.map(d => {
      const data = d.data();
      const opts = data.options || {};
      return {
        id: d.id,
        question: data.questionText || '',
        options: ['A', 'B', 'C', 'D'].map(l => opts[l] || ''),
        correctIndex: ['A', 'B', 'C', 'D'].indexOf(data.correctAnswer),
        explanation: data.explanation || '',
      };
    }).filter(q => q.question && q.options.some(Boolean));
    pool = shuffle(pool);
    return pool.slice(0, count);
  }

  let q = db.collection('questions').where('active', '==', true);
  if (mode === 'daily') q = q.where('category', '==', meta.category);
  else if (mode === 'course') q = q.where('course', '==', meta.course);
  else if (mode === 'topic') q = q.where('topic', '==', meta.topic);
  else if (mode === 'mock') q = q.where('mockExamId', '==', meta.mockExamId);

  const snap = await q.limit(200).get();
  let pool = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(x => x.question && Array.isArray(x.options));
  pool = shuffle(pool);
  return pool.slice(0, count);
}

// ── Quiz runtime ─────────────────────────────────────────────────────────────

function renderQuestion(session) {
  const q = session.questions[session.index];
  const n = session.index + 1;
  const total = session.questions.length;
  const text =
    `*Question ${n} of ${total}*\n\n${q.question}`;
  const letters = ['A', 'B', 'C', 'D'];
  const buttons = q.options.map((opt, i) =>
    [Markup.button.callback(`${letters[i]}. ${truncate(opt, 60)}`, `ans:${i}`)]
  ).filter((_, i) => q.options[i]); // skip empty options
  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

async function startQuiz(ctx, chatId, mode, meta, count) {
  const questions = await fetchQuestions({ mode, meta, count });
  if (questions.length === 0) {
    await ctx.editMessageText(
      '😕 No questions found for that selection yet. Please try a different topic, or check back later.',
      mainMenuKeyboard()
    );
    return;
  }
  const session = {
    mode, meta, questions,
    index: 0, score: 0, answers: {},
    startedAt: FieldValue.serverTimestamp(),
  };
  await sessionRef(chatId).set(session);
  const { text, keyboard } = renderQuestion(session);
  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
}

async function finishQuiz(ctx, chatId, session, user, stoppedEarly) {
  const total = session.questions.length;
  const answeredCount = Object.keys(session.answers).length;
  const pct = answeredCount ? Math.round((session.score / answeredCount) * 100) : 0;

  await db.collection('examSessions').add({
    userId: `telegram:${chatId}`,
    examName: 'Telegram Bot Practice',
    category: session.meta.category || '',
    examType: session.mode,
    course: session.meta.course || '',
    topic: session.meta.topic || '',
    mockExamId: session.meta.mockExamId || '',
    correct: session.score,
    totalQuestions: answeredCount,
    scorePercent: pct,
    answers: session.answers,
    questionIds: session.questions.slice(0, answeredCount).map(q => q.id),
    completedAt: FieldValue.serverTimestamp(),
  }).catch(() => {}); // never let analytics logging break the user's flow

  await sessionRef(chatId).delete().catch(() => {});

  const lines = [
    stoppedEarly ? '🔒 *Free limit reached — here’s how far you got:*' : '🏁 *Quiz complete!*',
    '',
    `Score: *${session.score}/${answeredCount}* (${pct}%)`,
  ];
  if (stoppedEarly && !user.premium) {
    lines.push('', `You've used all ${FREE_QUESTION_LIMIT} free questions.`,
      'Redeem an access code with /redeem to keep practicing with unlimited questions.');
  }
  await ctx.editMessageText(lines.join('\n'), { parse_mode: 'Markdown', ...mainMenuKeyboard() });
}

async function handleAnswer(ctx, chatId, chosenIndex) {
  const uref = db.collection('telegramUsers').doc(String(chatId));
  const [uSnap, sSnap] = await Promise.all([uref.get(), sessionRef(chatId).get()]);
  if (!sSnap.exists) {
    await ctx.answerCbQuery('That quiz session expired — start a new one from the menu.');
    return;
  }
  const user = uSnap.data();
  const session = sSnap.data();
  const q = session.questions[session.index];
  const correct = chosenIndex === q.correctIndex;

  session.answers[q.id] = chosenIndex;
  if (correct) session.score += 1;

  if (!user.premium) {
    await uref.update({ freeQuestionsUsed: FieldValue.increment(1) });
    user.freeQuestionsUsed = (user.freeQuestionsUsed || 0) + 1;
  }

  const letters = ['A', 'B', 'C', 'D'];
  const correctText = q.options[q.correctIndex];
  const resultLine = correct
    ? '✅ *Correct!*'
    : `❌ *Not quite.* Correct answer: *${letters[q.correctIndex]}. ${correctText}*`;
  const explanation = q.explanation ? `\n\n💡 ${q.explanation}` : '';

  const reachedLimit = !user.premium && user.freeQuestionsUsed >= FREE_QUESTION_LIMIT;
  const isLastQuestion = session.index + 1 >= session.questions.length;

  await sessionRef(chatId).set(session);

  if (reachedLimit || isLastQuestion) {
    await ctx.editMessageText(`${resultLine}${explanation}`, { parse_mode: 'Markdown' });
    await finishQuiz(ctx, chatId, session, user, reachedLimit && !isLastQuestion);
    return;
  }

  await ctx.editMessageText(`${resultLine}${explanation}`, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('Next ▶️', 'next')]]),
  });
}

async function handleNext(ctx, chatId) {
  const sSnap = await sessionRef(chatId).get();
  if (!sSnap.exists) {
    await ctx.answerCbQuery('That quiz session expired — start a new one from the menu.');
    return;
  }
  const session = sSnap.data();
  session.index += 1;
  await sessionRef(chatId).update({ index: session.index });
  const { text, keyboard } = renderQuestion(session);
  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
}

// ── Bot wiring ───────────────────────────────────────────────────────────────

function buildBot(token) {
  const bot = new Telegraf(token);

  bot.start(async (ctx) => {
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    await ctx.reply(WELCOME(user.firstName), { parse_mode: 'Markdown', ...mainMenuKeyboard() });
  });

  bot.help((ctx) => ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' }));

  bot.command('status', async (ctx) => {
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    const msg = user.premium
      ? `✅ *Premium access* (${user.plan || 'active'}) — unlimited questions.`
      : `🆓 Free tier: *${Math.max(0, FREE_QUESTION_LIMIT - (user.freeQuestionsUsed || 0))}/${FREE_QUESTION_LIMIT}* questions remaining.\nRedeem a code with /redeem to unlock unlimited access.`;
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.command('redeem', async (ctx) => {
    const code = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!code) {
      await ctx.reply('Send it like this: `/redeem YOUR-CODE`', { parse_mode: 'Markdown' });
      return;
    }
    await redeemCode(ctx, ctx.chat.id, code);
  });

  bot.action('menu:main', async (ctx) => {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    await ctx.editMessageText(WELCOME(user.firstName), { parse_mode: 'Markdown', ...mainMenuKeyboard() });
  });

  bot.action('mode:status', async (ctx) => {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    const msg = user.premium
      ? `✅ *Premium access* (${user.plan || 'active'}) — unlimited questions.`
      : `🆓 Free tier: *${Math.max(0, FREE_QUESTION_LIMIT - (user.freeQuestionsUsed || 0))}/${FREE_QUESTION_LIMIT}* questions remaining.`;
    await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...mainMenuKeyboard() });
  });

  bot.action('mode:redeem', async (ctx) => {
    await ctx.answerCbQuery();
    await db.collection('telegramUsers').doc(String(ctx.chat.id)).set(
      { awaiting: 'code' }, { merge: true }
    );
    await ctx.editMessageText(
      '🔑 Send your access code as a message now (or type /start to cancel).'
    );
  });

  // ── Daily practice: category → count → quiz ───────────────────────────────
  bot.action('mode:daily', async (ctx) => {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    if (freeExhausted(user)) return sendUpgradePrompt(ctx);
    await ctx.editMessageText('Choose a specialty:', categoryKeyboard('cat'));
  });
  bot.action(/^cat:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const category = ctx.match[1];
    await sessionRef(ctx.chat.id).set({ pendingMode: 'daily', pendingMeta: { category } }, { merge: true });
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    const remaining = user.premium ? null : Math.max(0, FREE_QUESTION_LIMIT - (user.freeQuestionsUsed || 0));
    await ctx.editMessageText('How many questions?', countKeyboard('cnt', remaining));
  });

  // ── Course drill: category → course → count → quiz ─────────────────────────
  bot.action('mode:course', async (ctx) => {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    if (freeExhausted(user)) return sendUpgradePrompt(ctx);
    await ctx.editMessageText('Choose a specialty:', categoryKeyboard('crscat'));
  });
  bot.action(/^crscat:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const category = ctx.match[1];
    const courses = COURSES_BY_CATEGORY[category] || [];
    if (!courses.length) {
      await ctx.editMessageText('No courses set up for that specialty yet.', categoryKeyboard('crscat'));
      return;
    }
    const rows = courses.map(([id, label]) => [Markup.button.callback(label, `crs:${id}`)]);
    rows.push([Markup.button.callback('⬅️ Back', 'mode:course')]);
    await ctx.editMessageText('Choose a course:', Markup.inlineKeyboard(rows));
  });
  bot.action(/^crs:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const course = ctx.match[1];
    await sessionRef(ctx.chat.id).set({ pendingMode: 'course', pendingMeta: { course } }, { merge: true });
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    const remaining = user.premium ? null : Math.max(0, FREE_QUESTION_LIMIT - (user.freeQuestionsUsed || 0));
    await ctx.editMessageText('How many questions?', countKeyboard('cnt', remaining));
  });

  // ── Topic drill: type a topic name → count → quiz ───────────────────────────
  bot.action('mode:topic', async (ctx) => {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    if (freeExhausted(user)) return sendUpgradePrompt(ctx);
    await db.collection('telegramUsers').doc(String(ctx.chat.id)).set({ awaiting: 'topic' }, { merge: true });
    await ctx.editMessageText('Type the topic name exactly as it appears in the app (e.g. "Diabetes Mellitus"):');
  });

  // ── Mock exam: list active mock exams → count → quiz ────────────────────────
  bot.action('mode:mock', async (ctx) => {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    if (freeExhausted(user)) return sendUpgradePrompt(ctx);
    const snap = await db.collection('mockExams').where('active', '==', true).limit(30).get();
    if (snap.empty) {
      await ctx.editMessageText('No mock exams are published yet.', mainMenuKeyboard());
      return;
    }
    const listMap = {};
    const rows = [];
    snap.docs.forEach((d, i) => {
      const key = `m${i}`;
      listMap[key] = { id: d.id, title: d.data().title || 'Mock Exam' };
      rows.push([Markup.button.callback(truncate(d.data().title || 'Mock Exam', 50), `mock:${key}`)]);
    });
    rows.push([Markup.button.callback('⬅️ Back', 'menu:main')]);
    await sessionRef(ctx.chat.id).set({ listMap }, { merge: true });
    await ctx.editMessageText('Choose a mock exam:', Markup.inlineKeyboard(rows));
  });
  bot.action(/^mock:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const key = ctx.match[1];
    const sSnap = await sessionRef(ctx.chat.id).get();
    const entry = sSnap.exists && sSnap.data().listMap ? sSnap.data().listMap[key] : null;
    if (!entry) {
      await ctx.editMessageText('That selection expired — please pick again.', mainMenuKeyboard());
      return;
    }
    await sessionRef(ctx.chat.id).set(
      { pendingMode: 'mock', pendingMeta: { mockExamId: entry.id } }, { merge: true }
    );
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    const remaining = user.premium ? null : Math.max(0, FREE_QUESTION_LIMIT - (user.freeQuestionsUsed || 0));
    await ctx.editMessageText('How many questions?', countKeyboard('cnt', remaining));
  });

  // ── Entrance exam: list subjects → count → quiz ─────────────────────────────
  bot.action('mode:entrance', async (ctx) => {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    if (freeExhausted(user)) return sendUpgradePrompt(ctx);
    const snap = await db.collection('entranceExamSubjects').orderBy('order', 'asc').limit(30).get();
    if (snap.empty) {
      await ctx.editMessageText('No entrance exam subjects are set up yet.', mainMenuKeyboard());
      return;
    }
    const listMap = {};
    const rows = [];
    snap.docs.forEach((d, i) => {
      const key = `s${i}`;
      const name = d.data().name || 'Subject';
      listMap[key] = name;
      rows.push([Markup.button.callback(truncate(name, 50), `ent:${key}`)]);
    });
    rows.push([Markup.button.callback('⬅️ Back', 'menu:main')]);
    await sessionRef(ctx.chat.id).set({ listMap }, { merge: true });
    await ctx.editMessageText('Choose a subject:', Markup.inlineKeyboard(rows));
  });
  bot.action(/^ent:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const key = ctx.match[1];
    const sSnap = await sessionRef(ctx.chat.id).get();
    const subject = sSnap.exists && sSnap.data().listMap ? sSnap.data().listMap[key] : null;
    if (!subject) {
      await ctx.editMessageText('That selection expired — please pick again.', mainMenuKeyboard());
      return;
    }
    await sessionRef(ctx.chat.id).set(
      { pendingMode: 'entrance', pendingMeta: { subject } }, { merge: true }
    );
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    const remaining = user.premium ? null : Math.max(0, FREE_QUESTION_LIMIT - (user.freeQuestionsUsed || 0));
    await ctx.editMessageText('How many questions?', countKeyboard('cnt', remaining));
  });

  // ── Shared: count selected → start quiz ─────────────────────────────────────
  bot.action(/^cnt:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const count = parseInt(ctx.match[1], 10);
    const sSnap = await sessionRef(ctx.chat.id).get();
    const pending = sSnap.exists ? sSnap.data() : null;
    if (!pending?.pendingMode) {
      await ctx.editMessageText('Please pick a mode again from the menu.', mainMenuKeyboard());
      return;
    }
    const user = await getOrCreateUser(ctx.chat.id, ctx.from);
    const remaining = user.premium ? count : Math.max(0, FREE_QUESTION_LIMIT - (user.freeQuestionsUsed || 0));
    const finalCount = Math.min(count, remaining || count);
    await startQuiz(ctx, ctx.chat.id, pending.pendingMode, pending.pendingMeta, finalCount);
  });

  bot.action(/^ans:(\d)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await handleAnswer(ctx, ctx.chat.id, parseInt(ctx.match[1], 10));
  });

  bot.action('next', async (ctx) => {
    await ctx.answerCbQuery();
    await handleNext(ctx, ctx.chat.id);
  });

  // ── Free text: topic name entry or access code redemption ──────────────────
  bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const uref = db.collection('telegramUsers').doc(String(chatId));
    const uSnap = await uref.get();
    const awaiting = uSnap.exists ? uSnap.data().awaiting : null;

    if (awaiting === 'code') {
      await uref.set({ awaiting: null }, { merge: true });
      await redeemCode(ctx, chatId, ctx.message.text.trim());
      return;
    }
    if (awaiting === 'topic') {
      await uref.set({ awaiting: null }, { merge: true });
      const topic = ctx.message.text.trim();
      await sessionRef(chatId).set({ pendingMode: 'topic', pendingMeta: { topic } }, { merge: true });
      const user = await getOrCreateUser(chatId, ctx.from);
      const remaining = user.premium ? null : Math.max(0, FREE_QUESTION_LIMIT - (user.freeQuestionsUsed || 0));
      await ctx.reply('How many questions?', countKeyboard('cnt', remaining));
      return;
    }
    await ctx.reply('Use /start to see the menu.');
  });

  return bot;
}

function freeExhausted(user) {
  return !user.premium && (user.freeQuestionsUsed || 0) >= FREE_QUESTION_LIMIT;
}

async function sendUpgradePrompt(ctx) {
  await ctx.editMessageText(
    `🔒 You've used all ${FREE_QUESTION_LIMIT} free questions.\n\n` +
    `Redeem an access code with /redeem to unlock unlimited practice across every mode.`,
    mainMenuKeyboard()
  );
}

async function redeemCode(ctx, chatId, code) {
  if (!code) {
    await ctx.reply('Please send a valid access code.');
    return;
  }
  const snap = await db.collection('accessCodes').where('code', '==', code).limit(1).get();
  if (snap.empty) {
    await ctx.reply('❌ That code was not recognized. Double-check it and try again, or contact support.');
    return;
  }
  const codeDoc = snap.docs[0];
  const data = codeDoc.data();
  if (data.used) {
    await ctx.reply('❌ That code has already been used.');
    return;
  }
  await codeDoc.ref.update({
    used: true,
    usedBy: `telegram:${chatId}`,
    usedByName: ctx.from?.first_name || ctx.from?.username || '',
    boundDeviceId: `telegram:${chatId}`,
  });
  await db.collection('telegramUsers').doc(String(chatId)).set({
    premium: true,
    plan: data.plan || 'premium',
    accessCode: code,
    premiumSince: FieldValue.serverTimestamp(),
  }, { merge: true });
  await ctx.reply(
    `✅ Code accepted! You now have unlimited access${data.plan ? ` (${data.plan})` : ''}.\n\nUse /start to keep practicing.`
  );
}

// ── Webhook entry point ──────────────────────────────────────────────────────

let cachedBot = null;

exports.telegramWebhook = functions
  .runWith({ secrets: [TELEGRAM_BOT_TOKEN] })
  .https.onRequest(async (req, res) => {
    try {
      if (!cachedBot) cachedBot = buildBot(TELEGRAM_BOT_TOKEN.value());
      await cachedBot.handleUpdate(req.body, res);
      if (!res.headersSent) res.status(200).send('ok');
    } catch (err) {
      console.error('telegramWebhook error:', err);
      if (!res.headersSent) res.status(200).send('ok'); // ack to Telegram regardless, avoid retry storms
    }
  });
