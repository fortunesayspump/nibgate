import { loadAppState } from '../../backend/src/server/app-state.js';

export default function handler(_req, res) {
  try {
    res.status(200).json(loadAppState());
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load app state',
      detail: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
