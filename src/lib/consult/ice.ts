import "server-only";

/**
 * ICE servers for WebRTC. STUN (free, public) always; TURN relays when
 * configured — needed for users behind strict NATs (common on mobile data).
 *
 * Configure ONE of:
 *   TURN_URLS=turn:host:3478,turns:host:443?transport=tcp
 *   TURN_USERNAME=...           TURN_CREDENTIAL=...
 * or (Metered.ca, short-lived credentials fetched per call):
 *   METERED_TURN_DOMAIN=yourapp.metered.live   METERED_TURN_API_KEY=...
 */
const STUN: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

export async function getIceServers(): Promise<{ iceServers: RTCIceServer[]; hasTurn: boolean }> {
  const meteredDomain = process.env.METERED_TURN_DOMAIN?.trim();
  const meteredKey = process.env.METERED_TURN_API_KEY?.trim();
  if (meteredDomain && meteredKey) {
    try {
      const res = await fetch(
        `https://${meteredDomain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(meteredKey)}`,
        { cache: "no-store", signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const servers = (await res.json()) as RTCIceServer[];
        if (Array.isArray(servers) && servers.length) return { iceServers: [...STUN, ...servers], hasTurn: true };
      }
      console.error("[ice] Metered TURN request failed", res.status);
    } catch (e) {
      console.error("[ice] Metered TURN error", (e as Error).message);
    }
  }

  const urls = process.env.TURN_URLS?.split(",").map((u) => u.trim()).filter(Boolean) ?? [];
  if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    return {
      iceServers: [...STUN, { urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL }],
      hasTurn: true,
    };
  }
  return { iceServers: STUN, hasTurn: false };
}
