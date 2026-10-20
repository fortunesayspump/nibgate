/** Hosting must opt in to a non-loopback listener. Never accept an arbitrary
 * hostname, URL, port override or inherited public bind by accident. */
export function privateFundingListener(env = process.env) {
  const host = env.DRNIB_PRIVATE_FUNDING_HOST ?? '127.0.0.1';
  const rawPort = env.PORT ?? '3105';
  if (!['127.0.0.1', '0.0.0.0', '::1', '::'].includes(host) ||
      !/^[1-9][0-9]{0,4}$/.test(rawPort) || Number(rawPort) > 65535)
    throw Error('PRIVATE_FUNDING_LISTENER_INVALID');
  if ((host === '0.0.0.0' || host === '::') &&
      env.DRNIB_PRIVATE_FUNDING_ONLY !== 'true')
    throw Error('PRIVATE_FUNDING_BOUNDARY_REQUIRED');
  return {host, port: Number(rawPort)};
}
