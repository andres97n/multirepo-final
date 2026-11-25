// @module:auth
import { authProxy } from './auth-proxy';
// @end-module:auth

export default async function proxy() {
  // @module:auth
  await authProxy();
  // @end-module:auth
  return 'ok';
}
