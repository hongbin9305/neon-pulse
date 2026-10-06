// ===============================
// NEON PULSE
// 30 SECOND REACTION GAME
// ===============================

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


// ===============================
// GAME SETTINGS
// ===============================

const GAME_DURATION = 30000;

// 난이도별로 TAP 신호 유지 시간만 달라진다.
// 나머지 게임 조건은 동일하다.
const difficulties = {
  easy: 1000,
  normal: 700,
  hard: 450
};

let difficulty = "normal";
let signalWindow = difficulties.normal;


// ===============================
// GAME STATE
// ===============================

let gameState = "ready";

let score = 0;
let bestScore = 0;

let gameStartTime = 0;
let signalStartTime = 0;

let successes = 0;
let attempts = 0;

let reactionTimes = [];

let signalTimeout = null;
let missTimeout = null;
let gameLoop = null;

let inputLocked = false;

let soundEnabled = true;
let motionEnabled = true;


// ===============================
// LOCAL STORAGE
// ===============================

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
    // 저장할 수 없어도 게임은 계속 실행된다.
  }
}


// ===============================
// DISPLAY
// ===============================

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


// ===============================
// HISTORY
// ===============================

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

  // 최근 기록은 최대 20개만 유지한다.
  while (historyList.children.length > 20) {
    historyList.removeChild(historyList.lastElementChild);
  }
}


// ===============================
// SOUND
// ===============================

function playTone(frequency, duration = 0.08) {
  if (!soundEnabled) {
    return;
  }

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
    // 소리를 재생하지 못해도 게임에는 영향을 주지 않는다.
  }
}


// ===============================
// VISUAL STATE
// ===============================

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

  gameMessage.textContent =
    "신호가 켜질 때까지 기다리세요.";
}

function showSignal() {
  clearPulseClasses();

  pulseButton.classList.add("active-signal");

  gameStatus.textContent = "SIGNAL";
  pulseText.textContent = "TAP!";

  gameMessage.textContent =
    "NOW — 지금 반응하세요!";
}

