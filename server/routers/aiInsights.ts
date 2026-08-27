import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { answerInsightsChat, generateInsightsReport } from "../_core/aiInsights";

export const aiInsightsRouter = router({
  generateReport: adminProcedure.mutation(async () => {
    try {
      const report = await generateInsightsReport();
      return { report, generatedAt: new Date().toISOString() };
    } catch (err) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "Failed to generate report." });
    }
  }),

  chat: adminProcedure
    .input(
      z.object({
        question: z.string().min(1).max(1000),
        history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const answer = await answerInsightsChat(input.question, input.history ?? []);
        return { answer };
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "Failed to answer question." });
      }
    }),
});
