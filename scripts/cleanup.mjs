import {PrismaClient} from '@prisma/client';
const db = new PrismaClient();
try {
  const now = new Date();
  const [sessions, limits] = await db.$transaction([db.session.deleteMany({where:{expiresAt:{lt:now}}}), db.rateLimit.deleteMany({where:{expiresAt:{lt:now}}})]);
  console.log(`Expired sessions removed: ${sessions.count}; expired rate limits removed: ${limits.count}.`);
} finally {await db.$disconnect();}
