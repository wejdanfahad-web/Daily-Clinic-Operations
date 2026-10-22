// Scheduled 12:45 Riyadh (netlify.toml): tell the CIC if nobody is on Vitals for the PM session.
const { checkVitals } = require('./lib/vitals-check');
exports.handler = async () => checkVitals('PM');
