"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { endConsultation, fetchMessagesSince } from "@/app/consult/[appointmentId]/actions";
import type { ConsultationMessage } from "@/types/database";
import { ChatPanel } from "./chat-panel";
import { NotesPanel } from "./notes-panel";
import { useCall, type CallState, type Role } from "./use-call";
import { useMedia } from "./use-media";

type Props = {
  appointmentId: string;
  role: Role;
  meId: string;
  peerName: string;
  names: Record<string, string>;
  iceServers: RTCIceServer[];
  hasTurn: boolean;
  initialMessages: ConsultationMessage[];
  initialNotes: string;
  /** Doctor only: server-rendered patient summary. */
  patientPanel?: React.ReactNode;
  /** Where to go after the call. */
  doneHref: string;
};

const STATE_LABEL: Record<CallState, string> = {
  idle: "Not joined",
  waiting: "Waiting",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  ended: "Ended",
};

export function ConsultRoom(props: Props) {
  const { appointmentId, role, meId, peerName, names, iceServers, hasTurn, initialMessages, initialNotes, patientPanel, doneHref } = props;
  const router = useRouter();
  const media = useMedia();
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState<ConsultationMessage[]>(initialMessages);
  const [panel, setPanel] = useState<"chat" | "patient" | "notes">("chat");
  const [panelOpen, setPanelOpen] = useState(false); // phones/tablets
  const [unread, setUnread] = useState(0);
  const [ending, startEnding] = useTransition();
  const [endError, setEndError] = useState<string | null>(null);

  const lastAt = useRef<string | null>(initialMessages.at(-1)?.created_at ?? null);
  const pullMessages = useCallback(async () => {
    const fresh = await fetchMessagesSince(appointmentId, lastAt.current);
    if (!fresh.length) return;
    lastAt.current = fresh.at(-1)!.created_at;
    setMessages((prev) => [...prev, ...fresh.filter((m) => !prev.some((p) => p.id === m.id))]);
    setUnread((n) => n + fresh.filter((m) => m.sender_id !== meId).length);
  }, [appointmentId, meId]);

  const call = useCall({
    appointmentId,
    role,
    iceServers,
    localStream: media.stream,
    onChat: pullMessages,
    onEnded: () => router.refresh(),
  });

  // Start the camera preview in the lobby.
  const startedPreview = useRef(false);
  useEffect(() => {
    if (startedPreview.current) return;
    startedPreview.current = true;
    void media.start();
  }, [media]);

  // Keep outgoing tracks in sync when devices change mid-call.
  const { replaceTrack } = call;
  useEffect(() => {
    if (!joined || !media.stream) return;
    void replaceTrack("audio", media.stream.getAudioTracks()[0] ?? null);
    void replaceTrack("video", media.stream.getVideoTracks()[0] ?? null);
  }, [joined, media.stream, replaceTrack]);

  function onSent(m: ConsultationMessage) {
    lastAt.current = m.created_at;
    setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
    call.notifyChat();
  }

  function end() {
    if (!confirm("End the consultation for both of you? The room will close.")) return;
    setEndError(null);
    startEnding(async () => {
      const res = await endConsultation(appointmentId);
      if (!res.ok) return setEndError(res.error);
      call.announceEnded();
      media.stop();
      router.push(doneHref);
    });
  }

  function leave() {
    call.leave();
    media.stop();
    router.push(doneHref);
  }

  const ended = call.state === "ended";

  // ---------------------------------------------------------------- Lobby
  if (!joined) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="grid w-full max-w-4xl animate-fade-up gap-6 rounded-2xl bg-white p-5 text-slate-900 shadow-xl sm:p-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
            <VideoEl stream={media.stream} muted mirror className={media.camOn ? "" : "invisible"} />
            {(!media.stream || !media.camOn) && (
              <div className="absolute inset-0 grid place-items-center text-sm text-slate-300">
                {media.error === "denied"
                  ? "Camera and microphone are blocked"
                  : !media.stream
                    ? "Starting camera…"
                    : "Camera is off"}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
              <RoundButton on={media.micOn} onClick={media.toggleMic} label={media.micOn ? "Mute microphone" : "Unmute microphone"} icon="mic" />
              <RoundButton on={media.camOn} onClick={media.toggleCam} label={media.camOn ? "Turn camera off" : "Turn camera on"} icon="cam" />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-xl font-bold">Ready to join?</h1>
              <p className="mt-1 text-sm text-slate-600">
                Consultation with <strong>{peerName}</strong>. Check your camera and microphone, then join.
              </p>
            </div>

            {media.error === "denied" && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Allow camera and microphone in your browser&apos;s address bar, then{" "}
                <button type="button" className="font-semibold underline" onClick={() => void media.start()}>
                  try again
                </button>
                . You can still join to chat.
              </p>
            )}
            {media.error === "not-found" && media.stream && (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">No camera found — you&apos;ll join with audio only.</p>
            )}

            <DevicePickers media={media} />

            <button
              type="button"
              onClick={async () => {
                setJoined(true);
                await call.join();
              }}
              className="h-12 rounded-xl bg-teal-700 font-semibold text-white hover:bg-teal-800 active:scale-[0.98]"
            >
              Join consultation
            </button>
            <p className="text-xs text-slate-500">
              Your video goes directly to {role === "doctor" ? "the patient" : "the doctor"}, encrypted. Calls are not recorded.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- In call
  const sideTabs: { key: typeof panel; label: string }[] = [
    { key: "chat", label: unread ? `Chat (${unread})` : "Chat" },
    ...(role === "doctor" ? [{ key: "patient" as const, label: "Patient" }, { key: "notes" as const, label: "Notes" }] : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Video stage */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 bg-slate-950">
          <VideoEl stream={call.remoteStream} className="absolute inset-0 size-full object-contain" />
          {call.state !== "connected" && (
            <div className="absolute inset-0 grid animate-fade-in place-items-center p-6 text-center">
              <div>
                <p className="text-lg font-semibold text-white">
                  {ended
                    ? "The consultation has ended"
                    : call.state === "reconnecting"
                      ? "Reconnecting…"
                      : call.peerPresent
                        ? "Connecting…"
                        : `Waiting for ${peerName} to join`}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {call.state === "reconnecting"
                    ? "Your connection dropped. Hang on — we're getting you back."
                    : ended
                      ? ""
                      : "Keep this page open."}
                </p>
                {!hasTurn && call.state === "connecting" && (
                  <p className="mt-3 text-xs text-slate-500">Taking long? Both of you may need a stable Wi-Fi connection.</p>
                )}
              </div>
            </div>
          )}

          {/* Self view */}
          <div className="absolute bottom-3 right-3 aspect-video w-32 overflow-hidden rounded-lg border border-white/20 bg-slate-800 shadow-lg sm:w-48">
            <VideoEl stream={media.stream} muted mirror className={media.camOn ? "" : "invisible"} />
            {!media.camOn && <span className="absolute inset-0 grid place-items-center text-xs text-slate-300">Camera off</span>}
          </div>

          <span
            className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold ${
              call.state === "connected" ? "bg-emerald-500/90 text-white" : "bg-white/15 text-white"
            }`}
          >
            {STATE_LABEL[call.state]}
          </span>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-center gap-3 bg-slate-900 px-4 py-3">
          <RoundButton on={media.micOn} onClick={media.toggleMic} label={media.micOn ? "Mute" : "Unmute"} icon="mic" />
          <RoundButton on={media.camOn} onClick={media.toggleCam} label={media.camOn ? "Camera off" : "Camera on"} icon="cam" />
          <button
            type="button"
            onClick={() => {
              setPanelOpen((o) => !o);
              setUnread(0);
            }}
            className="relative grid size-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 lg:hidden"
            aria-label="Chat and details"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
              <path d="M5 18.5 3.5 21V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10.5a2 2 0 0 1-2 2H5Z" />
            </svg>
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-red-600 text-[10px] font-bold">{unread}</span>}
          </button>
          {role === "doctor" ? (
            <button
              type="button"
              onClick={end}
              disabled={ending}
              className="h-12 rounded-full bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {ending ? "Ending…" : "End consultation"}
            </button>
          ) : ended ? (
            <Link href={doneHref} className="grid h-12 place-items-center rounded-full bg-teal-600 px-5 text-sm font-semibold text-white">
              Back to appointment
            </Link>
          ) : (
            <button type="button" onClick={leave} className="h-12 rounded-full bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700">
              Leave
            </button>
          )}
          {endError && <p className="w-full text-center text-xs text-red-300">{endError}</p>}
        </div>
      </div>

      {/* Side panel: fixed column on desktop, slide-over on smaller screens */}
      <aside
        className={`${panelOpen ? "fixed inset-0 z-40 flex animate-fade-in" : "hidden"} flex-col bg-white text-slate-900 lg:static lg:z-auto lg:flex lg:w-96 lg:animate-none lg:border-l lg:border-slate-200`}
      >
        <div className="flex items-center border-b border-slate-200">
          <div role="tablist" className="flex flex-1">
            {sideTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={panel === t.key}
                onClick={() => {
                  setPanel(t.key);
                  if (t.key === "chat") setUnread(0);
                }}
                className={`flex-1 border-b-2 px-3 py-3 text-sm font-medium ${
                  panel === t.key ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPanelOpen(false)} className="px-4 py-3 text-slate-500 lg:hidden" aria-label="Close panel">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {panel === "chat" && (
            <ChatPanel appointmentId={appointmentId} meId={meId} names={names} messages={messages} canSend={!ended} onSent={onSent} />
          )}
          {panel === "patient" && role === "doctor" && <div className="h-full overflow-y-auto p-4">{patientPanel}</div>}
          {panel === "notes" && role === "doctor" && <NotesPanel appointmentId={appointmentId} initial={initialNotes} />}
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- Pieces

function VideoEl({ stream, muted, mirror, className = "" }: { stream: MediaStream | null; muted?: boolean; mirror?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`size-full object-cover ${mirror ? "-scale-x-100" : ""} ${className}`}
    />
  );
}

function RoundButton({ on, onClick, label, icon }: { on: boolean; onClick: () => void; label: string; icon: "mic" | "cam" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!on}
      aria-label={label}
      title={label}
      className={`grid size-12 place-items-center rounded-full transition-colors active:scale-95 ${
        on ? "bg-white/15 text-white hover:bg-white/25" : "bg-red-600 text-white hover:bg-red-700"
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icon === "mic" ? (
          <>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            {!on && <path d="m4 4 16 16" />}
          </>
        ) : (
          <>
            <rect x="3" y="6" width="12.5" height="12" rx="2" />
            <path d="m15.5 10.5 5-3v9l-5-3" />
            {!on && <path d="m3 3 18 18" />}
          </>
        )}
      </svg>
    </button>
  );
}

function DevicePickers({ media }: { media: ReturnType<typeof useMedia> }) {
  const mics = media.devices.filter((d) => d.kind === "audioinput");
  const cams = media.devices.filter((d) => d.kind === "videoinput");
  const field = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-600";
  if (!mics.length && !cams.length) return null;
  return (
    <div className="grid gap-3">
      {mics.length > 0 && (
        <label className="text-sm font-medium text-slate-800">
          Microphone
          <select value={media.audioId} onChange={(e) => void media.start({ audioId: e.target.value, videoId: media.videoId || undefined })} className={`mt-1 ${field}`}>
            {mics.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
            ))}
          </select>
        </label>
      )}
      {cams.length > 0 && (
        <label className="text-sm font-medium text-slate-800">
          Camera
          <select value={media.videoId} onChange={(e) => void media.start({ videoId: e.target.value, audioId: media.audioId || undefined })} className={`mt-1 ${field}`}>
            {cams.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
