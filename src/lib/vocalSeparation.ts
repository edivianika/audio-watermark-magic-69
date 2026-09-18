export type SplitAudioResult = {
  vocal: Blob;
  instrumental: Blob;
  model: string;
  format: "mp3" | "wav";
  bitrate?: string;
};

type SeparationResponse = {
  vocals_url: string;
  instrumental_url: string;
  model: string;
  format: "mp3" | "wav";
  bitrate?: string;
};

/** Send the source to the configured Demucs service and retrieve both stems. */
export const splitStereoAudio = async (file: File): Promise<SplitAudioResult> => {
  const apiUrl = (import.meta.env.VITE_SEPARATION_API_URL || window.location.origin).replace(/\/+$/, "");
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/separate`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error(`Service AI tidak dapat dihubungi. Jalankan backend Demucs di ${apiUrl}.`);
  }

  const responseText = await response.text();
  let payload: SeparationResponse | { detail?: string } | null = null;
  try {
    payload = JSON.parse(responseText) as SeparationResponse | { detail?: string };
  } catch {
    // Reverse proxies can return an HTML/text error instead of JSON.
  }

  if (!response.ok || !payload || !("vocals_url" in payload) || !("instrumental_url" in payload) || !("format" in payload)) {
    const detail = payload && "detail" in payload ? payload.detail : responseText.slice(0, 240).trim();
    throw new Error(`API separation ${response.status}: ${detail || "Service AI gagal memisahkan audio."}`);
  }

  const vocalUrl = new URL(payload.vocals_url, apiUrl).toString();
  const instrumentalUrl = new URL(payload.instrumental_url, apiUrl).toString();
  const [vocalResponse, instrumentalResponse] = await Promise.all([
    fetch(vocalUrl),
    fetch(instrumentalUrl),
  ]);

  if (!vocalResponse.ok || !instrumentalResponse.ok) {
    const failedStem = vocalResponse.ok ? "instrumental" : "vocal";
    throw new Error(`Stem ${payload.model} berhasil dibuat, tetapi file ${failedStem} tidak dapat diunduh (HTTP ${(vocalResponse.ok ? instrumentalResponse : vocalResponse).status}).`);
  }

  const [vocal, instrumental] = await Promise.all([
    vocalResponse.blob(),
    instrumentalResponse.blob(),
  ]);

  return { vocal, instrumental, model: payload.model, format: payload.format, bitrate: payload.bitrate };
};
