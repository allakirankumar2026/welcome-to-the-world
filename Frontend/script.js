(() => {
  "use strict";

  // J.A.R.V.I.S Command Engine v3.4 (fixed)
  // Browser-side commands only. This is not an Android/Linux/Windows shell.

  const $ = (id) => document.getElementById(id);
  const API_KEY_STORAGE = "jarvis_key";
  const MEMORY_STORAGE = "jarvis_local_memories";
  const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-flash-latest"];
  const SPEECH_LANGUAGE = "en-US"; // Change to te-IN for Telugu speech recognition.

  const chatLog = $("chatLog");
  const messageInput = $("messageInput");
  const terminalOutput = $("terminalOutput");
  const terminalForm = $("terminalForm");
  const terminalInput = $("terminalInput");

  if (!chatLog || !messageInput || !terminalOutput || !terminalForm || !terminalInput) {
    console.error("J.A.R.V.I.S: Required HTML elements are missing. Check index.html IDs.");
    return;
  }

  let voiceEnabled = true;
  let recognition = null;
  let listening = false;
  let apiKey = localStorage.getItem(API_KEY_STORAGE) || "";

  function nowTime() {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function updateClock() {
    const now = new Date();
    if ($("heroClock")) {
      $("heroClock").textContent = now.toLocaleTimeString([], { hour12: false });
    }
    if ($("localTime")) {
      $("localTime").textContent = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
    }
  }

  updateClock();
  window.setInterval(updateClock, 1000);

  function terminalLine(text, kind = "") {
    const p = document.createElement("p");
    if (kind) p.className = kind;
    p.textContent = String(text);
    terminalOutput.appendChild(p);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }

  function setGeminiState(label, className = "state-wait") {
    const el = $("geminiState");
    if (!el) return;
    el.textContent = label;
    el.className = className;
  }

  function addMessage(who, text) {
    const wrapper = document.createElement("div");
    wrapper.className = "message " + (who === "YOU" ? "user" : "assistant");

    const tag = document.createElement("span");
    tag.className = "message-tag";
    tag.textContent = who;

    const paragraph = document.createElement("p");
    paragraph.textContent = String(text);

    const time = document.createElement("time");
    time.textContent = nowTime();

    wrapper.append(tag, paragraph, time);
    chatLog.appendChild(wrapper);
    chatLog.scrollTop = chatLog.scrollHeight;
    return paragraph;
  }

  function speak(text) {
    if (!voiceEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  function requestApiKey(force = false) {
    if (!force && apiKey) return apiKey;

    const entered = window.prompt(
      "Enter your Gemini API key. It will be stored in this browser only, not in GitHub."
    );

    if (entered && entered.trim()) {
      apiKey = entered.trim();
      localStorage.setItem(API_KEY_STORAGE, apiKey);
      setGeminiState("KEY SAVED", "state-on");
      terminalLine("[KEY] Gemini key saved in this browser.", "terminal-success");
    } else if (force) {
      terminalLine("[KEY] Key was not changed.");
    }

    return apiKey;
  }

  // Do not interrupt the user with an API-key prompt on every first page load.
  if (apiKey) {
    setGeminiState("KEY SAVED", "state-on");
  } else {
    setGeminiState("KEY NEEDED");
  }

  $("keySettings")?.addEventListener("click", () => {
    const replace = window.confirm(
      "OK = enter or replace Gemini API key. Cancel = remove the saved key."
    );

    if (replace) {
      requestApiKey(true);
    } else {
      apiKey = "";
      localStorage.removeItem(API_KEY_STORAGE);
      setGeminiState("KEY NEEDED");
      terminalLine("[KEY] Saved key removed from this browser.");
    }
  });

  function renderNetworkStatus() {
    const el = $("networkStatus");
    if (!el) return;
    el.textContent = navigator.onLine ? "CONNECTED" : "OFFLINE";
    el.className = navigator.onLine ? "good" : "state-off";
  }

  renderNetworkStatus();

  window.addEventListener("online", () => {
    renderNetworkStatus();
    terminalLine("[NET] Browser is online.");
  });

  window.addEventListener("offline", () => {
    renderNetworkStatus();
    terminalLine("[NET] Browser is offline.", "terminal-error");
  });

  if (typeof navigator.getBattery === "function") {
    navigator.getBattery().then((battery) => {
      const renderBattery = () => {
        const el = $("batteryValue");
        if (el) {
          el.textContent =
            Math.round(battery.level * 100) + "%" + (battery.charging ? " CHG" : "");
        }
      };

      renderBattery();
      battery.addEventListener("levelchange", renderBattery);
      battery.addEventListener("chargingchange", renderBattery);
    }).catch(() => {
      if ($("batteryValue")) $("batteryValue").textContent = "N/A";
    });
  } else if ($("batteryValue")) {
    $("batteryValue").textContent = "N/A";
  }

  async function callGemini(promptText) {
    if (!apiKey) {
      requestApiKey(false);
      if (!apiKey) {
        throw new Error("Gemini API key missing. Tap the key icon to add it.");
      }
    }

    let lastError = new Error("No configured Gemini model responded.");

    for (const model of GEMINI_MODELS) {
      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" +
            encodeURIComponent(model) +
            ":generateContent?key=" +
            encodeURIComponent(apiKey),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 900
              }
            })
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message =
            data?.error?.message ||
            ("Gemini API returned HTTP " + response.status);
          lastError = new Error(model + ": " + message);

          if (
            /not found|unsupported|unavailable|temporar|high demand|rate|quota|deprecated/i.test(
              message
            )
          ) {
            continue;
          }
          throw lastError;
        }

        const answer = data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("")
          .trim();

        if (answer) return answer;
        lastError = new Error(model + ": Gemini returned an empty answer.");
      } catch (error) {
        lastError = error;
        if (
          /not found|unsupported|unavailable|temporar|high demand|rate|quota|deprecated/i.test(
            error.message
          )
        ) {
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  async function askGemini(text, renderInChat = true) {
    setGeminiState("THINKING");

    let replyNode = null;
    if (renderInChat) {
      replyNode = addMessage("J.A.R.V.I.S", "Thinking...");
    }

    try {
      const answer = await callGemini(text);
      if (replyNode) replyNode.textContent = answer;

      setGeminiState("ONLINE", "state-on");
      if (!renderInChat) {
        terminalLine("[J.A.R.V.I.S] " + answer, "terminal-success");
      }

      speak(answer);
      return answer;
    } catch (error) {
      if (replyNode) replyNode.textContent = "ERROR: " + error.message;
      setGeminiState(apiKey ? "CHECK KEY" : "KEY NEEDED");
      terminalLine("[GEMINI ERROR] " + error.message, "terminal-error");
      return null;
    }
  }

  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    addMessage("YOU", text);
    messageInput.value = "";
    askGemini(text, true);
  }

  $("sendButton")?.addEventListener("click", sendMessage);

  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendMessage();
  });

  $("clearChat")?.addEventListener("click", () => {
    chatLog.replaceChildren();
    addMessage("J.A.R.V.I.S", "Transcript cleared. New session ready.");
  });

  $("soundToggle")?.addEventListener("click", () => {
    voiceEnabled = !voiceEnabled;
    $("soundToggle").textContent = voiceEnabled ? "🔊" : "🔇";

    if (!voiceEnabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    terminalLine(
      "[VOICE] Speech output " + (voiceEnabled ? "enabled." : "muted.")
    );
  });

  // Notes are stored only in this browser; they are not synced to other devices.
  function getMemories() {
    try {
      const list = JSON.parse(localStorage.getItem(MEMORY_STORAGE) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveMemory(text) {
    const list = getMemories();
    list.push({ text, savedAt: new Date().toISOString() });
    localStorage.setItem(MEMORY_STORAGE, JSON.stringify(list.slice(-50)));
  }

  // Open a new tab synchronously from the terminal submit gesture.
  // Do not use the "noopener" window.open feature string here: some browsers
  // return null even when the tab opened, causing a false popup-blocked report.
  function openExternal(url, label) {
    const opened = window.open(url, "_blank");

    if (opened) {
      try {
        opened.opener = null;
      } catch (_) {
        // The browser may restrict access to the new browsing context.
      }
      terminalLine("[OPEN] " + label + " opened in a new tab.", "terminal-success");
    } else {
      terminalLine(
        "[OPEN] Your browser blocked the new tab. Allow pop-ups for this site, then try again. Address: " +
          url,
        "terminal-error"
      );
    }
  }

  const WEBSITE_MAP = {
    google: {
      url: "https://www.google.com",
      label: "Google"
    },
    "google.com": {
      url: "https://www.google.com",
      label: "Google"
    },
    youtube: {
      url: "https://www.youtube.com",
      label: "YouTube"
    },
    "youtube.com": {
      url: "https://www.youtube.com",
      label: "YouTube"
    },
    gmail: {
      url: "https://mail.google.com",
      label: "Gmail"
    },
    "google mail": {
      url: "https://mail.google.com",
      label: "Gmail"
    },
    github: {
      url: "https://github.com/allakirankumar2026/welcome-to-the-world",
      label: "GitHub repository"
    },
    "my github": {
      url: "https://github.com/allakirankumar2026/welcome-to-the-world",
      label: "GitHub repository"
    },
    jarvis: {
      url: "https://allakirankumar2026.github.io/welcome-to-the-world/Frontend/",
      label: "J.A.R.V.I.S dashboard"
    },
    "j.a.r.v.i.s": {
      url: "https://allakirankumar2026.github.io/welcome-to-the-world/Frontend/",
      label: "J.A.R.V.I.S dashboard"
    }
  };

  function normalizeNavigationTarget(value) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[.!?]+$/g, "")
      .replace(/\s+/g, " ");
  }

  function navigateTo(target) {
    const normalized = normalizeNavigationTarget(target);
    const site = WEBSITE_MAP[normalized];

    if (!site) {
      terminalLine(
        "[USAGE] Try: open Google | open YouTube | open Gmail | open GitHub | open JARVIS",
        "terminal-error"
      );
      return;
    }

    openExternal(site.url, site.label);
  }

  function showSystemInfo() {
    [
      "Browser: " + navigator.userAgent,
      "Language: " + (navigator.language || "unknown"),
      "Platform: " + (navigator.platform || "not exposed"),
      "Network: " + (navigator.onLine ? "online" : "offline"),
      "Screen: " + screen.width + " x " + screen.height,
      "Battery: " + ($("batteryValue")?.textContent || "N/A")
    ].forEach((line) => terminalLine("[INFO] " + line));

    terminalLine(
      "[INFO] Browser pages cannot read full device CPU/RAM or run native shell commands."
    );
  }

  function weatherDescription(code) {
    const labels = {
      0: "Clear sky",
      1: "Mainly clear",
      2: "Partly cloudy",
      3: "Overcast",
      45: "Fog",
      48: "Rime fog",
      51: "Light drizzle",
      53: "Drizzle",
      55: "Dense drizzle",
      56: "Freezing drizzle",
      57: "Heavy freezing drizzle",
      61: "Slight rain",
      63: "Moderate rain",
      65: "Heavy rain",
      66: "Freezing rain",
      67: "Heavy freezing rain",
      71: "Slight snow",
      73: "Moderate snow",
      75: "Heavy snow",
      80: "Rain showers",
      81: "Moderate rain showers",
      82: "Heavy rain showers",
      85: "Snow showers",
      86: "Heavy snow showers",
      95: "Thunderstorm",
      96: "Thunderstorm with hail",
      99: "Severe thunderstorm"
    };

    return labels[code] || "Unknown conditions";
  }

  async function fetchWeather(latitude, longitude, placeName) {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=" +
      encodeURIComponent(latitude) +
      "&longitude=" +
      encodeURIComponent(longitude) +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&forecast_days=1&timezone=auto";

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Weather service HTTP " + response.status);
    }

    const data = await response.json();
    const current = data.current;
    const daily = data.daily;

    terminalLine("[WEATHER] " + placeName, "terminal-success");
    terminalLine(
      "[NOW] " +
        weatherDescription(current.weather_code) +
        " · " +
        current.temperature_2m +
        "°C · feels like " +
        current.apparent_temperature +
        "°C"
    );
    terminalLine(
      "[DETAILS] Humidity " +
        current.relative_humidity_2m +
        "% · wind " +
        current.wind_speed_10m +
        " km/h"
    );

    if (daily?.temperature_2m_max && daily?.temperature_2m_min) {
      terminalLine(
        "[TODAY] High " +
          daily.temperature_2m_max[0] +
          "°C · low " +
          daily.temperature_2m_min[0] +
          "°C · rain chance " +
          (daily.precipitation_probability_max?.[0] ?? "N/A") +
          "%"
      );
    }

    terminalLine(
      "[SOURCE] Open-Meteo · updated " +
        new Date(current.time).toLocaleTimeString()
    );
  }

  async function weatherForCity(city) {
    terminalLine("[WEATHER] Looking up " + city + "...");

    try {
      const geoUrl =
        "https://geocoding-api.open-meteo.com/v1/search?name=" +
        encodeURIComponent(city) +
        "&count=1&language=en&format=json";

      const geoResponse = await fetch(geoUrl);
      if (!geoResponse.ok) {
        throw new Error("Location lookup HTTP " + geoResponse.status);
      }

      const geo = await geoResponse.json();
      const place = geo.results?.[0];

      if (!place) {
        throw new Error("Couldn't find that city. Try a nearby major city name.");
      }

      const label = [place.name, place.admin1, place.country]
        .filter(Boolean)
        .join(", ");

      await fetchWeather(place.latitude, place.longitude, label);
    } catch (error) {
      terminalLine("[WEATHER ERROR] " + error.message, "terminal-error");
    }
  }

  function weatherForCurrentLocation() {
    if (!navigator.geolocation) {
      terminalLine(
        "[WEATHER] Location isn't supported. Try: weather Kuala Lumpur",
        "terminal-error"
      );
      return;
    }

    terminalLine("[WEATHER] Requesting this device's location permission...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await fetchWeather(
            position.coords.latitude,
            position.coords.longitude,
            "Your current location"
          );
        } catch (error) {
          terminalLine("[WEATHER ERROR] " + error.message, "terminal-error");
        }
      },
      (error) => {
        terminalLine(
          "[WEATHER ERROR] Location unavailable: " +
            error.message +
            ". Try: weather Kuala Lumpur",
          "terminal-error"
        );
      },
      { timeout: 12000, maximumAge: 300000 }
    );
  }

  async function githubStatus() {
    terminalLine("[GITHUB] Checking public repository...");

    try {
      const response = await fetch(
        "https://api.github.com/repos/allakirankumar2026/welcome-to-the-world"
      );

      if (!response.ok) {
        throw new Error("GitHub API HTTP " + response.status);
      }

      const repo = await response.json();
      terminalLine(
        "[GITHUB] " +
          repo.full_name +
          " · " +
          (repo.private ? "private" : "public")
      );
      terminalLine(
        "[GITHUB] Branch: " +
          repo.default_branch +
          " · Stars: " +
          repo.stargazers_count
      );
      terminalLine(
        "[GITHUB] Last updated: " +
          new Date(repo.updated_at).toLocaleString()
      );
    } catch (error) {
      terminalLine("[GITHUB ERROR] " + error.message, "terminal-error");
    }
  }

  async function runCommand(raw) {
    const command = raw.trim();
    const lower = command.toLowerCase();

    if (!command) return;

    terminalLine("$ " + command);

    // Direct navigation. These cases run before any await so the browser
    // receives the open-tab request during the user's terminal interaction.
    const navigationMatch = lower.match(
      /^(?:(?:open|go to|goto|launch|start)\s+)?(.+?)$/
    );

    if (navigationMatch) {
      const possibleTarget = normalizeNavigationTarget(navigationMatch[1]);
      if (WEBSITE_MAP[possibleTarget]) {
        navigateTo(possibleTarget);
        return;
      }
    }

    // Friendly navigation forms and common aliases.
    const aliasMatch = lower.match(
      /^(?:please\s+)?(?:open|go to|goto|launch|start)\s+(.+)$/
    );

    if (aliasMatch && WEBSITE_MAP[normalizeNavigationTarget(aliasMatch[1])]) {
      navigateTo(aliasMatch[1]);
      return;
    }

    const naturalWeather = lower.match(
      /^(?:what is the )?weather(?: like)?(?: in| at)\s+(.+)\??$/i
    );

    if (naturalWeather) {
      const city = naturalWeather[1].replace(/[?]+$/, "").trim();
      terminalLine("[ALIAS] Weather lookup: " + city);
      await weatherForCity(city);
      return;
    }

    if (/^(?:what time is it|tell me the time)\??$/i.test(command)) {
      terminalLine("[TIME] " + new Date().toLocaleTimeString());
      return;
    }

    if (/^(?:check )?system status\??$/i.test(command)) {
      await runCommand("status");
      return;
    }

    if (lower === "help") {
      terminalLine("BASIC: help | status | time | date | clear | voice on | voice off | key reset");
      terminalLine("WEB: Google | open Google | open YouTube | open Gmail | open GitHub | open JARVIS");
      terminalLine("SEARCH: search <query> | search YouTube <query>");
      terminalLine("AI: ask <question> (uses your Gemini API key)");
      terminalLine("TOOLS: weather | weather today | weather <city> | github status | system info");
      terminalLine("MEMORY: remember <text> | read memory | forget memory");
      terminalLine("This is a browser command console, not an Android/Linux/Windows shell.");
      return;
    }

    if (lower === "status") {
      terminalLine(
        "[SYS] UI ONLINE · NETWORK " +
          (navigator.onLine ? "CONNECTED" : "OFFLINE") +
          " · GEMINI " +
          (apiKey ? "KEY SAVED" : "KEY NEEDED") +
          " · VOICE " +
          (recognition ? "SUPPORTED" : "CHECK BROWSER")
      );
      return;
    }

    if (lower === "time") {
      terminalLine("[TIME] " + new Date().toLocaleTimeString());
      return;
    }

    if (lower === "date") {
      terminalLine("[DATE] " + new Date().toLocaleDateString());
      return;
    }

    if (lower === "clear") {
      terminalOutput.replaceChildren();
      terminalLine("[SYS] Console cleared.");
      return;
    }

    if (lower === "voice on" || lower === "voice off") {
      voiceEnabled = lower.endsWith("on");
      if ($("soundToggle")) {
        $("soundToggle").textContent = voiceEnabled ? "🔊" : "🔇";
      }

      if (!voiceEnabled && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      terminalLine(
        "[VOICE] Speech output " + (voiceEnabled ? "enabled." : "muted.")
      );
      return;
    }

    if (lower === "key reset") {
      apiKey = "";
      localStorage.removeItem(API_KEY_STORAGE);
      setGeminiState("KEY NEEDED");
      terminalLine("[KEY] Gemini key removed from this browser.");
      return;
    }

    if (lower === "system info") {
      showSystemInfo();
      return;
    }

    if (
      lower === "weather" ||
      lower === "weather today" ||
      lower === "weather current"
    ) {
      weatherForCurrentLocation();
      return;
    }

    if (lower.startsWith("weather ")) {
      const city = command
        .slice(8)
        .trim()
        .replace(/^at\s+/i, "");

      if (!city || city.toLowerCase() === "today") {
        weatherForCurrentLocation();
      } else {
        await weatherForCity(city);
      }
      return;
    }

    if (lower === "github status") {
      await githubStatus();
      return;
    }

    if (lower.startsWith("search youtube ")) {
      const query = command.slice("search youtube ".length).trim();
      if (!query) {
        terminalLine("[USAGE] search youtube <query>");
        return;
      }

      openExternal(
        "https://www.youtube.com/results?search_query=" +
          encodeURIComponent(query),
        "YouTube search"
      );
      return;
    }

    if (lower.startsWith("search ")) {
      const query = command.slice(7).trim();
      if (!query) {
        terminalLine("[USAGE] search <query>");
        return;
      }

      openExternal(
        "https://www.google.com/search?q=" + encodeURIComponent(query),
        "Google search"
      );
      return;
    }

    if (lower.startsWith("open ")) {
      navigateTo(command.slice(5));
      return;
    }

    if (lower.startsWith("go to ")) {
      navigateTo(command.slice(6));
      return;
    }

    if (lower.startsWith("goto ")) {
      navigateTo(command.slice(5));
      return;
    }

    if (lower.startsWith("launch ")) {
      navigateTo(command.slice(7));
      return;
    }

    if (lower.startsWith("start ")) {
      navigateTo(command.slice(6));
      return;
    }

    if (lower.startsWith("ask ")) {
      const question = command.slice(4).trim();
      if (!question) {
        terminalLine("[USAGE] ask <question>");
        return;
      }

      terminalLine("[GEMINI] Processing...");
      await askGemini(question, false);
      return;
    }

    if (lower.startsWith("remember ")) {
      const note = command.slice(9).trim();
      if (!note) {
        terminalLine("[USAGE] remember <text>");
        return;
      }

      saveMemory(note);
      terminalLine("[MEMORY] Saved locally in this browser.", "terminal-success");
      return;
    }

    if (lower === "read memory") {
      const memories = getMemories();

      if (!memories.length) {
        terminalLine("[MEMORY] No saved notes.");
        return;
      }

      memories.forEach((item, index) => {
        terminalLine(
          "[" +
            (index + 1) +
            "] " +
            item.text +
            " · " +
            new Date(item.savedAt).toLocaleDateString()
        );
      });
      return;
    }

    if (lower === "forget memory") {
      localStorage.removeItem(MEMORY_STORAGE);
      terminalLine("[MEMORY] All J.A.R.V.I.S local notes cleared.");
      return;
    }

    terminalLine(
      "[ERR] Unknown command. Try: open Google, weather Kuala Lumpur, status, or help.",
      "terminal-error"
    );
  }

  terminalForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const command = terminalInput.value;
    terminalInput.value = "";

    await runCommand(command);
    terminalInput.focus();
  });

  $("clearTerminal")?.addEventListener("click", () => {
    terminalOutput.replaceChildren();
    terminalLine("[SYS] Console cleared.");
  });

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = SPEECH_LANGUAGE;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listening = true;
      if ($("micButton")) $("micButton").textContent = "● LISTENING...";
      if ($("voiceStatus")) $("voiceStatus").textContent = "SPEAK NOW";
    };

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (!transcript.trim()) return;

      addMessage("YOU", transcript);
      askGemini(transcript, true);
    };

    recognition.onerror = (event) => {
      if ($("voiceStatus")) {
        $("voiceStatus").textContent =
          "MIC ERROR: " + String(event.error || "UNKNOWN").toUpperCase();
      }

      terminalLine(
        "[MIC ERROR] " + (event.error || "Unknown speech error"),
        "terminal-error"
      );
    };

    recognition.onend = () => {
      listening = false;
      if ($("micButton")) $("micButton").textContent = "🎙 PUSH TO TALK";

      if ($("voiceStatus")?.textContent === "SPEAK NOW") {
        $("voiceStatus").textContent = "MIC READY";
      }
    };

    $("micButton")?.addEventListener("click", () => {
      if (listening) {
        recognition.stop();
      } else {
        try {
          recognition.start();
        } catch (_) {
          if ($("voiceStatus")) {
            $("voiceStatus").textContent = "MIC BUSY · TRY AGAIN";
          }
        }
      }
    });

    if ($("voiceStatus")) {
      $("voiceStatus").textContent = "MIC READY · " + SPEECH_LANGUAGE;
    }
  } else {
    if ($("micButton")) {
      $("micButton").disabled = true;
      $("micButton").textContent = "🎙 VOICE NOT SUPPORTED";
    }
    if ($("voiceStatus")) {
      $("voiceStatus").textContent = "TRY A SUPPORTED CHROME BROWSER";
    }
  }

  terminalLine("[SYS] J.A.R.V.I.S command engine v3.4 loaded.");
  terminalLine("[INFO] Type help to view available commands.");
  terminalLine("[INFO] Gemini integration is optional and requires your own API key.");
})();
