"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Peer-to-peer WebRTC call for one appointment.
 *
 * Signaling runs over the private Supabase Realtime channel
 * "consult:<appointmentId>" (only its doctor and patient may join).
 * The doctor always makes the offer, so there is never an offer collision:
 *   join -> "hello" -> (other side) "hello-reply"
 *   doctor: new session (sid) -> offer -> patient: answer
 *   ICE candidates both ways, tagged with the sid; stale sids are ignored.
 * Network trouble -> the doctor restarts ICE on the same connection; the
 * patient nudges the doctor with "hello" if it can't recover by itself.
 */

export type Role = "doctor" | "patient";
export type CallState = "idle" | "waiting" | "connecting" | "connected" | "reconnecting" | "ended";

type Signal =
  | { type: "hello" | "hello-reply" | "bye" | "chat" | "ended"; from: Role }
  | { type: "offer"; from: Role; sid: string; sdp: RTCSessionDescriptionInit; reset: boolean }
  | { type: "answer"; from: Role; sid: string; sdp: RTCSessionDescriptionInit }
  | { type: "candidate"; from: Role; sid: string; candidate: RTCIceCandidateInit };

type Options = {
  appointmentId: string;
  role: Role;
  iceServers: RTCIceServer[];
  localStream: MediaStream | null;
  onChat?: () => void;
  onEnded?: () => void;
};

const RECONNECT_GRACE_MS = 4000;

