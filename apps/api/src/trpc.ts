import { initTRPC, TRPCError } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';

// 1. Context definition
export const createContext = ({ req, res }: CreateExpressContextOptions) => {
  return {
    req,
    res,
    isAdmin: req.headers['x-admin-secret'] === process.env.ADMIN_API_SECRET
  };
};

type Context = Awaited<ReturnType<typeof createContext>>;

// 2. Initialization
const t = initTRPC.context<Context>().create();

// 3. Middlewares
const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.isAdmin) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Admin access required' });
  }
  return next();
});

// 4. Procedures
export const router = t.router;
export const publicProcedure = t.procedure;
export const adminProcedure = t.procedure.use(isAdmin);
