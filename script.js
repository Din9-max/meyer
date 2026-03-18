const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');
const silhouetteImg = document.getElementById('silhouette');
const timerDiv = document.getElementById('timer');

const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

// --- ГЕНЕРАТОР ЗВУКА ---
// Создаем аудио-контекст для синтеза звуков
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playBeep(frequency, duration, type = 'sine') {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    
    // Делаем звук тихим и приятным
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

// --- МАССИВ С УРОВНЯМИ ---
const levels = [
    {
        image: "pose1.png",
        timeAllowed: 20,    
        checkPose: function(landmarks) {
            const leftShoulder = landmarks[11];
            const rightShoulder = landmarks[12];
            const leftWrist = landmarks[15];  
            const rightWrist = landmarks[16]; 
            const leftHip = landmarks[23];
            const rightHip = landmarks[24];
            const rightAnkle = landmarks[28]; 
            const rightFoot = landmarks[32];  

            const pointsToCheck = [leftShoulder, rightShoulder, leftWrist, rightWrist, leftHip, rightHip, rightAnkle, rightFoot];
            for (let i = 0; i < pointsToCheck.length; i++) {
                if (pointsToCheck[i].visibility < 0.5) return false; 
            }

            function distance(p1, p2) {
                return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
            }

            const distShoulders = distance(leftShoulder, rightShoulder);
            const distHips = distance(leftHip, rightHip);
            const bodyScale = (distShoulders + distHips) / 2;

            const wristAboveShoulder = leftWrist.y < leftShoulder.y;
            const wristVerticallyAligned = Math.abs(leftWrist.x - leftShoulder.x) < (bodyScale * 0.5);
            const rightWristBelowHip = rightWrist.y > rightHip.y;
            const distWristToAnkle = distance(rightWrist, rightAnkle);
            const rightWristCloseToFoot = distWristToAnkle < (bodyScale * 2.0);
            const shouldersAlignedCorrectly = leftShoulder.y < rightShoulder.y;

            return wristAboveShoulder && wristVerticallyAligned && rightWristBelowHip && rightWristCloseToFoot && shouldersAlignedCorrectly;
        }
    }
];

// --- УПРАВЛЕНИЕ ИГРОЙ ---
let currentLevelIndex = 0;
let timeLeft = 0;
let timerInterval;
let isGameOver = false;
let gameStarted = false; // Флаг, началась ли игра после нажатия кнопки

function startLevel(index) {
    if (index >= levels.length) {
        timerDiv.innerText = "ПОБЕДА!";
        timerDiv.classList.remove('danger');
        isGameOver = true;
        return;
    }
    currentLevelIndex = index;
    let levelConfig = levels[currentLevelIndex];
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
                // Последние 10 секунд: тревожный звук (высокий тон)
                playBeep(600, 0.15, 'triangle');
            } else {
                // Обычный тик (спокойный тон)
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
    // Если 10 секунд и меньше, добавляем красный цвет
    if (timeLeft <= 10) {
        timerDiv.classList.add('danger');
    } else {
        timerDiv.classList.remove('danger');
    }
}

function loseGame() {
    isGameOver = true;
    timerDiv.innerText = "0";
    // Звук проигрыша (низкий гудок)
    playBeep(200, 0.5, 'sawtooth');
    gameOverScreen.classList.remove('hidden');
}

// --- КНОПКИ ИНТЕРФЕЙСА ---

startBtn.addEventListener('click', () => {
    // Браузер требует клика для включения звука
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

// --- НЕЙРОСЕТЬ MEDIAPIPE ---
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

    // Проверяем позу, только если игра началась (нажали кнопку) и не проиграли
    if (gameStarted && !isGameOver && results.poseLandmarks) {
        let currentLevelConfig = levels[currentLevelIndex];
        let isPoseCorrect = currentLevelConfig.checkPose(results.poseLandmarks);
        if (isPoseCorrect) {
            clearInterval(timerInterval);
            // Победный приятный звук
            playBeep(800, 0.2, 'sine');
            setTimeout(() => playBeep(1000, 0.3, 'sine'), 150);
            
            startLevel(currentLevelIndex + 1);
        }
    }
});

// Запускаем только захват камеры (сама игра ждет нажатия кнопки "Начать")
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await pose.send({image: videoElement});
  }
});
camera.start();
