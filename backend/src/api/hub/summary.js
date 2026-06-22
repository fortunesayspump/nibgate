import { getHubSummary } from '../../server/hub-handlers.js';

export default async function handler(_req, res) {
  const result = await getHubSummary();
  return res.status(result.status).json(result.body);
}
