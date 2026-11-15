// Renders a 1080x1920 Instagram-Story-sized card for one inbox message (plus
// the owner's reply, when there is one) on a plain <canvas> — no extra
// dependency beyond `qrcode` for the QR code — then shares it with the native
// share sheet when the device supports sharing files, and falls back to
// downloading the PNG.
//
// Story Studio: 6 templates (the card treatment) x 6 backgrounds (the
// backdrop), an optional CTA sticker pill, an optional QR code of the
// owner's link, and toggles to hide the username or the reply. Long
// messages are truncated to fit so content never overlaps the footer,
// and the webfonts are awaited before drawing so the card never renders
// in a fallback font.
import QRCode from "qrcode";
import { THEMES, themeOrDefault, type ThemeId } from "./themes";

export type CardStyle = "ngl" | "dark" | "bold" | "minimal" | "neon" | "paper";
export type CardFont = "dm" | "grotesk" | "caveat" | "playfair";
export type CardBackground = "dark" | "theme" | "sunset" | "ocean" | "neon" | "paper";
export type StickerKey = "none" | "ask" | "honest" | "curious" | "ama";

export type ShareCardInput = {
  username: string;
  message: string;
  reply: string | null;
  theme: ThemeId | string;
  style?: CardStyle;
  background?: CardBackground;
  /** Message font for the card. Default "dm". */
  font?: CardFont;
  /** Literal sticker text to draw, or null for no sticker. */
  sticker?: string | null;
  /** Draw the QR code of the owner's link. Default true. */
  showQR?: boolean;
  /** Hide the @username (avatar becomes "?", handle becomes "anonymous"). Default false. */
  hideUsername?: boolean;
  /** Include the owner's reply bubble. Default true. */
  showReply?: boolean;
  /** Needed for the QR code. Defaults to "" (no QR drawn without it). */
  origin?: string;
};

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const test = `${line} ${word}`;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Cut lines down to `max`, appending an ellipsis to the last kept line. */
function fitLines(lines: string[], max: number): string[] {
  if (lines.length <= max) return lines;
  const cut = lines.slice(0, Math.max(1, max));
  cut[cut.length - 1] = `${cut[cut.length - 1]}…`;
  return cut;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The QR code could not be drawn."));
    img.src = src;
  });
}

type Template = {
  bubble: string;
  bubbleText: string;
  label: string;
  replyBg: string;
  replyText: string;
  replyLabel: string;
  /** Gradient header strip above the bubble (the NGL signature). */
  headerStrip: boolean;
  /** Neon templates stroke their bubbles in pink. */
  neonBorder: boolean;
  avatarBg: string;
  avatarText: string;
};

function templateFor(style: CardStyle, theme: { bg: string; bg2: string; accent: string }): Template {
  switch (style) {
    case "ngl":
      return {
        bubble: "#ffffff",
        bubbleText: "#111111",
        label: "#ff5e8a",
        replyBg: "#fff0f4",
        replyText: "#24111a",
        replyLabel: "#ff5e8a",
        headerStrip: true,
        neonBorder: false,
        avatarBg: "#ff5e8a",
        avatarText: "#ffffff",
      };
    case "bold":
      return {
        bubble: "rgba(255,255,255,.96)",
        bubbleText: "#1c1420",
        label: theme.bg,
        replyBg: "rgba(12,10,17,.55)",
        replyText: "#ffffff",
        replyLabel: "#ffffff",
        headerStrip: false,
        neonBorder: false,
        avatarBg: theme.bg2,
        avatarText: "#24111a",
      };
    case "minimal":
      return {
        bubble: "rgba(255,255,255,.07)",
        bubbleText: "#f3edf6",
        label: theme.accent,
        replyBg: "rgba(255,255,255,.06)",
        replyText: "#f3edf6",
        replyLabel: "#ffffff",
        headerStrip: false,
        neonBorder: false,
        avatarBg: theme.bg2,
        avatarText: "#24111a",
      };
    case "neon":
      return {
        bubble: "rgba(255,255,255,.06)",
        bubbleText: "#ffffff",
        label: "#ff7ce5",
        replyBg: "rgba(255,92,246,.10)",
        replyText: "#ffffff",
        replyLabel: "#ff7ce5",
        headerStrip: false,
        neonBorder: true,
        avatarBg: "#ff5e8a",
        avatarText: "#ffffff",
      };
    case "paper":
      return {
        bubble: "#fffdf6",
        bubbleText: "#24111a",
        label: "#b3541e",
        replyBg: "#f3ead8",
        replyText: "#24111a",
        replyLabel: "#b3541e",
        headerStrip: false,
        neonBorder: false,
        avatarBg: "#24111a",
        avatarText: "#f7f3ea",
      };
    case "dark":
    default:
      return {
        bubble: "rgba(255,255,255,.07)",
        bubbleText: "#f3edf6",
        label: theme.accent,
        replyBg: "rgba(255,255,255,.06)",
        replyText: "#f3edf6",
        replyLabel: "#ffffff",
        headerStrip: false,
        neonBorder: false,
        avatarBg: theme.bg2,
        avatarText: "#24111a",
      };
  }
}

