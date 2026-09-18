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

type SeparationJob = {
  job_id: string;
  status: "queued" | "processing" | "complete" | "failed";
  status_url?: string;
  detail?: string;
} & Partial<SeparationResponse>;

const DEFAULT_PRODUCTION_API_URL = "https://indo-audio-separation-api.onrender.com";

/** Send the source to the configured Demucs service and retrieve both stems. */
export const splitStereoAudio = async (file: File): Promise<SplitAudioResult> => {
  const configuredApiUrl = import.meta.env.VITE_SEPARATION_API_URL;
  const apiUrl = (configuredApiUrl || (import.meta.env.PROD ? DEFAULT_PRODUCTION_API_URL : window.location.origin)).replace(/\/+$/, "");
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
  let payload: SeparationJob | null = null;
  try {
    payload = JSON.parse(responseText) as SeparationJob;
  } catch {
    // Reverse proxies can return an HTML/text error instead of JSON.
  }

  if (!response.ok || !payload || !payload.job_id) {
    const detail = payload?.detail || responseText.slice(0, 240).trim();
    throw new Error(`API separation ${response.status}: ${detail || "Service AI gagal memisahkan audio."}`);
  }

  if (payload.status !== "complete") {
    payload = await waitForJob(payload, apiUrl);
  }

  if (!payload.vocals_url || !payload.instrumental_url || !payload.format || !payload.model) {
    throw new Error("Service AI selesai tanpa mengembalikan kedua file stem.");
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

const waitForJob = async (initialJob: SeparationJob, apiUrl: string): Promise<SeparationJob> => {
  const statusUrl = new URL(initialJob.status_url || `/api/jobs/${initialJob.job_id}`, apiUrl).toString();
  for (let attempt = 0; attempt < 900; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    const response = await fetch(statusUrl);
    const responseText = await response.text();
    let job: SeparationJob | null = null;
    try {
      job = JSON.parse(responseText) as SeparationJob;
    } catch {
      // The next poll can recover from a transient proxy response.
    }

    if (!response.ok || !job) {
      throw new Error(`Status job separation tidak dapat dibaca (HTTP ${response.status}).`);
    }
    if (job.status === "failed") {
      throw new Error(job.detail || "Service AI gagal memisahkan audio.");
    }
    if (job.status === "complete") return job;
  }

  throw new Error("Proses AI belum selesai setelah 30 menit.");
};
