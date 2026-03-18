// --- 1. ПОЛУЧАЕМ ЭЛЕМЕНТЫ СО СТРАНИЦЫ ---
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');
const silhouetteImg = document.getElementById('silhouette');
const timerDiv = document.getElementById('timer');
const gameOverScreen = document.getElementById('gameOverScreen');
const restartBtn = document.getElementById('restartBtn');

// --- 2. НАШ МАССИВ С УРОВНЯМИ (ПОЗАМИ) ---
const levels = [
    {
        image: "pose1.png", // Твоя картинка с черным силуэтом позы
        timeAllowed: 20,    // Даем 20 секунд (поза сложная)
        
        // Функция проверки: совпадает ли поза человека с картинкой
        checkPose: function(landmarks) {
            // Вытаскиваем нужные точки (номера из документации MediaPipe)
            const leftShoulder = landmarks[11];
            const rightShoulder = landmarks[12];
            const leftWrist = landmarks[15];  // Поднятая рука
            const rightWrist = landmarks[16]; // Опущенная рука
            const leftHip = landmarks[23];
            const rightHip = landmarks[24];
            const rightAnkle = landmarks[28]; // Опорная нога
            const rightFoot = landmarks[32];  // Стопа

            // Проверяем, видит ли вообще камера эти точки (надежность распознавания)
            const pointsToCheck = [leftShoulder, rightShoulder, leftWrist, rightWrist, leftHip, rightHip, rightAnkle, rightFoot];
            for (let i = 0; i < pointsToCheck.length; i++) {
                if (pointsToCheck[i].visibility < 0.5) {
                    return false; // Если хоть одну точку плохо видно, поза не засчитывается
                }
            }

            // Вспомогательная функция для расчета расстояния в 2D (на экране)
            function distance(p1, p2) {
                return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
            }

            // Считаем примерный размер тела человека в кадре (чтобы допуски работали для людей разного роста)
            const distShoulders = distance(leftShoulder, rightShoulder);
            const distHips = distance(leftHip, rightHip);
            const bodyScale = (distShoulders + distHips) / 2;

            // УСЛОВИЕ 1: Левое запястье выше левого плеча (Y идет сверху вниз, поэтому меньше = выше)
            const wristAboveShoulder = leftWrist.y < leftShoulder.y;
            
            // Левое запястье находится примерно над левым плечом (по вертикали)
            // Допуск: 40% от размера тела
            const wristVerticallyAligned = Math.abs(leftWrist.x - leftShoulder.x) < (bodyScale * 0.4);

            // УСЛОВИЕ 2: Правое запястье ниже правого бедра
            const rightWristBelowHip = rightWrist.y > rightHip.y;
            
            // Правое запястье тянется к правой стопе (расстояние между ними маленькое)
            const distWristToAnkle = distance(rightWrist, rightAnkle);
            const rightWristCloseToFoot = distWristToAnkle < (bodyScale * 1.5); // Допуск можно менять, если игра слишком строгая

            // УСЛОВИЕ 3: Корпус наклонен (левое плечо выше правого)
            const shouldersAlignedCorrectly = leftShoulder.y < rightShoulder.y;

            // Если ВСЕ условия выполняются (true), значит человек встал правильно!
            return wristAboveShoulder && wristVerticallyAligned && rightWristBelowHip && rightWristCloseToFoot && shouldersAlignedCorrectly;
        }
    }
    // Если захочешь добавить второй уровень, ставь тут запятую и пиши следующий блок {...}
];

// --- 3. ПЕРЕМЕННЫЕ ДЛЯ УПРАВЛЕНИЯ ИГРОЙ ---
let currentLevelIndex = 0;
let timeLeft = 0;
let timerInterval;
let isGameOver = false;

// --- 4. ЛОГИКА ИГРЫ ---

// Функция запуска конкретного уровня
function startLevel(index) {
    // Если уровни закончились — победа!
    if (index >= levels.length) {
        timerDiv.innerText = "ПОБЕДА!";
        isGameOver = true;
        return;
    }

    currentLevelIndex = index;
    let levelConfig = levels[currentLevelIndex];
    
    // Ставим нужную картинку
    silhouetteImg.src = levelConfig.image;
    
    // Настраиваем таймер
    timeLeft = levelConfig.timeAllowed;
    timerDiv.innerText = timeLeft;
    
    // Очищаем старый таймер и запускаем новый
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        timerDiv.innerText = timeLeft;
        
        // Если время вышло
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            loseGame();
        }
    }, 1000); // 1000 миллисекунд = 1 секунда
}

// Функция проигрыша
function loseGame() {
    isGameOver = true;
    gameOverScreen.classList.remove('hidden'); // Показываем экран "Game Over"
}

// Что делает кнопка "Попробовать снова"
restartBtn.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden'); // Прячем экран
    isGameOver = false;
    startLevel(0); // Начинаем игру с самого первого уровня
});

// --- 5. ПОДКЛЮЧЕНИЕ НЕЙРОСЕТИ MEDIAPIPE ---
const pose = new Pose({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
}});

pose.setOptions({
  modelComplexity: 1,      // Сложность модели (1 - оптимально для браузера)
  smoothLandmarks: true,   // Сглаживание движений
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

// Эта функция срабатывает каждый раз, когда камера выдает новый кадр
pose.onResults((results) => {
    // 1. Рисуем видео с камеры на холсте
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    // 2. Если игра идет и на кадре найден человек
    if (!isGameOver && results.poseLandmarks) {
        let currentLevelConfig = levels[currentLevelIndex];
        
        // Отправляем точки тела в нашу функцию проверки (из массива)
        let isPoseCorrect = currentLevelConfig.checkPose(results.poseLandmarks);
        
        // Если функция сказала "true" (поза верная)
        if (isPoseCorrect) {
            // Останавливаем текущий таймер
            clearInterval(timerInterval);
            // Запускаем следующий уровень (если он есть) или побеждаем
            startLevel(currentLevelIndex + 1);
        }
    }
});

// --- 6. ЗАПУСК КАМЕРЫ ---
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await pose.send({image: videoElement});
  },
  width: 640,
  height: 480
});

// Включаем камеру
camera.start();

// Запускаем первый уровень сразу после загрузки скрипта
startLevel(0);