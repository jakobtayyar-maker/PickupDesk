// PickupDesk – sicherer Zugang zur Datenbank
// Der Supabase-Schluessel bleibt hier auf dem Server und taucht NIE im Browser auf.
// Zusaetzlich wird hier erzwungen:
//  - nur erlaubte Tabellen
//  - jede Anfrage ist auf EINE Schule begrenzt (keine Vermischung moeglich)
//  - gefaehrliche Aktionen (Massenloeschung, Kinder verwalten) nur mit Admin-Code
//  - Schulverwaltung nur mit Master-Code

const crypto = require('crypto');

const TABELLEN = ['entries', 'kinder', 'schulen'];

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// Master-Code (SHA-256). Kann per Umgebungsvariable MASTER_HASH ueberschrieben werden.
const MASTER_HASH = process.env.MASTER_HASH ||
  '2eed24e6692baff3bbd6c019992a67bcbd7e73346f7759274e95bd4c47b1c3bd';

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Query-String zusammenbauen und dabei die Schule fest verankern
function baueQuery(params, schule, tabelle) {
  const out = new URLSearchParams();
  for (const [k, v] of params.entries()) {
    if (k === 'schule' || k === 'apikey' || k === 'id_token' || k === 't') continue; // nie vom Client uebernehmen
    out.append(k, v);
  }
  if (tabelle === 'schulen') {
    if (schule) out.append('id', 'eq.' + schule);
  } else {
    out.append('schule', 'eq.' + schule);
  }
  return out.toString();
}

module.exports = async (req, res) => {
  const SB = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!SB || !KEY) return json(res, 500, { error: 'Server ist nicht konfiguriert (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen).' });

  const [pfad, qs] = String(req.url || '').split('?');
  const params = new URLSearchParams(qs || '');

  // ── Login-Pruefung (?t=login) ──────────────────────────────────────────
  // Die Codes verlassen den Server NIE. Die App fragt hier nur "stimmt der Code?".
  if (params.get('t') === 'login') {
    const sid = (params.get('schule') || '').replace(/^eq\./, '').replace(/[^a-z0-9]/g, '');
    const art = params.get('art') === 'admin' ? 'admin' : 'pin';
    const code = req.headers['x-code'] || '';
    if (!sid) return json(res, 400, { error: 'Schule fehlt.' });
    try {
      const r = await fetch(SB + '/rest/v1/schulen?select=pin,admin&id=eq.' + encodeURIComponent(sid), {
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
      });
      const rows = await r.json();
      const soll = Array.isArray(rows) && rows[0] ? rows[0][art] : null;
      if (!soll) return json(res, 200, { ok: false, grund: 'kein Code hinterlegt' });
      return json(res, 200, { ok: sha256(code) === soll });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  // Tabelle aus dem Pfad (/api/db/entries) ODER aus dem Parameter (?t=entries).
  // Der Parameter-Weg funktioniert auf Vercel ohne zusaetzliche Routing-Regeln.
  const teile = pfad.split('/').filter(Boolean);
  const ausPfad = teile[teile.length - 1];
  const tabelle = TABELLEN.includes(ausPfad) ? ausPfad : (params.get('t') || '');
  if (!TABELLEN.includes(tabelle)) return json(res, 400, { error: 'Unbekannte Tabelle.' });

  // Schule sowohl als "hengstbach" wie auch als "eq.hengstbach" akzeptieren
  const schule = (params.get('schule') || '').replace(/^eq\./, '').replace(/[^a-z0-9]/g, '');
  const adminCode = req.headers['x-admin-code'] || '';
  const masterCode = req.headers['x-master-code'] || '';
  const method = req.method;

  const headers = {
    apikey: KEY,
    Authorization: 'Bearer ' + KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };

  const hatFilter = ['id', 'name', 'tag'].some((f) => params.has(f));

  try {
    // ── Schulverwaltung: nur Master ──
    if (tabelle === 'schulen' && method !== 'GET') {
      if (sha256(masterCode) !== MASTER_HASH) return json(res, 403, { error: 'Master-Code erforderlich.' });
    }

    // ── Alle anderen Tabellen brauchen eine Schule ──
    if (tabelle !== 'schulen' && !schule) return json(res, 400, { error: 'Schule fehlt.' });

    // ── Admin-Code pruefen, wo noetig ──
    const brauchtAdmin =
      (tabelle === 'kinder' && method !== 'GET') ||          // Kinder anlegen/loeschen
      (tabelle === 'entries' && method === 'DELETE' && !hatFilter); // Massenloeschung

    if (brauchtAdmin) {
      const r = await fetch(SB + '/rest/v1/schulen?select=admin&id=eq.' + encodeURIComponent(schule), { headers });
      const rows = await r.json();
      const erwartet = Array.isArray(rows) && rows[0] ? rows[0].admin : null;
      if (!erwartet || sha256(adminCode) !== erwartet) {
        return json(res, 403, { error: 'Admin-Code erforderlich oder falsch.' });
      }
    }

    // ── Beim Lesen der Schulliste nie die Code-Hashes mitschicken ──
    // Beim Schreiben auf 'schulen' MUSS die id gefiltert werden, sonst wuerde
    // die Aenderung alle Schulen treffen.
    if (tabelle === 'schulen' && method !== 'GET' && !schule) {
      return json(res, 400, { error: 'Schul-ID fehlt.' });
    }
    let query = baueQuery(params, schule, tabelle);
    if (tabelle === 'schulen' && method === 'GET') {
      query = query.replace(/(^|&)select=[^&]*/, '') + '&select=id,name,city,icon';
      query = query.replace(/^&/, '');
    }

    if ((method === 'DELETE' || method === 'PATCH') && !query) {
      return json(res, 400, { error: 'Aktion ohne Filter abgelehnt.' });
    }
    const url = SB + '/rest/v1/' + tabelle + (query ? '?' + query : '');

    let body;
    if (method === 'POST' || method === 'PATCH') {
      body = await new Promise((resolve) => {
        let d = '';
        req.on('data', (c) => (d += c));
        req.on('end', () => resolve(d));
      });
      if (body && tabelle !== 'schulen') {
        // Schule im Datensatz immer serverseitig setzen
        try {
          const obj = JSON.parse(body);
          if (Array.isArray(obj)) obj.forEach((o) => (o.schule = schule));
          else obj.schule = schule;
          body = JSON.stringify(obj);
        } catch (e) { /* unveraenderter Body */ }
      }
    }

    const r = await fetch(url, { method, headers, body });
    const text = await r.text();
    res.statusCode = r.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(text || '[]');
  } catch (e) {
    json(res, 500, { error: e.message });
  }
};
