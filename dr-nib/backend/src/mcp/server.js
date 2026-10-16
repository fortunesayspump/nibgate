// MCP server — Dr. Nib over Model Context Protocol.
//
// Lets other agents commission and follow research runs: the same tools, the
// same ownership rule, the same money functions as the HTTP routes. Transport
// is JSON-RPC over POST (initialize, tools/list, tools/call, ping); a plain
// GET returns the server card for discovery.
//
// Authentication is a service key (DRNIB_SERVICE_KEY) presented as a Bearer
// token. The key authenticates the *calling agent*; every tool additionally
// names the owner wallet, which must own the run. When no key is configured
// the server stays open for local development and says so on every call —
// never silently.
import { researchAvailability } from '../readiness.js';
import { TOOLS } from './tools.js';
import { timingSafeEqual } from 'node:crypto';

export const MCP_SERVER_NAME = 'dr-nib';
export const MCP_SERVER_VERSION = '0.2.7';
export const MCP_PROTOCOL_VERSION = '2025-06-18';

let warnedOpen = false;

function toolInputSchema(tool) {
  const properties=Object.fromEntries(Object.entries(tool.input || {}).map(([name,value])=>[name,{
    type:Array.isArray(value)?'array':typeof value==='number'?'number':typeof value==='boolean'?'boolean':typeof value==='object'?'object':'string',
    ...(Array.isArray(value)?{items:{type:typeof value[0]==='string'?'string':'object'}}:{}),
    ...(name==='ownerWallet'?{pattern:'^0x[a-fA-F0-9]{40}$',description:'Wallet owning the research project.'}:{}),
  }]));
  const required=['ownerWallet','runId'].filter(name=>name in properties);
  const byTool={create_run:['topic'],configure_run:['budgetCap'],read_supplied_source:['sourceId'],raise_budget:['amount'],answer_questions:['answers'],answer_question:['seq','answer'],reprompt_run:['prompt']};
  required.push(...(byTool[tool.name] || []).filter(name=>name in properties));
  return {type:'object',properties,required,...(tool.name==='attach_source'?{anyOf:[{required:['name','contentBase64']},{required:['url']}]}:{})};
}

export function mcpAuth(req) {
  const expected = process.env.DRNIB_SERVICE_KEY || '';
  if (!expected) {
    if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_ID) return { ok: false, error: 'service authentication is not configured' };
    if (!warnedOpen) {
      warnedOpen = true;
      console.warn('[dr-nib] MCP running without DRNIB_SERVICE_KEY — local development only.');
    }
    return { ok: true };
  }
  const authorization = String(req.headers?.authorization || '');
  const presented = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1] || '';
  const given = Buffer.from(presented);
  const secret = Buffer.from(expected);
  if (given.length === secret.length && timingSafeEqual(given, secret)) return { ok: true };
  return { ok: false, error: 'missing or invalid service key' };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } };
}

function rpcOk(id, result) {
  return { jsonrpc: '2.0', id: id === undefined ? null : id, result };
}

export function serverCard() {
  return {
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    protocol: 'mcp-jsonrpc-http',
    auth: 'bearer-service-key',
    research: researchAvailability(),
    tools: TOOLS.map((t) => t.name),
  };
}

export async function handleRpc(req) {
  const auth = mcpAuth(req);
  if (!auth.ok) return { status: 401, body: rpcError(req.body?.id, -32001, auth.error) };
  const { jsonrpc, id, method, params } = req.body || {};
  if (jsonrpc !== '2.0' || typeof method !== 'string') {
    return { status: 400, body: rpcError(id, -32600, 'invalid JSON-RPC request') };
  }
  try {
    if (method === 'initialize' || method === 'ping') {
      return {
        status: 200,
        body: rpcOk(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
          capabilities: { tools: {} },
        }),
      };
    }
    if (method === 'tools/list') {
      return {
        status: 200,
        body: rpcOk(id, {
          tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: toolInputSchema(t) })),
        }),
      };
    }
    if (method === 'tools/call') {
      const name = params?.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return { status: 200, body: rpcOk(id, { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true }) };
      try {
        const output = await tool.run(params?.arguments || {});
        return { status: 200, body: rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(output) }] }) };
      } catch (err) {
        return { status: 200, body: rpcOk(id, { content: [{ type: 'text', text: err?.message || String(err) }], isError: true }) };
      }
    }
    return { status: 404, body: rpcError(id, -32601, `unknown method: ${method}`) };
  } catch (err) {
    return { status: 500, body: rpcError(id, -32603, err?.message || 'internal error') };
  }
}
