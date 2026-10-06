// ==========================================
// NEON PULSE — 30 SECOND REACTION GAME
// ==========================================

const pulseButton = document.getElementById("pulseButton");
const pulseText = document.getElementById("pulseText");
const gameStatus = document.getElementById("gameStatus");
const gameMessage = document.getElementById("gameMessage");

const scoreElement = document.getElementById("score");
const timeElement = document.getElementById("time");
const bestScoreElement = document.getElementById("bestScore");

const averageReactionElement = document.getElementById("averageReaction");
const accuracyElement = document.getElementById("accuracy");
const successCountElement = document.getElementById("successCount");

const historyList = document.getElementById("historyList");

const difficultyButtons = document.querySelectorAll(".difficulty-btn");
const soundToggle = document.getElementById("soundToggle");
const motionToggle = document.getElementById("motionToggle");

// ==========================================
// SETTINGS
// ==========================================

const GAME_DURATION = 30000;

const difficulties = {
  easy: 1000,
  normal: 700,
  hard: 450
};

let difficulty = "normal";
let signalWindow = difficulties.normal;

// ==========================================
// STATE
// ==========================================

// ready / waiting / signal / feedback / finished
let phase = "ready";

// 30초 게임 자체가 진행 중인지 별도로 관리
let gameRunning = false;

let score = 0;
let bestScore = 0;

let gameStartTime = 0;
let signalStartTime = 0;

let successes = 0;
let attempts = 0;
let reactionTimes = [];

let signalTimeout = null;
let missTimeout = null;
let feedbackTimeout = null;
let gameLoop = null;

let inputLocked = false;

let soundEnabled = true;
let motionEnabled = true;

// ==========================================
// STORAGE
// ==========================================

function loadSavedData() {
  try {
    const savedBest = Number(localStorage.getItem("neonPulseBest"));

    if (Number.isFinite(savedBest) && savedBest >= 0) {
      bestScore = savedBest;
    } else {
      bestScore = 0;
    }
  } catch (error) {
    bestScore = 0;
  }

  updateBestScore();
}

function saveBestScore() {
  try {
    localStorage.setItem("neonPulseBest", String(bestScore));
  } catch (error) {
    // 저장 실패 시에도 게임은 계속 실행
  }
}

// ==========================================
// DISPLAY
// ==========================================

function formatScore(value) {
  return String(Math.max(0, value)).padStart(4, "0");
}

function updateScore() {
  scoreElement.textContent = formatScore(score);
}

function updateBestScore() {
  bestScoreElement.textContent = formatScore(bestScore);
}

function updateStats() {
  if (reactionTimes.length > 0) {
    const total = reactionTimes.reduce((sum, value) => sum + value, 0);
    const average = Math.round(total / reactionTimes.length);

    averageReactionElement.textContent = `${average}ms`;
  } else {
    averageReactionElement.textContent = "---";
  }

  if (attempts > 0) {
    const accuracy = Math.round((successes / attempts) * 100);
    accuracyElement.textContent = `${accuracy}%`;
  } else {
    accuracyElement.textContent = "---%";
  }

  successCountElement.textContent = `${successes} / ${attempts}`;
}

// ==========================================
// HISTORY
// ==========================================

function clearHistory() {
  historyList.innerHTML = `
    <p class="empty-history">
      아직 기록이 없습니다. 첫 번째 RUN을 시작하세요.
    </p>
  `;
}

function addHistory(text, successful) {
  const emptyHistory = historyList.querySelector(".empty-history");

  if (emptyHistory) {
    emptyHistory.remove();
  }

  const item = document.createElement("div");

  item.className = successful
    ? "history-item success-log"
    : "history-item fail-log";

  item.textContent = text;

  historyList.prepend(item);

  while (historyList.children.length > 20) {
    historyList.removeChild(historyList.lastElementChild);
  }
}

// ==========================================
// SOUND
// ==========================================

function playTone(frequency, duration = 0.08) {
  if (!soundEnabled) return;

  try {
    const AudioContext =
      window.AudioContext || window.webkitAudioContext;

    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.05, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + duration
    );

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();
    oscillator.stop(context.currentTime + duration);

    oscillator.addEventListener("ended", () => {
      context.close();
    });
  } catch (error) {
    // 소리 오류가 게임을 중단시키지 않음
  }
}

