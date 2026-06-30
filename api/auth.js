const SCHUL_CODES = {
  hengstbach: { pin: process.env.PIN_HENGSTBACH, admin: process.env.ADMIN_HENGSTBACH },
  goethe:     { pin: process.env.PIN_GOETHE,     admin: process.env.ADMIN_GOETHE },
  schiller:   { pin: process.env.PIN_SCHILLER,   admin: process.env.ADMIN_SCHILLER },
  vierte:     { pin: process.env.PIN_VIERTE,     admin: process.env.ADMIN_VIERTE }
};

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Body robust einlesen, falls Vercel es nicht automatisch geparst hat
  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch (e) {
      return res.status(400).json({ ok: false, debug: 'body_parse_failed' });
    }
  }

  const { pin, type, schule } = body || {};

  if (!schule) return res.json({ ok: false, debug: 'keine_schule_empfangen' });
  if (!SCHUL_CODES[schule]) return res.json({ ok: false, debug: 'unbekannte_schule:' + schule });

  const eintrag = SCHUL_CODES[schule];
  const correct = type === 'admin' ? eintrag.admin : eintrag.pin;

  if (!correct) return res.json({ ok: false, debug: 'env_variable_fehlt_fuer:' + schule + '_' + type });
  if (!pin) return res.json({ ok: false, debug: 'kein_pin_eingegeben' });

  const ok = String(pin).trim() === String(correct).trim();
  return res.json({ ok: ok });
};
