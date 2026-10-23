import {App} from '@/components/app';
import {connection} from 'next/server';
import {registrationEnabled} from '@/lib/hosting';

export default async function Home() {
  await connection();
  return <App registrationEnabled={registrationEnabled(process.env)}/>;
}
