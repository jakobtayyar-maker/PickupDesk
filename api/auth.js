module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pin, type } = req.body || {};
  const betreuerPin = process.env.BETREUER_PIN;
  const adminPin = process.env.ADMIN_PIN;

  if (type === 'betreuer') {
    return res.json({ ok: pin === betreuerPin });
  } else if (type === 'admin') {
    return res.json({ ok: pin === adminPin });
  }
  return res.status(400).json({ error: 'Type required' });
};
