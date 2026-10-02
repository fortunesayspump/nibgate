import { Router } from 'express';
import { handleRpc, serverCard } from './server.js';

export const mcp = Router();

mcp.get('/', (_req, res) => {
  res.json(serverCard());
});

mcp.post('/', async (req, res) => {
  const out = await handleRpc(req);
  res.status(out.status).json(out.body);
});
