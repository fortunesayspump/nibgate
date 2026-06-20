import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExploreServer } from './server.js';

const __filename = fileURLToPath(import.meta.url);

export function startExploreServer() {
  const port = Number(process.env.EXPLORE_PORT || process.env.PORT || 3001);
  const app = createExploreServer();

  return app.listen(port, () => {
    console.log(`Nibgate Explore running at http://localhost:${port}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startExploreServer();
}
