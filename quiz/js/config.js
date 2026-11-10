// CELEHub Quiz settings. Edit here.
window.QUIZ = {
  TURNSTILE_SITE_KEY: "0x4AAAAAAFpKqCM1A7KBd3mO",          // <-- paste the SITE key of the NEW Turnstile widget made for this project (public)
  CELEHUB_URL: "https://celehub.pages.dev/",   // where the "CELEHub" link goes
  // To add a topic: add it here AND in TOPICS in functions/_lib/quiz-core.js (same id), then redeploy.
  TOPICS: [
    { id: "hpge", name: "HPGE", full: "", icon: "bi-droplet-half",   tint: "#0891b2" },
    { id: "mstc", name: "MSTC", full: "", icon: "bi-rulers",         tint: "#4f46e5" },
    { id: "psad", name: "PSAD", full: "", icon: "bi-bricks",         tint: "#d97706" }
  ]
};
