"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { requestConsultUpload, saveSharedFile, sendChatMessage } from "@/app/consult/[appointmentId]/actions";
import { checkDocumentFile, DOCUMENT_ACCEPT } from "@/lib/files";
import { formatBytes } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { ConsultationMessage } from "@/types/database";

export function ChatPanel({
  appointmentId,
  meId,
  names,
  messages,
  canSend,
  onSent,
}: {
  appointmentId: string;
  meId: string;
  names: Record<string, string>;
  messages: ConsultationMessage[];
  canSend: boolean;
  /** Add the new message locally and tell the other side. */
  onSent: (m: ConsultationMessage) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length]);

  function send() {
    const body = text.trim();
    if (!body) return;
    setError(null);
    startTransition(async () => {
      const res = await sendChatMessage(appointmentId, body);
      if (!res.ok) return setError(res.error);
      setText("");
      onSent(res.data);
    });
  }

  async function share(file: File) {
    const problem = checkDocumentFile(file);
    if (problem) return setError(problem);
    setError(null);
    setUploading(true);
    try {
      const ticket = await requestConsultUpload(appointmentId, { mimeType: file.type, size: file.size });
      if (!ticket.ok) return setError(ticket.error);
      const { error: upErr } = await createClient()
        .storage.from("consultation-files")
        .uploadToSignedUrl(ticket.data.path, ticket.data.token, file, { contentType: file.type });
      if (upErr) return setError("The upload failed. Please try again.");
      const saved = await saveSharedFile(appointmentId, ticket.data.path, file.name);
      if (!saved.ok) return setError(saved.error);
      onSent(saved.data);
    } finally {
      setUploading(false);
    }
  }

  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ol ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 && (
          <li className="py-8 text-center text-sm text-slate-500">No messages yet. You can chat or share reports here.</li>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <li key={m.id} className={`flex animate-fade-in flex-col ${mine ? "items-end" : "items-start"}`}>
              <span className="mb-0.5 text-[11px] text-slate-500">
                {mine ? "You" : (names[m.sender_id] ?? "Participant")} · {time(m.created_at)}
              </span>
              {m.kind === "text" ? (
                <p
                  className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                    mine ? "rounded-br-sm bg-teal-700 text-white" : "rounded-bl-sm bg-slate-100 text-slate-900"
                  }`}
                >
                  {m.body}
                </p>
              ) : (
                <a
                  href={`/consult-files/${m.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex max-w-[85%] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 hover:border-teal-400"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-red-50 text-[10px] font-bold text-red-700">
                    {m.mime_type === "application/pdf" ? "PDF" : "IMG"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.file_name}</span>
                    <span className="text-xs text-slate-500">{m.size_bytes ? formatBytes(m.size_bytes) : ""} · Open</span>
                  </span>
                </a>
              )}
            </li>
          );
        })}
      </ol>

      {canSend ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="border-t border-slate-200 p-3"
        >
          {error && <p role="alert" className="mb-2 text-xs text-red-700">{error}</p>}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Share a file"
              className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              {uploading ? (
                <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-teal-700" />
              ) : (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                  <path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
                </svg>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={DOCUMENT_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void share(f);
              }}
            />
            <label htmlFor="chat-input" className="sr-only">Message</label>
            <textarea
              id="chat-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Type a message…"
              className="max-h-28 min-h-10 flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600"
            />
            <button
              type="submit"
              disabled={pending || !text.trim()}
              className="h-10 shrink-0 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      ) : (
        <p className="border-t border-slate-200 p-3 text-center text-xs text-slate-500">The consultation has ended. Chat is read-only.</p>
      )}
    </div>
  );
}