export function useCall({ appointmentId, role, iceServers, localStream, onChat, onEnded }: Options) {
  const [state, setState] = useState<CallState>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peerPresent, setPeerPresent] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sidRef = useRef<string | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localRef = useRef<MediaStream | null>(localStream);
  const lastResetAt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedRef = useRef(false);
  /** Set below; lets createPeer trigger an ICE-restart offer without a circular dependency. */
  const makeOfferRef = useRef<((reset: boolean) => Promise<void>) | null>(null);
  const callbacks = useRef({ onChat, onEnded });
  useEffect(() => {
    callbacks.current = { onChat, onEnded };
    localRef.current = localStream;
  }, [onChat, onEnded, localStream]);

  const send = useCallback((payload: Signal) => {
    void channelRef.current?.send({ type: "broadcast", event: "signal", payload });
  }, []);

  const closePeer = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    pcRef.current?.close();
    pcRef.current = null;
    sidRef.current = null;
    pendingCandidates.current = [];
    setRemoteStream(null);
  }, []);

  /** Fresh RTCPeerConnection for a session id. */
  const createPeer = useCallback(
    (sid: string) => {
      closePeer();
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      sidRef.current = sid;
      const remote = new MediaStream();
      setRemoteStream(remote);

      pc.ontrack = (e) => {
        if (!remote.getTracks().includes(e.track)) remote.addTrack(e.track);
        // New object so React re-renders the <video>.
        setRemoteStream(new MediaStream(remote.getTracks()));
      };
      pc.onicecandidate = (e) => {
        if (e.candidate && sidRef.current === sid) send({ type: "candidate", from: role, sid, candidate: e.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc || endedRef.current) return;
        const s = pc.connectionState;
        if (s === "connected") {
          if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
          setState("connected");
        } else if (s === "connecting" || s === "new") {
          setState((prev) => (prev === "connected" || prev === "reconnecting" ? "reconnecting" : "connecting"));
        } else if (s === "disconnected" || s === "failed") {
          setState("reconnecting");
          if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
          reconnectTimer.current = setTimeout(
            () => {
              if (pcRef.current !== pc || pc.connectionState === "connected") return;
              if (role === "doctor") void makeOfferRef.current?.(false);
              else send({ type: "hello", from: role });
            },
            s === "failed" ? 0 : RECONNECT_GRACE_MS,
          );
        }
      };
      return pc;
    },
    [closePeer, iceServers, role, send],
  );

  /** Doctor only. reset=true starts a new session; false restarts ICE on the current one. */
  const makeOffer = useCallback(
    async (reset: boolean) => {
      let pc = pcRef.current;
      if (reset || !pc || !sidRef.current) {
        const sid = crypto.randomUUID();
        pc = createPeer(sid);
        const local = localRef.current;
        for (const kind of ["audio", "video"] as const) {
          const track = local?.getTracks().find((t) => t.kind === kind);
          if (track && local) pc.addTrack(track, local);
          else pc.addTransceiver(kind, { direction: "recvonly" });
        }
      }
      const sid = sidRef.current!;
      setState((prev) => (prev === "connected" ? "reconnecting" : "connecting"));
      const offer = await pc.createOffer({ iceRestart: !reset });
      if (pcRef.current !== pc) return;
      await pc.setLocalDescription(offer);
      send({ type: "offer", from: role, sid, sdp: pc.localDescription!.toJSON(), reset });
    },
    [createPeer, role, send],
  );

  useEffect(() => {
    makeOfferRef.current = makeOffer;
  }, [makeOffer]);

  const handleSignal = useCallback(
    async (msg: Signal) => {
      if (msg.from === role || endedRef.current) return; // our own echo / call over

      switch (msg.type) {
        case "hello":
        case "hello-reply": {
          setPeerPresent(true);
          if (msg.type === "hello") send({ type: "hello-reply", from: role });
          if (role === "doctor") {
            // Both sides may say hello at once; start one session, not two.
            if (Date.now() - lastResetAt.current < 1500 && pcRef.current?.connectionState !== "failed") return;
            lastResetAt.current = Date.now();
            await makeOffer(true);
          } else {
            setState((s) => (s === "connected" ? s : "connecting"));
          }
          return;
        }
        case "offer": {
          if (role !== "patient") return;
          setPeerPresent(true);
          let pc = pcRef.current;
          if (msg.reset || !pc || sidRef.current !== msg.sid) pc = createPeer(msg.sid);
          setState((s) => (s === "connected" ? "reconnecting" : "connecting"));
          await pc.setRemoteDescription(msg.sdp);
          // Send our camera/mic on the transceivers the doctor offered.
          const local = localRef.current;
          for (const t of pc.getTransceivers()) {
            const kind = t.receiver.track.kind;
            const track = local?.getTracks().find((x) => x.kind === kind) ?? null;
            if (track) {
              await t.sender.replaceTrack(track);
              t.direction = "sendrecv";
              if (local) t.sender.setStreams?.(local);
            }
          }
          for (const c of pendingCandidates.current.splice(0)) await pc.addIceCandidate(c).catch(() => {});
          const answer = await pc.createAnswer();
          if (pcRef.current !== pc) return;
          await pc.setLocalDescription(answer);
          send({ type: "answer", from: role, sid: msg.sid, sdp: pc.localDescription!.toJSON() });
          return;
        }
        case "answer": {
          const pc = pcRef.current;
          if (role !== "doctor" || !pc || sidRef.current !== msg.sid || pc.signalingState !== "have-local-offer") return;
          await pc.setRemoteDescription(msg.sdp);
          for (const c of pendingCandidates.current.splice(0)) await pc.addIceCandidate(c).catch(() => {});
          return;
        }
        case "candidate": {
          const pc = pcRef.current;
          if (!pc || sidRef.current !== msg.sid) return;
          if (!pc.remoteDescription) pendingCandidates.current.push(msg.candidate);
          else await pc.addIceCandidate(msg.candidate).catch(() => {});
          return;
        }
        case "bye": {
          setPeerPresent(false);
          closePeer();
          setState("waiting");
          return;
        }
        case "chat":
          callbacks.current.onChat?.();
          return;
        case "ended":
          endedRef.current = true;
          closePeer();
          setState("ended");
          callbacks.current.onEnded?.();
          return;
      }
    },
    [closePeer, createPeer, makeOffer, role, send],
  );

  /** Join the room: subscribe to the private channel and say hello. */
  const join = useCallback(async () => {
    if (channelRef.current) return;
    const supabase = createClient();
    await supabase.realtime.setAuth(); // private channels need the user's token
    const channel = supabase.channel(`consult:${appointmentId}`, {
      config: { private: true, broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "signal" }, ({ payload }) => void handleSignal(payload as Signal));
    channelRef.current = channel;
    setState("waiting");
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") send({ type: "hello", from: role });
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setState((s) => (s === "connected" ? s : "reconnecting"));
    });
  }, [appointmentId, handleSignal, role, send]);

  const leave = useCallback(() => {
    send({ type: "bye", from: role });
    closePeer();
    const ch = channelRef.current;
    channelRef.current = null;
    if (ch) void createClient().removeChannel(ch);
    setState("idle");
  }, [closePeer, role, send]);

  /** Tell the other side to refresh chat. */
  const notifyChat = useCallback(() => send({ type: "chat", from: role }), [role, send]);

  /** Doctor ended the consultation for both. */
  const announceEnded = useCallback(() => {
    send({ type: "ended", from: role });
    endedRef.current = true;
    closePeer();
    setState("ended");
  }, [closePeer, role, send]);

  /** Swap the outgoing track after a device change or camera toggle. */
  const replaceTrack = useCallback(async (kind: "audio" | "video", track: MediaStreamTrack | null) => {
    const pc = pcRef.current;
    if (!pc) return;
    for (const t of pc.getTransceivers()) {
      if (t.receiver.track.kind === kind) await t.sender.replaceTrack(track).catch(() => {});
    }
  }, []);

  // Say goodbye if the tab closes; clean up on unmount.
  useEffect(() => {
    const bye = () => send({ type: "bye", from: role });
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      const ch = channelRef.current;
      channelRef.current = null;
      pcRef.current?.close();
      if (ch) void createClient().removeChannel(ch);
    };
  }, [role, send]);

  return { state, remoteStream, peerPresent, join, leave, notifyChat, announceEnded, replaceTrack };
}
