import {vercelConfigurationErrors} from '../src/lib/hosting.ts';

const errors = vercelConfigurationErrors(process.env);
if (errors.length) {
  console.error('Vercel configuration is incomplete:\n' + errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Vercel settings passed validation. Database connectivity, migrations, account setup and hosting/privacy approval still require verification.');
}
