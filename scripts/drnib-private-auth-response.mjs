// Local SIWE proxy only. Finish reading before headers are committed so an
// upstream stream error can produce one 503 instead of crashing the server.
export async function writeLocalAuthResponse(res, response, cookies) {
    const body = await response.text();
    res.writeHead(response.status, { 'content-type': 'application/json', 'cache-control': 'no-store',
        ...(cookies.length ? { 'set-cookie': cookies } : {}) });
    res.end(body);
}
