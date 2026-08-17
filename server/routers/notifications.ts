import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const notificationsRouter = router({
  list: protectedProcedure.query(() => db.listNotifications(100)),

  unreadCount: protectedProcedure.query(() => db.countUnreadNotifications()),

  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.markNotificationRead(input.id);
      return { success: true } as const;
    }),

  markAllRead: protectedProcedure.mutation(async () => {
    await db.markAllNotificationsRead();
    return { success: true } as const;
  }),
});
