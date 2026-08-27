import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Bot, FileText, Send, Sparkles, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ChatEntry = { role: "user" | "assistant"; content: string };

export default function AiInsightsPage() {
  const [report, setReport] = useState<string | null>(null);
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [question, setQuestion] = useState("");

  const generateReport = trpc.aiInsights.generateReport.useMutation({
    onSuccess: (data) => {
      setReport(data.report);
      setReportGeneratedAt(data.generatedAt);
    },
    onError: (err) => toast.error(err.message),
  });

  const chat = trpc.aiInsights.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    },
    onError: (err) => toast.error(err.message),
  });

  function sendQuestion() {
    const q = question.trim();
    if (!q || chat.isPending) return;
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    chat.mutate({ question: q, history: messages });
    setQuestion("");
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" /> AI Insights
          </CardTitle>
          <CardDescription>
            Nemotron 3 reads your current roster, license, and training data to write reports and answer questions — nothing here changes any records.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Report
          </CardTitle>
          <CardDescription>Urgent/upcoming license expirations, upcoming trainings and seminars, and staffing patterns.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button type="button" onClick={() => generateReport.mutate()} disabled={generateReport.isPending}>
            {generateReport.isPending ? <Spinner className="h-4 w-4 mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {generateReport.isPending ? "Generating…" : report ? "Regenerate Report" : "Generate Report"}
          </Button>
          {report && (
            <div className="rounded-lg border bg-muted/30 p-4">
              {reportGeneratedAt && (
                <p className="text-xs text-muted-foreground mb-2">Generated {new Date(reportGeneratedAt).toLocaleString()}</p>
              )}
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{report}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" /> Ask a Question
          </CardTitle>
          <CardDescription>e.g. "Who in RDU Main has an expired license?" or "How many nurses are in SKTI ICU?"</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.length > 0 && (
            <ScrollArea className="h-80 rounded-lg border p-3">
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
            </ScrollArea>
          )}
          <div className="flex gap-2">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendQuestion();
                }
              }}
              placeholder="Ask about licenses, trainings, or staffing…"
              className="min-h-[44px] resize-none"
              rows={1}
            />
            <Button type="button" onClick={sendQuestion} disabled={chat.isPending || !question.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
