// Random question prompts for the public send page, NGL-style. Shown when the
// sender taps the dice instead of staring at a blank box. Kept in one list so
// both the public page and any future surface share the same prompts.
export const RANDOM_QUESTIONS: string[] = [
  "Be honest, who do you have a crush on?",
  "What's the nicest thing someone has said about me?",
  "What's one thing you wish I knew?",
  "Rate my music taste from 1 to 10.",
  "What's your favourite memory of us?",
  "What should my next post be about?",
  "What's a secret talent you think I have?",
  "If we went on a trip tomorrow, where would we go?",
  "What's the funniest thing I've ever done?",
  "What do you think my dream job should be?",
  "Be real: what's my most annoying habit?",
  "What's one thing you're too shy to say to my face?",
  "Who in our friend group is the funniest?",
  "What's a song that reminds you of me?",
  "What would you do if you were me for a day?",
  "What's the best advice you've ever gotten?",
  "What food should I try next?",
  "What's something you've always wanted to ask me?",
  "Describe me in three words.",
  "What's your unpopular opinion?",
  "What's the last thing that made you laugh?",
  "If I started a YouTube channel, what should it be about?",
  "What's a goal you're working on right now?",
  "What's the kindest thing a stranger has done for you?",
];

// NGL-style game packs for the landing page: four prompt packs, each with
// its example questions, mirroring the games on ngl.link.
export type Game = { id: string; title: string; gradient: string; examples: string[] };

export const GAMES: Game[] = [
  {
    id: "ask",
    title: "ask me anything",
    gradient: "linear-gradient(135deg,#a78bff,#3b82f6)",
    examples: [
      "What's your biggest dream?",
      "If you could have any superpower, what would it be?",
      "What's your dream job?",
      "Who's your celebrity crush?",
    ],
  },
  {
    id: "nhie",
    title: "never have i ever",
    gradient: "linear-gradient(135deg,#ff5e8a,#ff8a3d)",
    examples: [
      "Never have I ever dyed my hair",
      "Never have I ever ghosted someone",
      "Never have I ever lied on a first date",
      "Never have I ever Googled myself.",
    ],
  },
  {
    id: "confess",
    title: "confessions",
    gradient: "linear-gradient(135deg,#f472b6,#a855f7)",
    examples: [
      "I pretend to drink coffee but it's just diet coke",
      "I failed all my uni exams",
      "I hate college parties",
      "I have a secret TikTok account",
    ],
  },
  {
    id: "words",
    title: "3 words",
    gradient: "linear-gradient(135deg,#34d399,#3b82f6)",
    examples: [
      "You're a genius, flawless, iconic",
      "You're bff, boujee, simp",
      "You're funny, sheesh, hype",
      "You're spicy, gorgeous, beautiful",
    ],
  },
];

export function pickRandomQuestion(current?: string): string {
  const pool = RANDOM_QUESTIONS.filter((q) => q !== current);
  const list = pool.length > 0 ? pool : RANDOM_QUESTIONS;
  return list[Math.floor(Math.random() * list.length)];
}

// Deterministic daily question: everyone sees the same prompt on the same
// day, and it changes automatically at midnight UTC. No cron or storage.
export function getDailyQuestion(date: Date = new Date()): string {
  const dayNumber = Math.floor(date.getTime() / 86_400_000);
  return RANDOM_QUESTIONS[dayNumber % RANDOM_QUESTIONS.length];
}
