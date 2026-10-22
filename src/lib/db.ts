import {PrismaClient} from '@prisma/client';
const scope = globalThis as unknown as {prisma?: PrismaClient};
export const db = scope.prisma ?? new PrismaClient({log: []});
if (process.env.NODE_ENV !== 'production') scope.prisma = db;
