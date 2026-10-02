// Minimal IP parsing + CIDR containment, dependency-free.
//
// Only what the SSRF guard needs: parse an address, test membership in a CIDR
// range. IPv4 strict dotted-quad; IPv6 with :: compression and embedded IPv4
// (::ffff:1.2.3.4). Anything unparseable throws — an address we cannot classify
// is treated as hostile, never as public.

function parseIPv4(s) {
  const parts = String(s).split('.');
  if (parts.length !== 4) throw new Error('bad-ipv4');
  let n = 0n;
  for (const p of parts) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(p)) throw new Error('bad-ipv4');
    const v = Number(p);
    if (v > 255) throw new Error('bad-ipv4');
    n = (n << 8n) + BigInt(v);
  }
  return { bits: 32, value: n };
}

function expandIPv6(s) {
  const halves = String(s).split('::');
  if (halves.length > 2) throw new Error('bad-ipv6');
  const parseGroup = (g) => {
    if (/^[0-9a-fA-F:.]+$/.test(g) === false) throw new Error('bad-ipv6');
    if (g.includes('.')) {
      // Embedded IPv4 occupies the last two groups.
      const last = g.lastIndexOf(':');
      const v4 = parseIPv4(last === -1 ? g : g.slice(last + 1));
      const head = last === -1 ? [] : g.slice(0, last).split(':');
      return [...head, ((v4.value >> 16n) & 0xffffn).toString(16), (v4.value & 0xffffn).toString(16)];
    }
    return g.split(':');
  };
  let groups;
  if (halves.length === 1) {
    groups = parseGroup(halves[0]);
    if (groups.length !== 8) throw new Error('bad-ipv6');
  } else {
    const [left, right] = halves;
    const l = left ? parseGroup(left) : [];
    const r = right ? parseGroup(right) : [];
    const fill = 8 - l.length - r.length;
    if (fill < 1) throw new Error('bad-ipv6');
    groups = [...l, ...Array(fill).fill('0'), ...r];
  }
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) throw new Error('bad-ipv6');
    n = (n << 16n) + BigInt(`0x${g}`);
  }
  return { bits: 128, value: n };
}

export function parse(s) {
  const t = String(s).trim().replace(/^\[(.*)\]$/, '$1');
  if (t.includes(':')) return { ...expandIPv6(t), family: 6 };
  return { ...parseIPv4(t), family: 4 };
}

function parseCidr(cidr) {
  const [addr, len] = String(cidr).split('/');
  const a = parse(addr);
  const bits = Number(len);
  if (!Number.isInteger(bits) || bits < 0 || bits > a.bits) throw new Error('bad-cidr');
  const mask = bits === 0 ? 0n : (((1n << BigInt(bits)) - 1n) << BigInt(a.bits - bits));
  return { ...a, network: a.value & mask, mask };
}

export function isIn(ip, cidr) {
  const a = typeof ip === 'string' ? parse(ip) : ip;
  const r = parseCidr(cidr);
  if (a.bits !== r.bits) {
    // IPv4-mapped IPv6 compares against the IPv4 space.
    if (a.bits === 128 && r.bits === 32 && (a.value >> 32n) === 0xffffn) {
      return isIn({ bits: 32, value: a.value & 0xffffffffn }, cidr);
    }
    return false;
  }
  return (a.value & r.mask) === r.network;
}

export default { parse, isIn };
