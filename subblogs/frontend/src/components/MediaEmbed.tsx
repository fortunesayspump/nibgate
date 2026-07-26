import { type EmbedInfo } from "@/lib/media";

export default function MediaEmbed({ info }: { info: EmbedInfo }) {
  if (info.type === "youtube" || info.type === "vimeo") {
    return (
      <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: "6px", marginBottom: "1.5rem" }}>
        <iframe
          src={info.embedUrl!}
          title={info.label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
        />
      </div>
    );
  }

  if (info.type === "soundcloud") {
    return (
      <div style={{ marginBottom: "1.5rem", borderRadius: "6px", overflow: "hidden" }}>
        <iframe
          src={info.embedUrl!}
          width="100%"
          height="166"
          scrolling="no"
          frameBorder="no"
          allow="autoplay"
          style={{ border: 0 }}
        />
      </div>
    );
  }

  if (info.type === "spotify") {
    return (
      <div style={{ marginBottom: "1.5rem", borderRadius: "6px", overflow: "hidden" }}>
        <iframe
          src={info.embedUrl!}
          width="100%"
          height="80"
          frameBorder="0"
          allow="encrypted-media"
          style={{ border: 0, borderRadius: "6px" }}
        />
      </div>
    );
  }

  if (info.type === "video") {
    return (
      <div style={{ marginBottom: "1.5rem", borderRadius: "6px", overflow: "hidden" }}>
        <video controls style={{ width: "100%", display: "block", borderRadius: "6px" }}>
          <source src={info.url} />
        </video>
      </div>
    );
  }

  if (info.type === "audio") {
    return (
      <div style={{ marginBottom: "1.5rem" }}>
        <audio controls style={{ width: "100%", borderRadius: "6px" }}>
          <source src={info.url} />
        </audio>
      </div>
    );
  }

  return null;
}
