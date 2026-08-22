import React, { useState } from 'react';
import { Bot, Send, Sparkles, FileText, CheckCircle2, Loader2 } from 'lucide-react';
import { apiRequest } from '@/shared/api/client';

interface RagSourceChunk {
  source_type: string;
  text: string;
  similarity_score: number;
}

interface RagChatResponse {
  query: string;
  response: string;
  algorithm_version: string;
  retrieved_sources: RagSourceChunk[];
}

interface RagCareerAssistantProps {
  resumeText: string;
  jobDescriptionText?: string;
}

export const RagCareerAssistant: React.FC<RagCareerAssistantProps> = ({
  resumeText,
  jobDescriptionText,
}) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ sender: 'user' | 'assistant'; text: string; sources?: RagSourceChunk[] }>
  >([
    {
      sender: 'assistant',
      text: 'Hello! I am your 2-Stage RAG Career Assistant. Ask me anything about your resume or how your projects match the job description!',
    },
  ]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userQuery = query.trim();
    setQuery('');
    setMessages((prev) => [...prev, { sender: 'user', text: userQuery }]);
    setLoading(true);

    try {
      const data = await apiRequest<RagChatResponse>('/rag/chat', {
        method: 'POST',
        body: JSON.stringify({
          query: userQuery,
          resume_text: resumeText,
          job_description: jobDescriptionText || '',
          top_k: 3,
        }),
      });

      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: data.response,
          sources: data.retrieved_sources,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: 'Ensure your experience bullet points clearly highlight your technical achievements, projects, and key metrics.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[550px] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-800/80 border-b border-slate-700/50 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              RAG Career Assistant
              <span className="text-[10px] uppercase font-mono tracking-wider bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                rag-semantic-retrieval-v1
              </span>
            </h3>
            <p className="text-xs text-slate-400">Evidence-grounded vector search & AI career coach</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Grounded Context Active</span>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none shadow-lg shadow-indigo-600/20'
                  : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-none'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>

              {/* Retrieved RAG Source Tags */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-1.5">
                  <div className="text-[11px] font-medium text-indigo-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Retrieved Evidence Chunks ({msg.sources.length}):</span>
                  </div>
                  {msg.sources.map((src, i) => (
                    <div
                      key={i}
                      className="text-[11px] bg-slate-900/60 border border-slate-700/40 rounded p-2 text-slate-300 flex items-start gap-2"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-mono text-indigo-300 uppercase mr-1">
                          [{src.source_type}]:
                        </span>
                        <span>{src.text}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800/90 border border-slate-700/60 rounded-2xl rounded-bl-none px-5 py-3 flex items-center gap-3 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Retrieving vectors & synthesizing advice...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-4 bg-slate-800/50 border-t border-slate-800 flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask how your experience matches the job or how to improve bullet points..."
          className="flex-1 bg-slate-900 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={!query.trim() || loading}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition flex items-center gap-2 shadow-lg shadow-indigo-600/30"
        >
          <span>Send</span>
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
