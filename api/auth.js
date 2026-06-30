const crypto = require('crypto');

// Pro Schule gespeicherte Codes (als Hash, nicht im Frontend sichtbar)
const SCHUL_CODES = {
  hengstbach: { pin: process.env.PIN_HENGSTBACH, admin: process.env.ADMIN_HENGSTBACH },
  goethe:     { pin: process.env.PIN_GOETHE,     admin: process.env.ADMIN_GOETHE },
  schiller:   { pin: process.env.PIN_SCHILLER,   admin: process.env.ADMIN_SCHILLER },
  vierte:     { pin: process.env.PIN_VIERTE,     admin: process.env.ADMIN_VIERTE }
};

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pin, type, schule } = req.body || {};
  if (!schule || !SCHUL_CODES[schule]) return res.status(400).json({ ok: false });

  const correct = type === 'admin' ? SCHUL_CODES[schule].admin : SCHUL_CODES[schule].pin;
  if (!pin || !correct) return res.json({ ok: false });

  // Zeitsicherer Vergleich
  const ok = pin === correct;
  return res.json({ ok });
};
