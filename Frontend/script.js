
function runCommand(raw) {
  const command = raw.trim();
  const lower = command.toLowerCase();

  if (!command) return;

  terminalLine("$ " + command);

  // Website navigation commands
  const target = lower
    .replace(/^(open|go to|goto|launch|start)\s+/, "")
    .trim();

  const websites = {
    "google": "https://www.google.com",
    "google.com": "https://www.google.com",
    "youtube": "https://www.youtube.com",
    "youtube.com": "https://www.youtube.com",
    "gmail": "https://mail.google.com",
    "github": "https://github.com/allakirankumar2026/ai-agent-setup",
    "my github": "https://github.com/allakirankumar2026/ai-agent-setup",
    "jarvis": "https://allakirankumar2026.github.io/ai-agent-setup/Frontend/"
  };

  if (websites[target]) {
    window.open(websites[target], "_blank");
    terminalLine("[OPEN] Launching " + target.toUpperCase());
    return;
  }

  switch (lower) {
    case "help":
      terminalLine("NAVIGATION: open google | open youtube | open gmail | open github | open jarvis");
      terminalLine("SYSTEM: status | time | date | clear");
      terminalLine("VOICE: voice on | voice off");
      terminalLine("SECURITY: key reset");
      terminalLine("AI questions: use the transcript message box.");
      break;

    case "status":
      terminalLine("[SYS] UI ONLINE | NETWORK " +
        (navigator.onLine ? "CONNECTED" : "OFFLINE") +
        " | GEMINI " + (apiKey ? "KEY SAVED" : "KEY NEEDED"));
      break;

    case "time":
      terminalLine("[TIME] " + new Date().toLocaleTimeString());
      break;

    case "date":
      terminalLine("[DATE] " + new Date().toLocaleDateString());
      break;

    case "clear":
      terminalOutput.replaceChildren();
      terminalLine("[SYS] Console cleared.");
      break;

    case "voice on":
      voiceEnabled = true;
      $("soundToggle").textContent = "🔊";
      terminalLine("[VOICE] Speech output enabled.");
      break;

    case "voice off":
      voiceEnabled = false;
      $("soundToggle").textContent = "🔇";
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      terminalLine("[VOICE] Speech output muted.");
      break;

    case "key reset":
      apiKey = "";
      localStorage.removeItem(API_KEY_STORAGE);
      setGeminiState("KEY NEEDED");
      terminalLine("[KEY] Gemini key removed.");
      break;

    default:
      terminalLine("[ERR] Unknown command. Type help.");
  }
}
