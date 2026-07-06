/**
 * Mobile browsers (especially iOS) often ignore `audio/*` and only show video/MP4.
 * List MIME types + extensions explicitly so MP3 and other audio appear in the picker.
 */
export const AUDIO_FILE_ACCEPT =
  ".mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,.webm," +
  "audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a," +
  "audio/aac,audio/ogg,audio/flac,audio/webm";

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac|opus|webm|wave)$/i;

export function isLikelyAudioFile(file: File): boolean {
  const t = file.type?.trim();
  if (t && t.startsWith("audio/")) return true;
  return AUDIO_EXT.test(file.name);
}
