const fetch = require('node-fetch');

const GUELTIGE_SCHULEN = ['hengstbach', 'goethe', 'schiller', 'vierte'];

module.exports = async (req, res) => {
  const SB = process.env.SUPABASE_URL + '/rest/v1';
  const SK = process.env.SUPABASE_KEY;
  const headers = {
    'apikey': SK,
    'Authorization': 'Bearer ' + SK,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // Schule kommt als Query-Parameter ODER aus dem Body - wird IMMER server-seitig geprueft
  const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
  const schuleFromQuery = urlParams.get('schule');
  const schuleFromBody = req.body && req.body.schule;
  const schule = schuleFromQuery || schuleFromBody;

  if (!schule || !GUELTIGE_SCHULEN.includes(schule)) {
    return res.status(400).json({ error: 'Ungueltige oder fehlende Schule' });
  }

  try {
    if (req.method === 'GET') {
      const r = await fetch(SB + '/entries?select=*&order=zeit.asc&schule=eq.' + encodeURIComponent(schule), { method: 'GET', headers });
      const data = await r.json();
      return res.json(data);
    }
    if (req.method === 'POST') {
      const body = { ...req.body, schule }; // Schule wird server-seitig erzwungen, nicht vom Client uebernommen
      const r = await fetch(SB + '/entries', { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await r.json();
      return res.json(data);
    }
    if (req.method === 'PATCH') {
      urlParams.delete('schule');
      const id = urlParams.get('id');
      const url = SB + '/entries?' + id + '&schule=eq.' + encodeURIComponent(schule);
      const r = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(req.body) });
      const data = await r.json();
      return res.json(data);
    }
    if (req.method === 'DELETE') {
      let q = req.url.split('?')[1] || '';
      const url = SB + '/entries?' + q + '&schule=eq.' + encodeURIComponent(schule);
      const r = await fetch(url, { method: 'DELETE', headers });
      const data = await r.json();
      return res.json(data);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