function showSuccess(reactionTime, rating) {
  clearPulseClasses();

  pulseButton.classList.add("success");

  gameStatus.textContent = rating;
  pulseText.textContent = `${reactionTime}ms`;

  gameMessage.textContent =
    `${rating} · +${calculatePoints(reactionTime)} POINTS`;
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


// ===============================
// SCORING
// ===============================

function calculatePoints(reactionTime) {
  if (reactionTime < 200) {
    return 200;
  }

  if (reactionTime < 300) {
    return 150;
  }

  if (reactionTime < 400) {
    return 120;
  }

  return 100;
}

function getRating(reactionTime) {
  if (reactionTime < 200) {
    return "PERFECT";
  }

  if (reactionTime < 300) {
    return "GREAT";
  }

  return "GOOD";
}


// ===============================
// GAME FLOW
// ===============================

function startGame() {
  clearTimers();

  gameState = "playing";

  score = 0;
  successes = 0;
  attempts = 0;

  reactionTimes = [];

  inputLocked = false;

  gameStartTime = performance.now();

  updateScore();
  updateStats();

  timeElement.textContent = "30.0";

  gameStatus.textContent = "STARTED";
  pulseText.textContent = "WAIT";

  gameMessage.textContent =
    "집중하세요. 첫 번째 신호를 기다립니다.";

  showWaiting();

  scheduleNextSignal();

  gameLoop = setInterval(updateTimer, 50);
}


function updateTimer() {
  if (gameState !== "playing") {
    return;
  }

  const elapsed = performance.now() - gameStartTime;
  const remaining = Math.max(0, GAME_DURATION - elapsed);

  timeElement.textContent =
    (remaining / 1000).toFixed(1);

  if (remaining <= 0) {
    finishGame();
  }
}


function scheduleNextSignal() {
  if (gameState !== "playing") {
    return;
  }

  gameState = "waiting";
  inputLocked = false;

  showWaiting();

  // 다음 신호까지 1.2 ~ 2.2초 랜덤 대기
  const delay =
    1200 + Math.random() * 1000;

  signalTimeout = setTimeout(() => {
    activateSignal();
  }, delay);
}


function activateSignal() {
  if (
    gameState !== "waiting" &&
    gameState !== "playing"
  ) {
    return;
  }

  gameState = "signal";
  inputLocked = false;

  signalStartTime = performance.now();

  showSignal();
  playTone(880);

  missTimeout = setTimeout(() => {
    registerMiss();
  }, signalWindow);
}


// ===============================
// INPUT
// ===============================

function handleGameInput() {

  // READY 상태에서는 게임 시작
  if (gameState === "ready") {
    startGame();
    return;
  }

  // 게임 종료 후 다시 시작
  if (gameState === "finished") {
    startGame();
    return;
  }

  // 같은 순간 여러 입력이 들어와도
  // 한 번만 처리한다.
  if (inputLocked) {
    return;
  }


  // 신호 전에 누른 경우
  if (gameState === "waiting") {
    inputLocked = true;

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

    clearTimeout(signalTimeout);

    setTimeout(() => {
      if (gameState !== "finished") {
        scheduleNextSignal();
      }
    }, 700);

    return;
  }


  // 정상 반응
  if (gameState === "signal") {
    inputLocked = true;

    clearTimeout(missTimeout);

    const reactionTime =
      Math.round(performance.now() - signalStartTime);

    attempts += 1;
    successes += 1;

    reactionTimes.push(reactionTime);

    const points =
      calculatePoints(reactionTime);

    const rating =
      getRating(reactionTime);

    score += points;

    updateScore();
    updateStats();

    addHistory(
      `${String(attempts).padStart(2, "0")} · ${reactionTime}ms ✓`,
      true
    );

    showSuccess(
      reactionTime,
      rating
    );

    playTone(1250);

    setTimeout(() => {
      if (gameState !== "finished") {
        scheduleNextSignal();
      }
    }, 650);
  }
}


// ===============================
// MISS
// ===============================

function registerMiss() {
  if (
    gameState !== "signal" ||
    inputLocked
  ) {
    return;
  }

  inputLocked = true;

  attempts += 1;

  updateStats();

  addHistory(
    `${String(attempts).padStart(2, "0")} · MISS ×`,
    false
  );

  showFailure("MISS");

  playTone(140);

  setTimeout(() => {
    if (gameState !== "finished") {
      scheduleNextSignal();
    }
  }, 650);
}


// ===============================
// FINISH
// ===============================

function finishGame() {
  if (gameState === "finished") {
    return;
  }

  gameState = "finished";

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


// ===============================
// CLEAR TIMERS
// ===============================

function clearTimers() {
  clearTimeout(signalTimeout);
  clearTimeout(missTimeout);
  clearInterval(gameLoop);

  signalTimeout = null;
  missTimeout = null;
  gameLoop = null;
}


// ===============================
// DIFFICULTY
// ===============================

difficultyButtons.forEach((button) => {

  button.addEventListener("click", () => {

    // 게임 도중에는 난이도를 바꾸지 않는다.
    if (
      gameState !== "ready" &&
      gameState !== "finished"
    ) {
      return;
    }

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


// ===============================
// SOUND OPTION
// ===============================

soundToggle.addEventListener("click", () => {

  soundEnabled = !soundEnabled;

  soundToggle.textContent =
    soundEnabled
      ? "SOUND ON"
      : "SOUND OFF";

});


// ===============================
// MOTION OPTION
// ===============================

motionToggle.addEventListener("click", () => {

  motionEnabled = !motionEnabled;

  motionToggle.textContent =
    motionEnabled
      ? "MOTION ON"
      : "MOTION OFF";

  document.body.classList.toggle(
    "reduce-motion",
    !motionEnabled
  );

});


// ===============================
// MOUSE
// ===============================

pulseButton.addEventListener(
  "click",
  handleGameInput
);


// ===============================
// KEYBOARD
// ===============================

document.addEventListener("keydown", (event) => {

  if (event.code !== "Space") {
    return;
  }

  // Space를 길게 누르고 있을 때
  // 반복 입력되는 것을 막는다.
  if (event.repeat) {
    return;
  }

  // 버튼 자체에 포커스가 있을 때는
  // 브라우저 기본 click과 중복되지 않도록 한다.
  if (document.activeElement === pulseButton) {
    return;
  }

  event.preventDefault();

  handleGameInput();
});


// ===============================
// REDUCED MOTION
// ===============================

const reducedMotionPreference =
  window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

if (reducedMotionPreference.matches) {
  motionEnabled = false;

  motionToggle.textContent =
    "MOTION OFF";

  document.body.classList.add(
    "reduce-motion"
  );
}


// ===============================
// INITIALIZE
// ===============================

loadSavedData();

updateScore();
updateStats();

gameStatus.textContent = "READY";
pulseText.textContent = "START";
timeElement.textContent = "30.0";
