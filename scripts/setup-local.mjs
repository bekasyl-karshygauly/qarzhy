import {existsSync, writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
if (existsSync('.env')) { console.log('.env уже существует — сохранён без изменений.'); }
else {
  const password = randomBytes(24).toString('hex');
  writeFileSync('.env', `DATABASE_URL=postgresql://qarzhy:${password}@127.0.0.1:55432/qarzhy?schema=public\nAPP_URL=http://127.0.0.1:3100\nALLOW_REGISTRATION=true\nCOOKIE_SECURE=false\nAI_BASE_URL=\nAI_API_KEY=\nAI_MODEL=\nAI_PROVIDER_NAME=\nAI_PROCESSING_COUNTRY=\nVOICE_MODEL=\nDATA_OPERATOR_NAME=\nDATA_OPERATOR_CONTACT=\n`);
  console.log('Создан локальный .env со случайным паролем PostgreSQL. Секреты не выводятся.');
}
