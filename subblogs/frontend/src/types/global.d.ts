interface Window {
  ethereum?: {
    request: (args: { method: string; params?: unknown[] }) => Promise<any>;
    on: (event: string, cb: (...args: any[]) => void) => void;
    removeListener: (event: string, cb: (...args: any[]) => void) => void;
  };
}
