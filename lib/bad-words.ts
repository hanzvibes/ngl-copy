// Minimal profanity filter for anonymous messages (Indonesian + English).
// Checked server-side in /api/messages before the message is stored, and
// client-side nowhere — the server is the authority. Deliberately a small,
// explicit list: clearly insulting/sexual words only, so ordinary words
// (anjing, babi, monyet — also animal names) are NOT blocked. Matching is
// whole-word after lowercasing, collapsing repeated letters (kontolll) and
// light leetspeak normalisation (k0ntol). This is a baseline, not perfect
// moderation: determined senders can still evade it, and owners can block
// a sender from the dashboard.
const BAD_WORDS = [
  // Indonesian
  "kontol", "memek", "pepek", "ngentot", "jancok", "jancuk", "bajingan",
  "bangsat", "brengsek", "goblok", "tolol", "bego", "kampret", "asu",
  "lonte", "pelacur", "perek", "bencong", "banci",
  // English
  "fuck", "shit", "bitch", "bastard", "dick", "pussy", "cunt", "whore",
  "slut", "asshole", "cock", "wank", "dickhead", "motherfucker",
];

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const pattern = new RegExp(
  `(^|[^a-z])(${BAD_WORDS.map(escapeRegExp).join("|")})([^a-z]|$)`,
  "i",
);

export function containsBadWord(text: string): boolean {
  const normalised = text
    .toLowerCase()
    .replace(/[0@]/g, (c) => (c === "0" ? "o" : "a"))
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/(.)\1{2,}/g, "$1");
  return pattern.test(normalised);
}