// ==========================================
// VISUAL STATES
// ==========================================

function clearPulseClasses() {
  pulseButton.classList.remove(
    "waiting",
    "active-signal",
    "success",
    "fail"
  );
}

function showWaiting() {
  clearPulseClasses();
  pulseButton.classList.add("waiting");

  gameStatus.textContent = "WAIT";
  pulseText.textContent = "WAIT";
  gameMessage.textContent = "신호가 켜질 때까지 기다리세요.";
}

function showSignal() {
  clearPulseClasses();
  pulseButton.classList.add("active-signal");

  gameStatus.textContent = "SIGNAL";
  pulseText.textContent = "TAP!";
  gameMessage.textContent = "NOW — 지금 반응하세요!";
}

function showSuccess(reactionTime, rating, points) {
  clearPulseClasses();
  pulseButton.classList.add("success");

  gameStatus.textContent = rating;
  pulseText.textContent = `${reactionTime}ms`;
  gameMessage.textContent = `${rating} · +${points} POINTS`;
}

function showFailure(type) {
  clearPulseClasses();
  pulseButton.classList.add("fail");

  gameStatus.textContent = "FAILED";
  pulseText.textContent = type;

  if (type === "EARLY") {
    gameMessage.textContent =
      "TOO EARLY · 신호가 켜진 뒤 반응하세요.";
  } else {
    gameMessage.textContent =
      "MISS · 조금 더 빠르게 반응하세요.";
  }
}

// ==========================================
// SCORE
// ==========================================

function calculatePoints(reactionTime) {
  if (reactionTime < 200) return 200;
  if (reactionTime < 300) return 150;
  if (reactionTime < 400) return 120;

  return 100;
}

function getRating(reactionTime) {
  if (reactionTime < 200) return "PERFECT";
  if (reactionTime < 300) return "GREAT";

  return "GOOD";
}

// ==========================================
// GAME
// ==========================================

function startGame() {
  clearTimers();

  gameRunning = true;
  phase = "waiting";

  score = 0;
  successes = 0;
  attempts = 0;
  reactionTimes = [];

  inputLocked = false;

  gameStartTime = performance.now();

  updateScore();
  updateStats();

  timeElement.textContent = "30.0";

  clearHistory();

  scheduleNextSignal();

  gameLoop = setInterval(updateTimer, 50);
}

function updateTimer() {
  if (!gameRunning) return;

  const elapsed = performance.now() - gameStartTime;
  const remaining = Math.max(0, GAME_DURATION - elapsed);

  timeElement.textContent = (remaining / 1000).toFixed(1);

  if (remaining <= 0) {
    finishGame();
  }
}

function scheduleNextSignal() {
  if (!gameRunning) return;

  clearTimeout(signalTimeout);
  clearTimeout(missTimeout);
  clearTimeout(feedbackTimeout);

  phase = "waiting";
  inputLocked = false;

  showWaiting();

  const delay = 1200 + Math.random() * 1000;

  signalTimeout = setTimeout(() => {
    if (gameRunning) {
      activateSignal();
    }
  }, delay);
}

function activateSignal() {
  if (!gameRunning || phase !== "waiting") return;

  phase = "signal";
  inputLocked = false;

  signalStartTime = performance.now();

  showSignal();
  playTone(880);

  missTimeout = setTimeout(() => {
    registerMiss();
  }, signalWindow);
}

// ==========================================
// INPUT
// ==========================================

function handleGameInput() {
  // 처음 시작
  if (phase === "ready") {
    startGame();
    return;
  }

  // 30초 종료 후 재시작
  if (phase === "finished") {
    startGame();
    return;
  }

  if (!gameRunning) return;

  // 결과 표시 중 입력 무시
  if (phase === "feedback") return;

  // 같은 신호에 중복 입력 방지
  if (inputLocked) return;

  // 신호 전에 누름
  if (phase === "waiting") {
    inputLocked = true;
    phase = "feedback";

    clearTimeout(signalTimeout);

    attempts += 1;
    score = Math.max(0, score - 50);

    updateScore();
    updateStats();

    addHistory(
      `${String(attempts).padStart(2, "0")} · EARLY ×`,
      false
    );

    showFailure("EARLY");
    playTone(180);

    feedbackTimeout = setTimeout(() => {
      scheduleNextSignal();
    }, 650);

    return;
  }

  // 정상 TAP
  if (phase === "signal") {
    inputLocked = true;
    phase = "feedback";

    clearTimeout(missTimeout);

    const reactionTime =
      Math.round(performance.now() - signalStartTime);

    attempts += 1;
    successes += 1;
    reactionTimes.push(reactionTime);

    const points = calculatePoints(reactionTime);
    const rating = getRating(reactionTime);

    score += points;

    updateScore();
    updateStats();

    addHistory(
      `${String(attempts).padStart(2, "0")} · ${reactionTime}ms ✓`,
      true
    );

    showSuccess(reactionTime, rating, points);
    playTone(1250);

    feedbackTimeout = setTimeout(() => {
      scheduleNextSignal();
    }, 650);
  }
}

