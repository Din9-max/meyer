// --- 1. ИНИЦИАЛИЗАЦИЯ ЭЛЕМЕНТОВ ---
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');
const silhouetteImg = document.getElementById('silhouette');
const timerDiv = document.getElementById('timer');
const levelIndicator = document.getElementById('levelIndicator');

const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

// --- 2. ГЕНЕРАТОР ЗВУКА (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playBeep(frequency, duration, type = 'sine') {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

// --- 3. МАССИВ С УРОВНЯМИ (ПОЗАМИ) ---
const levels = [
    {
        // УРОВЕНЬ 1: Скрученный Треугольник
        image: "pose1.png",
        timeAllowed: 20,    
        checkPose: function(landmarks) {
            const ls = landmarks[11], rs = landmarks[12]; // Плечи
            const lw = landmarks[15], rw = landmarks[16]; // Запястья 
            const lh = landmarks[23], rh = landmarks[24]; // Бедра
            const ra = landmarks[28]; // Правая лодыжка

            const pointsToCheck = [ls, rs, lw, rw, lh, rh, ra];
            for (let i = 0; i < pointsToCheck.length; i++) {
                if (pointsToCheck[i].visibility < 0.5) return false; 
            }

            function distance2D(p1, p2) { return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)); }
            const bodyScale = (distance2D(ls, rs) + distance2D(lh, rh)) / 2;

            const wristAboveShoulder = lw.y < ls.y;
            const wristVerticallyAligned = Math.abs(lw.x - ls.x) < (bodyScale * 0.5);
            const rightWristBelowHip = rw.y > rh.y;
            const rightWristCloseToFoot = distance2D(rw, ra) < (bodyScale * 2.0);
            const shouldersAlignedCorrectly = ls.y < rs.y;

            return wristAboveShoulder && wristVerticallyAligned && rightWristBelowHip && rightWristCloseToFoot && shouldersAlignedCorrectly;
        }
    },
    {
        // УРОВЕНЬ 2: Уверенная стойка, КОРПУС ПОВЕРНУТ ВПРАВО
        image: "pose2.png", // <--- Здесь должна быть картинка стойки с легким поворотом
        timeAllowed: 15,    
        checkPose: function(landmarks) {
            const ls = landmarks[11], rs = landmarks[12]; // Плечи
            const lw = landmarks[15], rw = landmarks[16]; // Запястья
            const lh = landmarks[23], rh = landmarks[24]; // Бедра
            const la = landmarks[27], ra = landmarks[28]; // Лодыжки

            // 1. Базовая проверка видимости (чтобы все ключевые точки были в кадре)
            const pointsToCheck = [ls, rs, lw, rw, lh, rh, la, ra];
            for (let point of pointsToCheck) {
                if (point.visibility < 0.5) return false;
            }

            // 2. Базовая стойка (как на фото)
            // Спина прямая (плечи выше бедер)
            const torsoUpright = (ls.y < lh.y) && (rs.y < rh.y);
            // Руки опущены вниз (запястья ниже плеч)
            const armsDown = (lw.y > ls.y) && (rw.y > rs.y);
            // Ноги расставлены (расстояние между лодыжками по X больше, чем между бедрами)
            const legsApart = Math.abs(la.x - ra.x) > (Math.abs(lh.x - rh.x) * 1.5);
            // Руки разведены не слишком широко (допуск 1.3 * ширина бедер)
            const armsCorrectWidth = Math.abs(lw.x - rw.x) < (Math.abs(lh.x - rh.x) * 1.3);

            // 3. ПОВОРОТ КОРПУСА ВПРАВО (Ключевое изменение)
            // Сравниваем Z-координаты плеч. Z — это глубина (чем меньше, тем ближе к камере).
            // При повороте вправо ЛЕВОЕ плечо (11) должно быть ближе к камере,
            // а ПРАВОЕ плечо (12) — дальше.
            // Добавим допуск (0.05), чтобы избежать срабатывания на шум камеры.
            const turnedRight = (rs.z - ls.z) > 0.05;

            // Возвращаем true, только если выполнены ВСЕ условия
            return torsoUpright && armsDown && legsApart && armsCorrectWidth && turnedRight;
        }
    }
];

// --- 4. УПРАВЛЕНИЕ ИГРОЙ ---
let currentLevelIndex = 0;
let timeLeft = 0;
let timerInterval;
let isGameOver = false;
let gameStarted = false; 

function startLevel(index) {
    if (index >= levels.length) {
        timerDiv.innerText = "ПОБЕДА!";
        timerDiv.classList.remove('danger');
        levelIndicator.style.opacity = '0'; 
        isGameOver = true;
        return;
    }
    
    currentLevelIndex = index;
    let levelConfig = levels[currentLevelIndex];
    
    levelIndicator.style.opacity = '1';
    levelIndicator.innerText = `Уровень ${currentLevelIndex + 1} из ${levels.length}`;
    silhouetteImg.src = levelConfig.image;
    timeLeft = levelConfig.timeAllowed;
    
    updateTimerDisplay();
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        
        if (timeLeft > 0) {
            if (timeLeft <= 10) {
                playBeep(600, 0.15, 'triangle'); 
            } else {
                playBeep(400, 0.1, 'sine');      
            }
        }
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            loseGame();
        }
    }, 1000);
}

function updateTimerDisplay() {
    timerDiv.innerText = timeLeft;
    if (timeLeft <= 10) {
        timerDiv.classList.add('danger');
    } else {
        timerDiv.classList.remove('danger');
    }
}

function loseGame() {
    isGameOver = true;
    timerDiv.innerText = "0";
    playBeep(200, 0.5, 'sawtooth'); 
    gameOverScreen.classList.remove('hidden');
}

startBtn.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    startScreen.classList.add('hidden');
    gameStarted = true;
    startLevel(0);
});

restartBtn.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    isGameOver = false;
    startLevel(0);
});

// --- 5. НЕЙРОСЕТЬ MEDIAPIPE ---
const pose = new Pose({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
}});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

pose.onResults((results) => {
    if (canvasElement.width !== window.innerWidth || canvasElement.height !== window.innerHeight) {
        canvasElement.width = window.innerWidth;
        canvasElement.height = window.innerHeight;
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    let videoRatio = results.image.width / results.image.height;
    let canvasRatio = canvasElement.width / canvasElement.height;
    let sx, sy, sw, sh;

    if (canvasRatio > videoRatio) {
        sw = results.image.width;
        sh = sw / canvasRatio;
        sx = 0;
        sy = (results.image.height - sh) / 2;
    } else {
        sh = results.image.height;
        sw = sh * canvasRatio;
        sx = (results.image.width - sw) / 2;
        sy = 0;
    }

    canvasCtx.drawImage(results.image, sx, sy, sw, sh, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    if (gameStarted && !isGameOver && results.poseLandmarks) {
        let currentLevelConfig = levels[currentLevelIndex];
        let isPoseCorrect = currentLevelConfig.checkPose(results.poseLandmarks);
        
        if (isPoseCorrect) {
            clearInterval(timerInterval);
            
            playBeep(800, 0.2, 'sine');
            setTimeout(() => playBeep(1000, 0.3, 'sine'), 150);
            
            startLevel(currentLevelIndex + 1);
        }
    }
});

// --- 6. ЗАПУСК КАМЕРЫ ---
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await pose.send({image: videoElement});
  }
});
camera.start();
