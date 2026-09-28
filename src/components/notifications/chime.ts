"use client";

// Notification sound: a short two-note chime made with Web Audio (no file to
// load). Browsers only allow sound after the user has interacted with the
// page, so the audio is unlocked on the first click / key press.

const MUTE_KEY = "medlife:notification-sound-off";
const listeners = new Set<() => void>();

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Call once on mount; resumes audio on the first user gesture. */
export function unlockAudioOnGesture(): () => void {
  const unlock = () => void audio()?.resume().catch(() => {});
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}

export function playChime() {
  if (isSoundMuted()) return;
  const c = audio();
  if (!c) return;
  if (c.state !== "running") {
    // No click/key press on the page yet: the browser won't allow sound.
    void c.resume().catch(() => {});
    return;
  }
  const start = c.currentTime + 0.01;
  // A5 then E6, soft sine "ding-ding".
  [
    { freq: 880, at: 0 },
    { freq: 1318.5, at: 0.13 },
  ].forEach(({ freq, at }) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = start + at;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}

// --- per-browser mute preference (useSyncExternalStore store) ---------------
export function isSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
}

export function subscribeSoundMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
