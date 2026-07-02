const fetch = require('node-fetch');

const GUELTIGE_SCHULEN = ['hengstbach', 'goethe', 'schiller', 'vierte'];

module.exports = async (req, res) => {
  const SB = process.env.SUPABASE_URL;
  // Beide moegliche Namen probieren
  const SK = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!SK) return res.status(500).json({ error: 'Kein Supabase Key gefunden' });

  const headers = {
    'apikey': SK,
    'Authorization': 'Bearer ' + SK,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
  const schuleFromQuery = urlParams.get('schule');
  const schuleFromBody = req.body && req.body.schule;
  const schule = schuleFromQuery || schuleFromBody;

  if (!schule || !GUELTIGE_SCHULEN.includes(schule)) {
    return res.status(400).json({ error: 'Ungueltige oder fehlende Schule' });
  }

  try {
    if (req.method === 'GET') {
      const r = await fetch(SB + '/rest/v1/entries?select=*&order=zeit.asc&schule=eq.' + encodeURIComponent(schule), { method: 'GET', headers });
      const data = await r.json();
      return res.json(data);
    }
    if (req.method === 'POST') {
      const body = { ...req.body, schule };
      const r = await fetch(SB + '/rest/v1/entries', { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await r.json();
      return res.json(data);
    }
    if (req.method === 'PATCH') {
      const q = req.url.split('?')[1] || '';
      const url = SB + '/rest/v1/entries?' + q + '&schule=eq.' + encodeURIComponent(schule);
      const r = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(req.body) });
      const data = await r.json();
      return res.json(data);
    }
    if (req.method === 'DELETE') {
      const q = req.url.split('?')[1] || '';
      const url = SB + '/rest/v1/entries?' + q + '&schule=eq.' + encodeURIComponent(schule);
      const r = await fetch(url, { method: 'DELETE', headers });
      const data = await r.json();
      return res.json(data);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
