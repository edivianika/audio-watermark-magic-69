/**
 * Mobile pickers can treat MPEG/WebM container MIME types as video.
 * Keep the picker extension-only so Android/iOS show audio documents instead of MP4/video.
 */
export const AUDIO_FILE_ACCEPT = ".mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.flac,.opus";

const AUDIO_EXT = /\.(mp3|wav|wave|m4a|aac|ogg|oga|flac|opus)$/i;

export function isLikelyAudioFile(file: File): boolean {
  const t = file.type?.trim();
  if (t && t.startsWith("audio/") && AUDIO_EXT.test(file.name)) return true;
  return AUDIO_EXT.test(file.name);
}
