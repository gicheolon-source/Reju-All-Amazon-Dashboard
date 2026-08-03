import { weeksMeta } from '../lib/query.mjs';

export default async function handler(req, res) {
  try {
    const out = await weeksMeta();
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: String(e.message ?? e) });
  }
}
