// Renders a 1080x1920 Instagram-Story-sized card for one inbox message (plus
// the owner's reply, when there is one) on a plain <canvas> — no extra
// dependency — then shares it with the native share sheet when the device
// supports sharing files, and falls back to downloading the PNG.
import { THEMES, themeOrDefault, type ThemeId } from "./themes";

export type CardStyle = "classic" | "minimal" | "bold";

export type ShareCardInput = {
  username: string;
  message: string;
  reply: string | null;
  theme: ThemeId | string;
  style?: CardStyle;
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

function drawCard(input: ShareCardInput): HTMLCanvasElement {
  const theme = THEMES[themeOrDefault(input.theme)];
  const style = input.style ?? "classic";
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  // Background per card style.
  if (style === "minimal") {
    ctx.fillStyle = "#16121d";
    ctx.fillRect(0, 0, 1080, 1920);
  } else if (style === "bold") {
    const bg = ctx.createLinearGradient(0, 0, 1080, 1920);
    bg.addColorStop(0, theme.bg);
    bg.addColorStop(1, theme.bg2);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1920);
  } else {
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
  }

  // Brand.
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 54px 'Space Grotesk', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("ngl.", 80, 130);
  ctx.textAlign = "right";
  ctx.font = "700 28px 'DM Sans', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.fillText("ANONYMOUS", 1000, 122);
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
  ctx.fillText("someone asked anonymously", 225, 340);

  // Message bubble.
  let y = 470;
  const msgFont = style === "bold" ? "500 52px 'DM Sans', sans-serif" : "400 44px 'DM Sans', sans-serif";
  const msgLine = style === "bold" ? 72 : 62;
  ctx.font = msgFont;
  const messageLines = wrapText(ctx, input.message, 800);
  const messageHeight = 90 + messageLines.length * msgLine;
  ctx.fillStyle = style === "minimal" ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.96)";
  roundRect(ctx, 80, y, 920, messageHeight, 36);
  ctx.fill();
  ctx.fillStyle = style === "minimal" ? theme.accent : theme.bg;
  ctx.font = "700 26px 'DM Sans', sans-serif";
  ctx.fillText("A N O N Y M O U S", 120, y + 62);
  ctx.fillStyle = style === "minimal" ? "#f3edf6" : "#1c1420";
  ctx.font = msgFont;
  messageLines.forEach((line, i) => {
    ctx.fillText(line, 120, y + 132 + i * msgLine);
  });
  y += messageHeight + 36;

  // Owner reply, when there is one.
  if (input.reply && input.reply.trim()) {
    ctx.fillStyle = style === "minimal" ? "rgba(255,255,255,.06)" : "rgba(12,10,17,.55)";
    ctx.font = "400 44px 'DM Sans', sans-serif";
    const replyLines = wrapText(ctx, input.reply.trim(), 800);
    const replyHeight = 100 + replyLines.length * 62;
    roundRect(ctx, 80, y, 920, replyHeight, 36);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 26px 'DM Sans', sans-serif";
    ctx.fillText(`@${input.username}  REPLIED`, 120, y + 62);
    ctx.font = "400 44px 'DM Sans', sans-serif";
    replyLines.forEach((line, i) => {
      ctx.fillText(line, 120, y + 132 + i * 62);
    });
    y += replyHeight + 36;
  }

  // Footer.
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = "500 30px 'DM Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Send me anonymous messages", 540, 1810);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 32px 'Space Grotesk', sans-serif";
  ctx.fillText("ngl.  •  link in bio", 540, 1862);
  ctx.textAlign = "left";

  return canvas;
}

export async function shareStoryCard(input: ShareCardInput): Promise<"shared" | "downloaded"> {
  const canvas = drawCard(input);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("The story image could not be created.");
  const file = new File([blob], `ngl-${input.username}-story.png`, { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: "My NGL reply" });
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
