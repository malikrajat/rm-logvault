import { AxiosInstance } from 'axios';

/**
 * Axios adapter: a response-error interceptor.
 *
 * @remarks
 * The interceptor is deliberately one-directional. It classifies the failure,
 * captures it, and then **returns the original rejection unchanged**. Swallowing a
 * rejection, or replacing it with a different error, would change how the
 * application behaves — a library must never do that.
 *
 * @packageDocumentation
 */

/**
 * Attach the telemetry interceptor to an axios instance.
 *
 * @param instance - the axios instance (or the global `axios` object)
 * @returns a function that ejects the interceptor
 *
 * @remarks
 * The interceptor reads only `method`, `url`, `status`, `statusText`, `code`,
 * `timeout`, the elapsed duration and the first present correlation header.
 * Request and response **bodies** are never read.
 *
 * @example
 * ```ts
 * import axios from 'axios';
 * import { attachAxios } from '@codewithrajat/rm-logvault/axios';
 *
 * const api = axios.create({ baseURL: '/api' });
 * const detach = attachAxios(api);
 * // …later
 * detach();
 * ```
 */
declare function attachAxios(instance: AxiosInstance): () => void;

export { attachAxios };
