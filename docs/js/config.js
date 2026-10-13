// App configuration. PROXY_URL points to the Supabase edge function `books-proxy`
// (https://txhcnqwrdazgaxjwabln.supabase.co/functions/v1/books-proxy) once it is deployed.
// While it is empty the app skips Biblioteka Narodowa and the Nekla availability check gracefully.
export const PROXY_URL = '';

// Nekla public library (SOWA OPAC).
export const SOWA_BASE = 'https://www.nekla-bpmig.sowa.pl/index.php';
export const sowaSearchUrl = (phrase) =>
  `${SOWA_BASE}?KatID=0&typ=repl&plnk=q__${String(phrase || '').trim().split(/\s+/).filter(Boolean).map(encodeURIComponent).join('+')}&sort=byscore&view=1`;
export const LEGIMI_NEKLA_URL = 'https://www.legimi.pl/biblioteka_nekla/';
