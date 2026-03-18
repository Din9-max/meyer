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
            const leftShoulder = landmarks[11], rightShoulder = landmarks[12];
            const leftWrist = landmarks[15], rightWrist = landmarks[16]; 
            const leftHip = landmarks[23], rightHip = landmarks[24];
            const rightAnkle = landmarks[28], rightFoot = landmarks[32];  

            const pointsToCheck = [leftShoulder, rightShoulder, leftWrist, rightWrist, leftHip, rightHip, rightAnkle, rightFoot];
            for (let i = 0; i < pointsToCheck.length; i++) {
                if (pointsToCheck[i].visibility < 0.5) return false; 
            }

            function distance(p1, p2) { return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)); }
            const bodyScale = (distance(leftShoulder, rightShoulder) + distance(leftHip, rightHip)) / 2;

            const wristAboveShoulder = leftWrist.y < leftShoulder.y;
            const wristVerticallyAligned = Math.abs(leftWrist.x - leftShoulder.x) < (bodyScale * 0.5);
            const rightWristBelowHip = rightWrist.y > rightHip.y;
            const rightWristCloseToFoot = distance(rightWrist, rightAnkle) < (bodyScale * 2.0);
            const shouldersAlignedCorrectly = leftShoulder.y < rightShoulder.y;

            return wristAboveShoulder && wristVerticallyAligned && rightWristBelowHip && rightWristCloseToFoot && shouldersAlignedCorrectly;
        }
    },
    {
        // УРОВЕНЬ 2: Уверенная А-стойка
        image: "pose2.png", 
        timeAllowed: 15,    
        checkPose: function(landmarks) {
            const leftShoulder = landmarks[11], rightShoulder = landmarks[12];
            const leftWrist = landmarks[15], rightWrist = landmarks[16];
            const leftHip = landmarks[23], rightHip = landmarks[24];
            const leftAnkle = landmarks[27], rightAnkle = landmarks[28];

            const pointsToCheck = [leftShoulder, rightShoulder, leftWrist, rightWrist, leftHip, rightHip, leftAnkle, rightAnkle];
            for (let i = 0; i < pointsToCheck.length; i++) {
                if (pointsToCheck[i].visibility < 0.5) return false;
            }

            // Плечи выше бедер
            const torsoUpright = (leftShoulder.y < leftHip.y) && (rightShoulder.y < rightHip.y);
            // Запястья ниже плеч
            const armsDown = (leftWrist.y > leftShoulder.y) && (rightWrist.y > rightShoulder.y);
            
            const anklesDistanceX = Math.abs(leftAnkle.x - rightAnkle.x);
            const hipsDistanceX = Math.abs(leftHip.x - rightHip.x);
            // Ноги расставлены (шире бедер)
            const legsApart = anklesDistanceX > (hipsDistanceX * 1.5);

            const wristsDistanceX = Math.abs(leftWrist.x - rightWrist.x);
            // Руки слегка отведены
            const armsSlightlyOut = wristsDistanceX > (hipsDistanceX * 1.2);

            return torsoUpright && armsDown && legsApart && armsSlightlyOut;
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
        levelIndicator.style.opacity = '0'; // Скрываем индикатор
        isGameOver = true;
        return;
    }
    
    currentLevelIndex = index;
    let levelConfig = levels[currentLevelIndex];
    
    // Обновляем UI
    levelIndicator.style.opacity = '1';
    levelIndicator.innerText = `Уровень ${currentLevelIndex + 1} из ${levels.length}`;
    silhouetteImg.src = levelConfig.image;
    timeLeft = levelConfig.timeAllowed;
    
    updateTimerDisplay();
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        
        // Звуковое сопровождение
        if (timeLeft > 0) {
            if (timeLeft <= 10) {
                playBeep(600, 0.15, 'triangle'); // Тревожный писк
            } else {
                playBeep(400, 0.1, 'sine');      // Спокойный тик
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
    playBeep(200, 0.5, 'sawtooth'); // Звук проигрыша
    gameOverScreen.classList.remove('hidden');
}

// --- 5. ОБРАБОТЧИКИ КНОПОК ---
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

// --- 6. НЕЙРОСЕТЬ MEDIAPIPE ---
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
    // Подгоняем размер холста под экран
    if (canvasElement.width !== window.innerWidth || canvasElement.height !== window.innerHeight) {
        canvasElement.width = window.innerWidth;
        canvasElement.height = window.innerHeight;
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Математика для растягивания видео без искажений пропорций (object-fit: cover)
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

    // Рисуем обрезанное видео на весь экран
    canvasCtx.drawImage(results.image, sx, sy, sw, sh, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    // Проверка позы
    if (gameStarted && !isGameOver && results.poseLandmarks) {
        let currentLevelConfig = levels[currentLevelIndex];
        let isPoseCorrect = currentLevelConfig.checkPose(results.poseLandmarks);
        
        if (isPoseCorrect) {
            clearInterval(timerInterval);
            
            // Победный звук (двойной дзинь)
            playBeep(800, 0.2, 'sine');
            setTimeout(() => playBeep(1000, 0.3, 'sine'), 150);
            
            // Переход на следующий уровень
            startLevel(currentLevelIndex + 1);
        }
    }
});

// --- 7. ЗАПУСК КАМЕРЫ ---
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await pose.send({image: videoElement});
  }
});
camera.start();
