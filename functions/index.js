// functions/index.js
const { paystackWebhook } = require('./src/paystackWebhook');
exports.paystackWebhook = paystackWebhook;

const { rotateDailyMockExam, manuallyRotateDailyMockExam } = require('./src/dailyMockExamRotation');
exports.rotateDailyMockExam = rotateDailyMockExam;
exports.manuallyRotateDailyMockExam = manuallyRotateDailyMockExam;
