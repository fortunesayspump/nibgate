// Undici requires every response body to be consumed or cancelled. In error
// branches we do not need the body and must not wait for GC to free the socket.
export async function discardResponse(response) {
  try {
    await response?.body?.cancel();
  } catch {
    // An already-aborted/closed body must not replace the original HTTP result.
  }
}
