import { snapshot, cleanWeeks } from '../lib/query.mjs';

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    const weeks = cleanWeeks(url.searchParams.get('weeks') ?? url.searchParams.get('week') ?? '');
    if (!weeks.length) return res.status(400).json({ error: 'weeks=YYYY-MM-DD[,…] 가 필요합니다' });

    const out = await snapshot(weeks);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: String(e.message ?? e) });
  }
}
