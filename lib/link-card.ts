// Renders a 1080x1920 link card with a QR code (1080x1920, Story-sized) on a
// plain <canvas> — no extra dependency beyond `qrcode` for the QR itself —
// then shares it with the native share sheet when the device supports sharing
// files, and falls back to downloading the PNG.
import QRCode from "qrcode";
import { THEMES, themeOrDefault, type ThemeId } from "./themes";
import { roundRect, wrapText } from "./share-card";

export type LinkCardInput = {
  username: string;
  prompt: string;
  bio: string;
  theme: ThemeId | string;
  origin: string;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The QR code could not be drawn."));
    img.src = src;
  });
}

async function drawLinkCard(input: LinkCardInput): Promise<HTMLCanvasElement> {
  const theme = THEMES[themeOrDefault(input.theme)];
  const link = `${input.origin}/${input.username}`;
  const qrDataUrl = await QRCode.toDataURL(link, {
    width: 640,
    margin: 1,
    color: { dark: "#1c1420", light: "#ffffff" },
  });
  const qrImg = await loadImage(qrDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  // Background: vertical gradient with soft decorative circles.
  const bg = ctx.createLinearGradient(0, 0, 0, 1920);
  bg.addColorStop(0, "#17101e");
  bg.addColorStop(0.55, theme.bg);
  bg.addColorStop(1, "#0c0a11");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(900, 260, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(140, 1650, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Brand.
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 54px 'Space Grotesk', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("ngl.", 80, 130);
  ctx.textAlign = "right";
  ctx.font = "700 28px 'DM Sans', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.fillText("SCAN ME", 1000, 122);
  ctx.textAlign = "left";

  // Avatar + handle.
  ctx.fillStyle = theme.bg2;
  ctx.beginPath();
  ctx.arc(140, 300, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#24111a";
  ctx.font = "700 58px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(input.username.slice(0, 1).toUpperCase(), 140, 320);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 46px 'Space Grotesk', sans-serif";
  ctx.fillText(`@${input.username}`, 225, 292);
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.font = "500 30px 'DM Sans', sans-serif";
  ctx.fillText("ask me anything", 225, 340);

  // Custom prompt, or the default invitation.
  const prompt = input.prompt.trim();
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 56px 'Space Grotesk', sans-serif";
  const promptLines = wrapText(ctx, prompt || "Send me an anonymous message.", 860);
  const promptStartY = 520;
  promptLines.slice(0, 5).forEach((line, i) => {
    ctx.fillText(line, 540, promptStartY + i * 72);
  });
  if (prompt && input.bio.trim()) {
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.font = "400 32px 'DM Sans', sans-serif";
    ctx.fillText(input.bio.trim().slice(0, 80), 540, promptStartY + Math.min(promptLines.length, 5) * 72 + 20);
  }
  ctx.textAlign = "left";

  // QR card.
  const qrSize = 620;
  const qrX = (1080 - qrSize) / 2;
  const qrY = 980;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, qrX, qrY, qrSize, qrSize, 40);
  ctx.fill();
  ctx.drawImage(qrImg, qrX + 30, qrY + 30, qrSize - 60, qrSize - 60);

  // Footer.
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = "500 30px 'DM Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Scan to send an anonymous message", 540, 1740);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 32px 'Space Grotesk', sans-serif";
  ctx.fillText("ngl.  •  link in bio", 540, 1792);
  ctx.textAlign = "left";

  return canvas;
}

export async function shareLinkCard(input: LinkCardInput): Promise<"shared" | "downloaded"> {
  const canvas = await drawLinkCard(input);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("The link card could not be created.");
  const file = new File([blob], `ngl-${input.username}-link.png`, { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: "My NGL link" });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
