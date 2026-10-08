// Shared default settings for the background worker, content script, and popup.
self.CU_DEFAULTS = {
  enabled: true,
  frequencyMode: "random", // "random" or "fixed"
  everyMinutes: 5,         // used when frequencyMode is "fixed"
  randomMin: 2,            // random mode range, in minutes
  randomMax: 15,
  size: 240,               // unicorn width in pixels
  speed: 7,                // seconds to cross the screen
  trail: true,             // sparkle trail behind the unicorn
  fireworks: true,
  fireworkCount: 23,
  excluded: []             // hostnames where the unicorn never flies
};
