// --- 1. ПОЛУЧАЕМ ЭЛЕМЕНТЫ ---
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');
const silhouetteImg = document.getElementById('silhouette');
const timerDiv = document.getElementById('timer');
const gameOverScreen = document.getElementById('gameOverScreen');
const restartBtn = document.getElementById('restartBtn');

// --- 2. МАССИВ С УРОВНЯМИ (Математика позы Триконасана) ---
const levels = [
    {
        image: "pose1.png", // Твоя картинка с черным силуэтом позы
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
            const wristVerticallyAligned = Math.abs(leftWrist.x - leftShoulder.x) < (bodyScale * 0.5); // Немного увеличили допуск для теста
            const rightWristBelowHip = rightWrist.y > rightHip.y;
            const distWristToAnkle = distance(rightWrist, rightAnkle);
            const rightWristCloseToFoot = distWristToAnkle < (bodyScale * 2.0); // Увеличили допуск (с 1.5 до 2.0)
            const shouldersAlignedCorrectly = leftShoulder.y < rightShoulder.y;

            return wristAboveShoulder && wristVerticallyAligned && rightWristBelowHip && rightWristCloseToFoot && shouldersAlignedCorrectly;
        }
    }
];

// --- 3. УПРАВЛЕНИЕ ИГРОЙ ---
let currentLevelIndex = 0;
let timeLeft = 0;
let timerInterval;
let isGameOver = false;

function startLevel(index) {
    if (index >= levels.length) {
        timerDiv.innerText = "ПОБЕДА!";
        isGameOver = true;
        return;
    }
    currentLevelIndex = index;
    let levelConfig = levels[currentLevelIndex];
    silhouetteImg.src = levelConfig.image;
    timeLeft = levelConfig.timeAllowed;
    timerDiv.innerText = timeLeft;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        timerDiv.innerText = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            loseGame();
        }
    }, 1000);
}

function loseGame() {
    isGameOver = true;
    gameOverScreen.classList.remove('hidden');
}

restartBtn.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    isGameOver = false;
    startLevel(0);
});

// --- 4. НЕЙРОСЕТЬ MEDIAPIPE (С исправлением растягивания) ---
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
    // --- МАГИЯ ИСПРАВЛЕНИЯ РАСТЯГИВАНИЯ ---
    // Мы принудительно меняем ВНУТРЕННИЙ размер холста, чтобы он совпал с размером окна браузера
    if (canvasElement.width !== window.innerWidth || canvasElement.height !== window.innerHeight) {
        canvasElement.width = window.innerWidth;
        canvasElement.height = window.innerHeight;
    }
    // -------------------------------------

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Рисуем видео, растягивая его на весь холст (object-fit: cover аналог в JS)
    // Для этого используем сложный вариант drawImage
    let videoRatio = results.image.width / results.image.height;
    let canvasRatio = canvasElement.width / canvasElement.height;
    let sx, sy, sw, sh;

    if (canvasRatio > videoRatio) {
        // Холст шире, чем видео (обрезаем верх и низ видео)
        sw = results.image.width;
        sh = sw / canvasRatio;
        sx = 0;
        sy = (results.image.height - sh) / 2;
    } else {
        // Холст уже, чем видео (обрезаем бока видео)
        sh = results.image.height;
        sw = sh * canvasRatio;
        sx = (results.image.width - sw) / 2;
        sy = 0;
    }

    // Рисуем только обрезанную часть видео, растягивая её на весь холст
    canvasCtx.drawImage(results.image, sx, sy, sw, sh, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    if (!isGameOver && results.poseLandmarks) {
        let currentLevelConfig = levels[currentLevelIndex];
        let isPoseCorrect = currentLevelConfig.checkPose(results.poseLandmarks);
        if (isPoseCorrect) {
            clearInterval(timerInterval);
            startLevel(currentLevelIndex + 1);
        }
    }
});

// --- 5. ЗАПУСК КАМЕРЫ ---
// Убрали жесткие 640x480 при запуске, пусть камера даст максимальное разрешение
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await pose.send({image: videoElement});
  }
});
camera.start();

startLevel(0);
