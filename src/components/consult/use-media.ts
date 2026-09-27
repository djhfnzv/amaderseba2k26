"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MediaError = "denied" | "not-found" | "in-use" | "unsupported" | null;

/** Camera/mic for the call: permission, device switching, mute and camera-off. */
export function useMedia() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<MediaError>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioId, setAudioId] = useState<string>("");
  const [videoId, setVideoId] = useState<string>("");
  const streamRef = useRef<MediaStream | null>(null);

  const refreshDevices = useCallback(async () => {
    const list = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    setDevices(list.filter((d) => d.kind === "audioinput" || d.kind === "videoinput"));
  }, []);

  const start = useCallback(
    async (opts: { audioId?: string; videoId?: string; audioOnly?: boolean } = {}) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("unsupported");
        return null;
      }
      const audio: MediaTrackConstraints = opts.audioId
        ? { deviceId: { exact: opts.audioId }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true };
      const video: MediaTrackConstraints | false = opts.audioOnly
        ? false
        : opts.videoId
          ? { deviceId: { exact: opts.videoId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" };

      // Try camera + mic; a missing/busy camera falls back to an audio-only call.
      const attempts: MediaStreamConstraints[] = video ? [{ audio, video }, { audio, video: false }] : [{ audio, video: false }];
      let lastError: MediaError = null;
      for (const constraints of attempts) {
        try {
          const next = await navigator.mediaDevices.getUserMedia(constraints);
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = next;
          next.getAudioTracks().forEach((t) => (t.enabled = micOn));
          next.getVideoTracks().forEach((t) => (t.enabled = camOn));
          setStream(next);
          setError(constraints.video ? null : lastError);
          setAudioId(next.getAudioTracks()[0]?.getSettings().deviceId ?? "");
          setVideoId(next.getVideoTracks()[0]?.getSettings().deviceId ?? "");
          await refreshDevices(); // labels are only available after permission
          return next;
        } catch (e) {
          const name = (e as DOMException).name;
          lastError = name === "NotFoundError" ? "not-found" : name === "NotReadableError" ? "in-use" : "denied";
          if (name === "NotAllowedError") break; // blocked: don't keep asking
        }
      }
      setError(lastError);
      return null;
    },
    [camOn, micOn, refreshDevices],
  );

  const toggleMic = useCallback(() => {
    setMicOn((on) => {
      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !on));
      return !on;
    });
  }, []);

  const toggleCam = useCallback(() => {
    setCamOn((on) => {
      streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !on));
      return !on;
    });
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  useEffect(() => {
    const md = navigator.mediaDevices;
    md?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      md?.removeEventListener?.("devicechange", refreshDevices);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [refreshDevices]);

  return { stream, error, micOn, camOn, devices, audioId, videoId, start, stop, toggleMic, toggleCam };
}
