/** A 401 is an authentication failure, not a research connectivity failure. */
export function isResearchSignInRequired(error: unknown): boolean {
  const value = error as { status?: number; code?: string } | null;
  return value?.status === 401 || value?.code === 'unauthenticated';
}

type Submission<T> = {
  checkSession: () => Promise<unknown>;
  authenticate: () => Promise<boolean>;
  submit: () => Promise<T>;
  onSubmitting: () => void;
  onSuccess: (value: T) => void;
  onAuthRequired: () => void;
  onError: (error: unknown) => void;
};

/** One user intent, one submission. Authentication is retried only before any
 * mutation. Editing or leaving invalidates continuation, never replays a POST. */
export function createResearchSubmissionController() {
  let revision = 0;
  let running = false;
  return {
    invalidate() { revision += 1; },
    get running() { return running; },
    async run<T>(flow: Submission<T>) {
      if (running) return;
      running = true;
      const intent = revision;
      const current = () => revision === intent;
      try {
        let needsAuth = false;
        try { await flow.checkSession(); }
        catch (error) {
          if (!isResearchSignInRequired(error)) throw error;
          needsAuth = true;
        }
        if (!current()) return;
        if (needsAuth) {
          flow.onAuthRequired();
          if (!await flow.authenticate() || !current()) return;
          // Verify the actual research session, not just a connected wallet.
          // A second 401 is surfaced, never opens/signs in a loop.
          await flow.checkSession();
        }
        if (!current()) return;
        flow.onSubmitting();
        const result = await flow.submit();
        if (current()) flow.onSuccess(result);
      } catch (error) {
        if (current()) flow.onError(error);
      } finally { running = false; }
    },
  };
}
