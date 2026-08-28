import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Bot, Send, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type ChatEntry = { role: "user" | "assistant"; content: string };

/** Floating chat assistant, mounted once in DashboardLayout so it's available on every page. */
export function ChatAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [question, setQuestion] = useState("");
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);

  const chat = trpc.aiInsights.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, chat.isPending]);

  function sendQuestion() {
    const q = question.trim();
    if (!q || chat.isPending) return;
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    chat.mutate({ question: q, history: messages });
    setQuestion("");
  }

  return (
    <>
      <Button
        type="button"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        className={cn(
          "fixed right-5 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all",
          isMobile ? "bottom-20" : "bottom-6",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </Button>

      {open && (
        <Card
          className={cn(
            "fixed z-50 flex flex-col shadow-2xl border-2",
            isMobile
              ? "bottom-36 right-3 left-3 h-[60vh]"
              : "bottom-24 right-5 w-96 h-[32rem]",
          )}
        >
          <CardHeader className="py-3 border-b shrink-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bot className="h-4 w-4" /> AI Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-3 p-3 min-h-0">
            <div ref={scrollRef} className="flex-1 overflow-y-auto -mx-1 px-1">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Ask about licenses, trainings, or staffing — e.g. "Who has an expired license?"
                </p>
              ) : (
                <div className="space-y-3">
                  {messages.map((m, i) => (
                    <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      {m.role === "assistant" && <Bot className="h-5 w-5 shrink-0 text-muted-foreground mt-1" />}
                      <div
                        className={`rounded-lg px-3 py-2 text-sm max-w-[80%] whitespace-pre-wrap ${
                          m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                        }`}
                      >
                        {m.content}
                      </div>
                      {m.role === "user" && <User className="h-5 w-5 shrink-0 text-muted-foreground mt-1" />}
                    </div>
                  ))}
                  {chat.isPending && (
                    <div className="flex gap-2 justify-start">
                      <Bot className="h-5 w-5 shrink-0 text-muted-foreground mt-1" />
                      <div className="rounded-lg px-3 py-2 text-sm bg-muted flex items-center gap-2">
                        <Spinner className="h-3 w-3" /> Thinking…
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendQuestion();
                  }
                }}
                placeholder="Ask a question…"
                className="min-h-[40px] resize-none text-sm"
                rows={1}
              />
              <Button type="button" size="icon" onClick={sendQuestion} disabled={chat.isPending || !question.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
