import { ProxyAgent, setGlobalDispatcher } from 'undici';


/**
 * Enable proxy on local env (to help inspect next.js call)
 */
if (process.env.ENVIRONMENT === 'local') {
  const proxyUrl = process.env.PROXY_URL || 'http://127.0.0.1:8888';
  const agent = new ProxyAgent(proxyUrl);
  setGlobalDispatcher(agent);
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  console.log(
    '✓ Global fetch proxy enabled:',
    proxyUrl,
  );
}
