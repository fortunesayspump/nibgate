import { readFile as readRawFile } from 'node:fs/promises';
import { readFileSync as readRawFileSync } from 'node:fs';
// Source harnesses must behave identically with Git's Windows CRLF checkout.
const normalize = value => typeof value === 'string' ? value.replaceAll('\r\n', '\n') : value;
export const readFile = async (...args) => normalize(await readRawFile(...args));
export const readFileSync = (...args) => normalize(readRawFileSync(...args));
