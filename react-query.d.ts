import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query adapter.
 *
 * @remarks
 * TanStack Query funnels every failed query and mutation through
 * `QueryCache.config.onError` and `MutationCache.config.onError`. That is one hook
 * per cache rather than one per observer, which makes this the cheapest possible
 * integration — and it covers retries, since TanStack only calls `onError` after
 * the retry budget is exhausted.
 *
 * Any handler already installed is **chained**, not replaced.
 *
 * @packageDocumentation
 */

/**
 * Attach telemetry to a `QueryClient`.
 *
 * @param queryClient - the client to observe
 * @returns a function that restores the previous `onError` handlers
 *
 * @remarks
 * Captured records use `source: 'query'` and carry `tags.queryKey` /
 * `tags.mutationKey` so a report shows *which* request failed, not just that one did.
 *
 * @example
 * ```ts
 * import { QueryClient } from '@tanstack/react-query';
 * import { attachQueryClient } from '@codewithrajat/rm-logvault/react-query';
 *
 * const queryClient = new QueryClient();
 * const detach = attachQueryClient(queryClient);
 * // …later
 * detach();
 * ```
 */
declare function attachQueryClient(queryClient: QueryClient): () => void;

export { attachQueryClient };
