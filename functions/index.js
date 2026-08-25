// functions/index.js
const { paystackWebhook } = require('./src/paystackWebhook');
exports.paystackWebhook = paystackWebhook;

const { rotateDailyMockExam, manuallyRotateDailyMockExam } = require('./src/dailyMockExamRotation');
exports.rotateDailyMockExam = rotateDailyMockExam;
exports.manuallyRotateDailyMockExam = manuallyRotateDailyMockExam;

const { rotateEntranceDailyMock, manuallyRotateEntranceDailyMock } = require('./src/entranceDailyMockRotation');
exports.rotateEntranceDailyMock = rotateEntranceDailyMock;
exports.manuallyRotateEntranceDailyMock = manuallyRotateEntranceDailyMock;

const { mintAgoraToken } = require('./src/agoraToken');
exports.mintAgoraToken = mintAgoraToken;

const { telegramWebhook } = require('./src/telegramBot');
exports.telegramWebhook = telegramWebhook;

const { createTelegramLinkCode } = require('./src/telegramLinkCode');
exports.createTelegramLinkCode = createTelegramLinkCode;
