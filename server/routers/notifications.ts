import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const notificationsRouter = router({
  list: adminProcedure.query(() => db.listNotifications(100)),

  unreadCount: adminProcedure.query(() => db.countUnreadNotifications()),

  markRead: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.markNotificationRead(input.id);
      return { success: true } as const;
    }),

  markAllRead: adminProcedure.mutation(async () => {
    await db.markAllNotificationsRead();
    return { success: true } as const;
  }),
});
