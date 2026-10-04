// Minimal runtime ABIs for the escrow core + splitter, extracted from the
// forge artifacts (contracts/out) and committed here because Railway builds
// never run forge — reading artifacts at runtime would break in prod.
// Regenerate: node -e "<see abi.json header>" after any contract change.
import abi from './abi.json' with { type: 'json' };

export const CORE_ABI = abi.core;
export const SPLITTER_ABI = abi.splitter;
