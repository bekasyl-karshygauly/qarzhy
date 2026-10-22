type HostingEnv = Record<string, string | undefined>;

/** Exactly one trusted configured/platform origin; never derived from request headers. */
export function appUrl(env: HostingEnv) {
  if (env.APP_URL?.trim()) return env.APP_URL.trim();
  if (env.VERCEL !== '1') return 'http://127.0.0.1:3100';
  const host = env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_URL;
  if (!host || host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i.test(host)) return '';
  return `https://${host.toLowerCase()}`;
}

/** Messages identify settings only: never include URLs, passwords or key values. */
export function vercelConfigurationErrors(env: HostingEnv) {
  const errors: string[] = [];
  try {
    const url = new URL(appUrl(env));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' || /YOUR_|REPLACE_|localhost|\.invalid$/i.test(url.hostname)) throw new Error();
  } catch {errors.push('APP_URL: set a canonical HTTPS origin or enable valid Vercel system URL variables.');}
  try {
    const url = new URL(env.DATABASE_URL || '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password || url.pathname.length < 2 || /^(?:localhost\.?|127\..*|0\.0\.0\.0|\[::1\]|postgres)$/i.test(url.hostname) || /YOUR_|REPLACE_|\.invalid$/i.test(url.hostname)) throw new Error();
    if (url.searchParams.getAll('sslmode').length !== 1 || url.searchParams.get('sslmode') !== 'require' || url.searchParams.getAll('sslaccept').length !== 1 || url.searchParams.get('sslaccept') !== 'strict' || url.searchParams.has('host')) throw new Error();
  } catch {errors.push('DATABASE_URL: configure a remote PostgreSQL URL with sslmode=require and sslaccept=strict.');}
  if (env.COOKIE_SECURE !== 'true') errors.push('COOKIE_SECURE=true is required.');
  if (env.ALLOW_REGISTRATION !== 'false') errors.push('ALLOW_REGISTRATION=false is required for the closed pilot.');
  for (const key of ['DATA_OPERATOR_NAME', 'DATA_OPERATOR_CONTACT']) {
    if (!env[key]?.trim() || /YOUR_|REPLACE_/i.test(env[key]!)) errors.push(`${key}: supply the operator details.`);
  }
  if (env.AI_API_KEY?.trim()) {
    for (const key of ['AI_BASE_URL', 'AI_MODEL', 'AI_PROVIDER_NAME', 'AI_PROCESSING_COUNTRY']) {
      if (!env[key]?.trim()) errors.push(`${key}: required when an AI key is configured.`);
    }
    try {if (new URL(env.AI_BASE_URL || '').protocol !== 'https:') throw new Error();}
    catch {errors.push('AI_BASE_URL: HTTPS is required.');}
  }
  for (const key of Object.keys(env)) {
    if (/^NEXT_PUBLIC_.*(?:AI_API_KEY|SECRET|PASSWORD|PRIVATE_KEY)$/.test(key) && env[key]) errors.push(`${key}: secrets must be server-only.`);
  }
  return errors;
}
