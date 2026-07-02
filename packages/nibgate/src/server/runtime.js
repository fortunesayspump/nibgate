import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const requireFromPackage = createRequire(import.meta.url);
const requireFromCwd = createRequire(`${process.cwd()}/package.json`);
const packageSourceDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceNodeModulesDir = path.resolve(packageSourceDir, '../../../node_modules/.pnpm/node_modules');
const nativeImport = new Function('specifier', 'return import(specifier)');

export async function runtimeImportPackage(specifier) {
  try {
    return await nativeImport(specifier);
  } catch (_error) {
    try {
      return await nativeImport(requireFromPackage.resolve(specifier));
    } catch (_packageError) {
      try {
        return await nativeImport(requireFromCwd.resolve(specifier));
      } catch (_cwdError) {
        if (specifier === '@circle-fin/x402-batching/client') {
          try {
            return await nativeImport(`${process.cwd()}/node_modules/.pnpm/node_modules/@circle-fin/x402-batching/dist/client/index.mjs`);
          } catch {
            return nativeImport(pathToFileURL(path.join(workspaceNodeModulesDir, '@circle-fin/x402-batching/dist/client/index.mjs')).href);
          }
        }
        if (specifier === '@circle-fin/x402-batching/server') {
          try {
            return await nativeImport(`${process.cwd()}/node_modules/.pnpm/node_modules/@circle-fin/x402-batching/dist/server/index.mjs`);
          } catch {
            return nativeImport(pathToFileURL(path.join(workspaceNodeModulesDir, '@circle-fin/x402-batching/dist/server/index.mjs')).href);
          }
        }
        return nativeImport(`${process.cwd()}/node_modules/.pnpm/node_modules/${specifier}`);
      }
    }
  }
}
