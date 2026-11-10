import { liveDeps } from '../src/http/live-deps.js';
import { handle } from '../src/http/router.js';

export default {
  fetch(request: Request): Promise<Response> {
    return handle(request, liveDeps());
  },
};
