const missing = [];
for (const key of ['DATABASE_URL','APP_URL','DATA_OPERATOR_NAME','DATA_OPERATOR_CONTACT']) if (!process.env[key]) missing.push(key);
if (!process.env.APP_URL?.startsWith('https://')) missing.push('APP_URL must use HTTPS');
if (process.env.COOKIE_SECURE !== 'true') missing.push('COOKIE_SECURE=true');
if (process.env.ALLOW_REGISTRATION !== 'true' && process.env.ALLOW_REGISTRATION !== 'false') missing.push('ALLOW_REGISTRATION must be explicitly true or false');
if (missing.length) {console.error('Production configuration is incomplete: ' + missing.join(', ')); process.exit(1);}
console.log('Required production settings present. Hosting location, provider contracts, backups and recovery must also be verified by the operator.');