/** Whether the background is dark (light ink) or light (dark ink). */
function backgroundIsDark(bg: CardBackground, themeId: string): boolean {
  if (bg === "paper") return false;
  if (bg === "theme" && themeId === "mint") return false;
  return true;
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: CardBackground,
  theme: { bg: string; bg2: string; accent: string },
) {
  const W = 1080;
  const H = 1920;
  const linear = (x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  switch (bg) {
    case "theme":
      linear(0, 0, W, H, [
        [0, theme.bg],
        [1, theme.bg2],
      ]);
      break;
    case "sunset":
      linear(0, 0, W, H, [
        [0, "#ff5e8a"],
        [1, "#ff8a3d"],
      ]);
      break;
    case "ocean":
      linear(0, 0, W, H, [
        [0, "#8b5cf6"],
        [1, "#3b82f6"],
      ]);
      break;
    case "neon":
      ctx.fillStyle = "#0a0614";
      ctx.fillRect(0, 0, W, H);
      glow(900, 300, 520, "rgba(255,46,166,.55)");
      glow(140, 1620, 560, "rgba(139,92,246,.5)");
      glow(540, 960, 420, "rgba(255,94,138,.28)");
      break;
    case "paper":
      ctx.fillStyle = "#f7f3ea";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(36,17,26,.05)";
      for (let y = 240; y < H; y += 160) ctx.fillRect(0, y, W, 2);
      glow(900, 260, 420, "rgba(232,221,200,.9)");
      break;
    case "dark":
    default:
      linear(0, 0, 0, H, [
        [0, "#17101e"],
        [0.55, "#17141d"],
        [1, "#0c0a11"],
      ]);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(900, 260, 260, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(140, 1650, 300, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
  }
}

async function drawCard(input: ShareCardInput): Promise<HTMLCanvasElement> {
  const theme = THEMES[themeOrDefault(input.theme)];
  const themeId = themeOrDefault(input.theme);
  const style = input.style ?? "ngl";
  const background = input.background ?? "dark";
  const font = input.font ?? "dm";
  const msgFamily =
    font === "grotesk" ? "'Space Grotesk', sans-serif"
    : font === "caveat" ? "'Caveat', cursive"
    : font === "playfair" ? "'Playfair Display', serif"
    : "'DM Sans', sans-serif";
  const msgSize = style === "bold" ? 52 : font === "caveat" ? 56 : 44;
  const msgLine = style === "bold" ? 72 : font === "caveat" ? 68 : 62;
  const replySize = font === "caveat" ? 50 : 44;
  const replyLine = font === "caveat" ? 64 : 62;
  const showQR = input.showQR ?? true;
  const hideUsername = input.hideUsername ?? false;
  const showReply = input.showReply ?? true;
  const tpl = templateFor(style, theme);
  const bgDark = backgroundIsDark(background, themeId);
  const ink = bgDark ? "#ffffff" : "#24111a";
  const inkSoft = bgDark ? "rgba(255,255,255,.75)" : "rgba(36,17,26,.65)";

  // QR code first (async) so the rest of the draw stays synchronous.
  let qrImg: HTMLImageElement | null = null;
  if (showQR && input.origin) {
    try {
      const link = `${input.origin.replace(/\/$/, "")}/${input.username}`;
      const qrDataUrl = await QRCode.toDataURL(link, {
        width: 380,
        margin: 0,
        color: { dark: "#1c1420", light: "#ffffff" },
      });
      qrImg = await loadImage(qrDataUrl);
    } catch {
      qrImg = null;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  drawBackground(ctx, background, theme);

  // Brand.
  ctx.fillStyle = ink;
  ctx.font = "700 54px 'Space Grotesk', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("ngl.", 80, 130);
  ctx.textAlign = "right";
  ctx.font = "700 28px 'DM Sans', sans-serif";
  ctx.fillStyle = inkSoft;
  ctx.fillText("ANONYMOUS", 1000, 122);
  ctx.textAlign = "left";

  // Avatar + handle.
  ctx.fillStyle = tpl.avatarBg;
  ctx.beginPath();
  ctx.arc(140, 300, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tpl.avatarText;
  ctx.font = "700 58px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(hideUsername ? "?" : input.username.slice(0, 1).toUpperCase(), 140, 320);
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  ctx.font = "700 46px 'Space Grotesk', sans-serif";
  ctx.fillText(hideUsername ? "anonymous" : `@${input.username}`, 225, 292);
  ctx.fillStyle = inkSoft;
  ctx.font = "500 30px 'DM Sans', sans-serif";
  ctx.fillText("someone asked anonymously", 225, 340);

  // NGL header strip.
  let y = 470;
  if (tpl.headerStrip) {
    const strip = ctx.createLinearGradient(80, 0, 1000, 0);
    strip.addColorStop(0, "#8b5cf6");
    strip.addColorStop(1, "#3b82f6");
    ctx.fillStyle = strip;
    roundRect(ctx, 80, 398, 920, 66, 33);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 30px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("send me anonymous messages!", 540, 441);
    ctx.textAlign = "left";
    y = 492;
  }

  // Content must end before the sticker + footer zone.
  const hasReply = showReply && !!input.reply?.trim();
  const hasSticker = !!input.sticker?.trim();
  const contentLimit = (qrImg ? 1560 : 1720) - (hasSticker ? 104 : 0);
  const msgFont = `500 ${msgSize}px ${msgFamily}`;

  // Message bubble (truncated to fit).
  ctx.font = msgFont;
  const allMessageLines = wrapText(ctx, input.message, 800);
  const replyReserve = hasReply ? 260 : 0;
  const maxMsgLines = Math.max(2, Math.floor((contentLimit - y - 90 - 36 - replyReserve) / msgLine));
  const messageLines = fitLines(allMessageLines, maxMsgLines);
  const messageHeight = 90 + messageLines.length * msgLine;
  ctx.fillStyle = tpl.bubble;
  roundRect(ctx, 80, y, 920, messageHeight, 36);
  ctx.fill();
  if (tpl.neonBorder) {
    ctx.strokeStyle = "#ff5e8a";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = tpl.label;
  ctx.font = "700 26px 'DM Sans', sans-serif";
  ctx.fillText("A N O N Y M O U S", 120, y + 62);
  ctx.fillStyle = tpl.bubbleText;
  ctx.font = msgFont;
  messageLines.forEach((line, i) => {
    ctx.fillText(line, 120, y + 132 + i * msgLine);
  });
  y += messageHeight + 36;

  // Owner reply, when there is one and it is enabled.
  if (hasReply) {
    ctx.font = `400 ${replySize}px ${msgFamily}`;
    const allReplyLines = wrapText(ctx, input.reply!.trim(), 800);
    const maxReplyLines = Math.max(1, Math.floor((contentLimit - y - 100) / replyLine));
    const replyLines = fitLines(allReplyLines, maxReplyLines);
    const replyHeight = 100 + replyLines.length * replyLine;
    ctx.fillStyle = tpl.replyBg;
    roundRect(ctx, 80, y, 920, replyHeight, 36);
    ctx.fill();
    if (tpl.neonBorder) {
      ctx.strokeStyle = "#ff5e8a";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.fillStyle = tpl.replyLabel;
    ctx.font = "700 26px 'DM Sans', sans-serif";
    ctx.fillText(`${hideUsername ? "anonymous" : `@${input.username}`}  REPLIED`, 120, y + 62);
    ctx.fillStyle = tpl.replyText;
    ctx.font = `400 ${replySize}px ${msgFamily}`;
    replyLines.forEach((line, i) => {
      ctx.fillText(line, 120, y + 132 + i * replyLine);
    });
    y += replyHeight + 36;
  }

  // CTA sticker pill.
  if (hasSticker) {
    const text = input.sticker!.trim();
    ctx.font = "700 32px 'DM Sans', sans-serif";
    const pillW = Math.min(920, ctx.measureText(text).width + 84);
    const pillX = (1080 - pillW) / 2;
    ctx.save();
    ctx.translate(540, y + 38);
    ctx.rotate(-0.035);
    const pill = ctx.createLinearGradient(-pillW / 2, 0, pillW / 2, 0);
    pill.addColorStop(0, "#ff5e8a");
    pill.addColorStop(1, "#ff8a3d");
    ctx.fillStyle = pill;
    roundRect(ctx, -pillW / 2, -38, pillW, 76, 38);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(text, 0, 12);
    ctx.restore();
    ctx.textAlign = "left";
    y += 104;
  }

  // Footer (with QR when available).
  if (qrImg) {
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 80, 1610, 220, 220, 24);
    ctx.fill();
    ctx.drawImage(qrImg, 95, 1625, 190, 190);
    ctx.fillStyle = inkSoft;
    ctx.font = "500 30px 'DM Sans', sans-serif";
    ctx.fillText("Send me anonymous messages", 330, 1700);
    ctx.fillStyle = ink;
    ctx.font = "700 32px 'Space Grotesk', sans-serif";
    ctx.fillText("ngl.  •  link in bio", 330, 1752);
  } else {
    ctx.fillStyle = inkSoft;
    ctx.font = "500 30px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Send me anonymous messages", 540, 1810);
    ctx.fillStyle = ink;
    ctx.font = "700 32px 'Space Grotesk', sans-serif";
    ctx.fillText("ngl.  •  link in bio", 540, 1862);
    ctx.textAlign = "left";
  }

  return canvas;
}

export async function renderStoryCardBlob(input: ShareCardInput): Promise<{ blob: Blob; filename: string }> {
  // Wait for the webfonts so the card never renders in a fallback font.
  try {
    const loads = [
      document.fonts.load("700 54px 'Space Grotesk'"),
      document.fonts.load("400 44px 'DM Sans'"),
      document.fonts.ready,
    ];
    if (input.font === "caveat") loads.push(document.fonts.load("500 56px 'Caveat'"));
    if (input.font === "playfair") loads.push(document.fonts.load("500 44px 'Playfair Display'"));
    if (input.font === "grotesk") loads.push(document.fonts.load("500 44px 'Space Grotesk'"));
    await Promise.all(loads);
  } catch {
    /* fall back to whatever fonts are available */
  }
  const canvas = await drawCard(input);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("The story image could not be created.");
  return { blob, filename: `ngl-${input.username}-story.png` };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function shareStoryCard(input: ShareCardInput): Promise<"shared" | "downloaded"> {
  const { blob, filename } = await renderStoryCardBlob(input);
  const file = new File([blob], filename, { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: "My NGL reply" });
    return "shared";
  }
  downloadBlob(blob, filename);
  return "downloaded";
}
