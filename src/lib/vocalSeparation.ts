import { encodeWAV, loadAudioFile } from "./audioCore";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export type SplitAudioResult = {
  vocal: Blob;
  instrumental: Blob;
  duration: number;
};

/**
 * Creates quick vocal/instrumental previews using stereo center/side extraction.
 * Center (L + R) generally contains vocals; side (L - R) generally contains
 * stereo instruments. This is intentionally local and lightweight, not an AI
 * stem separator, so results depend on how the original track was mixed.
 */
export const splitStereoAudio = async (file: File): Promise<SplitAudioResult> => {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextConstructor) {
    throw new Error("Browser ini tidak mendukung pemrosesan audio.");
  }

  const audioContext = new AudioContextConstructor();

  try {
    const sourceBuffer = await loadAudioFile(audioContext, file);

    if (sourceBuffer.numberOfChannels < 2) {
      throw new Error("File harus stereo. Pisahkan vokal dari track dengan minimal 2 channel.");
    }

    const left = sourceBuffer.getChannelData(0);
    const right = sourceBuffer.getChannelData(1);
    const vocalBuffer = audioContext.createBuffer(1, sourceBuffer.length, sourceBuffer.sampleRate);
    const instrumentalBuffer = audioContext.createBuffer(1, sourceBuffer.length, sourceBuffer.sampleRate);
    const vocal = vocalBuffer.getChannelData(0);
    const instrumental = instrumentalBuffer.getChannelData(0);

    for (let index = 0; index < sourceBuffer.length; index += 1) {
      // Mid/side extraction. Keep each stem inside the valid Web Audio range.
      vocal[index] = clamp((left[index] + right[index]) * 0.5);
      instrumental[index] = clamp((left[index] - right[index]) * 0.5);
    }

    return {
      vocal: new Blob([encodeWAV(vocalBuffer, 16)], { type: "audio/wav" }),
      instrumental: new Blob([encodeWAV(instrumentalBuffer, 16)], { type: "audio/wav" }),
      duration: sourceBuffer.duration,
    };
  } finally {
    await audioContext.close();
  }
};

const clamp = (sample: number) => Math.max(-1, Math.min(1, sample));
