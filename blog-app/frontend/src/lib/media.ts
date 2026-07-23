export type EmbedType = "youtube" | "vimeo" | "soundcloud" | "spotify" | "video" | "audio" | "link";

export type EmbedInfo = {
  type: EmbedType;
  url: string;
  embedUrl: string | null;
  label: string;
};

export function detectEmbed(url: string, label?: string): EmbedInfo {
  const u = url.toLowerCase();

  // YouTube
  const ytMatch = u.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-z0-9_-]{11})/
  );
  if (ytMatch) {
    const id = ytMatch[1];
    return {
      type: "youtube",
      url,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      label: label || "YouTube",
    };
  }

  // Vimeo
  const vimeoMatch = u.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return {
      type: "vimeo",
      url,
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      label: label || "Vimeo",
    };
  }

  // SoundCloud
  if (u.includes("soundcloud.com")) {
    return {
      type: "soundcloud",
      url,
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%237c9a6d&auto_play=false`,
      label: label || "SoundCloud",
    };
  }

  // Spotify
  const spotifyMatch = u.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([a-z0-9]+)/);
  if (spotifyMatch) {
    return {
      type: "spotify",
      url,
      embedUrl: `https://open.spotify.com/embed/${spotifyMatch[1]}/${spotifyMatch[2]}`,
      label: label || "Spotify",
    };
  }

  // Direct video files
  if (u.match(/\.(mp4|webm|mov|avi|mkv)(\?|$)/)) {
    return { type: "video", url, embedUrl: url, label: label || "Video" };
  }

  // Direct audio files
  if (u.match(/\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/)) {
    return { type: "audio", url, embedUrl: url, label: label || "Audio" };
  }

  return { type: "link", url, embedUrl: null, label: label || "Link" };
}
