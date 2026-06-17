const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const SB = process.env.SUPABASE_URL + '/rest/v1';
  const SK = process.env.SUPABASE_KEY;
  const headers = {
    'apikey': SK,
    'Authorization': 'Bearer ' + SK,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    const query = req.url.split('?')[1] || '';
    const url = SB + '/entries' + (query ? '?' + query : '?select=*&order=zeit.asc');

    if (req.method === 'GET') {
      const r = await fetch(url, { method: 'GET', headers });
      const data = await r.json();
      return res.json(data);
    }
    if (req.method === 'POST') {
      const r = await fetch(SB + '/entries', { method: 'POST', headers, body: JSON.stringify(req.body) });
      const data = await r.json();
      return res.json(data);
    }
    if (req.method === 'PATCH') {
      const r = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(req.body) });
      const data = await r.json();
      return res.json(data);
    }
    if (req.method === 'DELETE') {
      const r = await fetch(url, { method: 'DELETE', headers });
      const data = await r.json();
      return res.json(data);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