// ==========================================
// MISS
// ==========================================

function registerMiss() {
  if (
    !gameRunning ||
    phase !== "signal" ||
    inputLocked
  ) {
    return;
  }

  inputLocked = true;
  phase = "feedback";

  attempts += 1;

  updateStats();

  addHistory(
    `${String(attempts).padStart(2, "0")} · MISS ×`,
    false
  );

  showFailure("MISS");
  playTone(140);

  feedbackTimeout = setTimeout(() => {
    scheduleNextSignal();
  }, 650);
}

// ==========================================
// FINISH
// ==========================================

function finishGame() {
  if (!gameRunning) return;

  gameRunning = false;
  phase = "finished";

  clearTimers();

  timeElement.textContent = "0.0";

  if (score > bestScore) {
    bestScore = score;
    saveBestScore();
    updateBestScore();
  }

  clearPulseClasses();

  gameStatus.textContent = "RUN COMPLETE";
  pulseText.textContent = "AGAIN";

  gameMessage.textContent =
    `FINAL SCORE ${score} · 클릭하거나 SPACE를 눌러 다시 시작`;

  playTone(660, 0.15);
}

// ==========================================
// TIMER CLEANUP
// ==========================================

function clearTimers() {
  clearTimeout(signalTimeout);
  clearTimeout(missTimeout);
  clearTimeout(feedbackTimeout);
  clearInterval(gameLoop);

  signalTimeout = null;
  missTimeout = null;
  feedbackTimeout = null;
  gameLoop = null;
}

// ==========================================
// DIFFICULTY
// ==========================================

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    // 플레이 중 난이도 변경 금지
    if (gameRunning) return;

    difficultyButtons.forEach((item) => {
      item.classList.remove("active");
    });

    button.classList.add("active");

    difficulty = button.dataset.level;
    signalWindow = difficulties[difficulty];

    gameMessage.textContent =
      `${difficulty.toUpperCase()} MODE · TAP 가능 시간 ${signalWindow}ms`;
  });
});

// ==========================================
// SOUND
// ==========================================

soundToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;

  soundToggle.textContent =
    soundEnabled ? "SOUND ON" : "SOUND OFF";
});

// ==========================================
// MOTION
// ==========================================

motionToggle.addEventListener("click", () => {
  motionEnabled = !motionEnabled;

  motionToggle.textContent =
    motionEnabled ? "MOTION ON" : "MOTION OFF";

  document.body.classList.toggle(
    "reduce-motion",
    !motionEnabled
  );
});

// ==========================================
// MOUSE
// ==========================================

pulseButton.addEventListener("click", handleGameInput);

// ==========================================
// KEYBOARD
// ==========================================

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;

  if (event.repeat) return;

  // START 원에 포커스가 있을 때는
  // 브라우저가 Space → click을 자체 처리하므로 중복 방지
  if (document.activeElement === pulseButton) {
    return;
  }

  event.preventDefault();
  handleGameInput();
});

// ==========================================
// SYSTEM REDUCED MOTION
// ==========================================

const reducedMotionPreference =
  window.matchMedia("(prefers-reduced-motion: reduce)");

if (reducedMotionPreference.matches) {
  motionEnabled = false;
  motionToggle.textContent = "MOTION OFF";
  document.body.classList.add("reduce-motion");
}

// ==========================================
// INITIALIZE
// ==========================================

loadSavedData();
updateScore();
updateStats();

phase = "ready";

gameStatus.textContent = "READY";
pulseText.textContent = "START";
timeElement.textContent = "30.0";
