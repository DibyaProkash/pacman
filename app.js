// Disable sensor-related warnings
p5.disableFriendlyErrors = true;

// Game settings
const TILE_SIZE = 20;
const MAP_WIDTH = 19;
const MAP_HEIGHT = 22;
const PLAYER_SPEED = 2;
const PLAYER_SIZE = TILE_SIZE;
const ENEMY_SIZE = TILE_SIZE;
const COLLISION_BUFFER = 2;
const POWER_UP_DURATION = 10000; // 10 seconds
const FRUIT_SPAWN_INTERVAL = 30000; // 30 seconds
const FRUIT_POINTS = { easy: 100, medium: 300, hard: 500 };
const GHOST_EAT_POINTS = 200;
const POSSIBLE_DIRECTIONS = ['up', 'down', 'left', 'right'];

let gameMode = null;
let modeSettings = {
    easy: { enemySpeed: 1, pathDensity: 0.98, dotRatio: 0.9, chaseProbability: 0.4, wallColor: [0, 128, 0], dotColor: [255, 255, 0] },
    medium: { enemySpeed: 1.8, pathDensity: 0.85, dotRatio: 0.75, chaseProbability: 0.65, wallColor: [128, 128, 128], dotColor: [0, 255, 255] },
    hard: { enemySpeed: 2.3, pathDensity: 0.7, dotRatio: 0.65, chaseProbability: 0.8, wallColor: [128, 0, 128], dotColor: [255, 192, 203] }
};

let dotSound;
let soundEnabled = true;
let map = null;
let totalDots = 0;
let player = {
    x: 9 * TILE_SIZE,
    y: 16 * TILE_SIZE,
    frame: 0,
    direction: 'right'
};
let enemies = [];
let score = 0;
let level = 1;
let lives = 3;
let dotsCollected = 0;
let gameOver = false;
let gameOverReason = '';
let keys = { up: false, down: false, left: false, right: false };
let lastCanMove = 'N/A';
let debugCollision = '';
let powerUpActive = false;
let powerUpTimer = 0;
let fruit = null;
let fruitTimer = 0;
let highScores = {
    easy: parseInt(localStorage.getItem('highScoreEasy')) || 0,
    medium: parseInt(localStorage.getItem('highScoreMedium')) || 0,
    hard: parseInt(localStorage.getItem('highScoreHard')) || 0
};

function preload() {
    // Initialize simple eating sound
    dotSound = new p5.Oscillator('sine');
    dotSound.freq(440);
    dotSound.amp(0.2);
}

function setup() {
    createCanvas(MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    textAlign(CENTER, CENTER);
    textSize(16);
    updateHighScoresDisplay();
    const modeModal = document.getElementById('mode-modal');
    modeModal.style.display = 'flex';
    setTimeout(() => modeModal.classList.add('show'), 10);
    // Setup keyboard navigation for modals
    setupModalNavigation();
}

function setupModalNavigation() {
    const modals = [document.getElementById('mode-modal'), document.getElementById('game-over-modal')];
    modals.forEach(modal => {
        const buttons = modal.querySelectorAll('button');
        buttons.forEach((button, index) => {
            button.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    const nextIndex = (index + 1) % buttons.length;
                    buttons[nextIndex].focus();
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const prevIndex = (index - 1 + buttons.length) % buttons.length;
                    buttons[prevIndex].focus();
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    button.click();
                }
            });
        });
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                if (modal.id === 'game-over-modal') {
                    restartGame();
                }
            }
        });
    });
}

function generateRandomMap(mode) {
    let settings = modeSettings[mode];
    let map = Array(MAP_HEIGHT).fill().map(() => Array(MAP_WIDTH).fill(1));
    let startX = 9, startY = 16;
    map[startY][startX] = 2; // Ensure Pac-Man's start is a dot

    // Place 4 power pellets in corners
    map[1][1] = 3; // Top-left
    map[1][MAP_WIDTH - 2] = 3; // Top-right
    map[MAP_HEIGHT - 2][1] = 3; // Bottom-left
    map[MAP_HEIGHT - 2][MAP_WIDTH - 2] = 3; // Bottom-right

    function carvePath(x, y) {
        map[y][x] = Math.random() < settings.dotRatio ? 2 : 0;
        let directions = [
            { dx: 0, dy: -2 },
            { dx: 0, dy: 2 },
            { dx: -2, dy: 0 },
            { dx: 2, dy: 0 }
        ].sort(() => Math.random() - 0.5);

        for (let dir of directions) {
            let nx = x + dir.dx;
            let ny = y + dir.dy;
            if (nx > 0 && nx < MAP_WIDTH - 1 && ny > 0 && ny < MAP_HEIGHT - 1 && map[ny][nx] === 1) {
                if (Math.random() < settings.pathDensity) {
                    map[y + dir.dy / 2][x + dir.dx / 2] = Math.random() < settings.dotRatio ? 2 : 0;
                    carvePath(nx, ny);
                }
            }
        }
    }

    carvePath(startX, startY);
    // Ensure Pac-Man's starting position remains a dot
    map[startY][startX] = 2;
    return map;
}

function getRandomEnemyPositions(map) {
    let validPositions = [];
    for (let y = 1; y < MAP_HEIGHT - 1; y++) {
        for (let x = 1; x < MAP_WIDTH - 1; x++) {
            if (map[y][x] !== 1 && !(x === 9 && y === 16)) {
                validPositions.push({ x: x * TILE_SIZE, y: y * TILE_SIZE });
            }
        }
    }
    validPositions.sort(() => Math.random() - 0.5);
    return validPositions.slice(0, 4);
}

function resetGameState(mode) {
    gameMode = mode;
    level = 1;
    lives = 3;
    map = generateRandomMap(gameMode);
    totalDots = 0;
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (map[y][x] === 2) totalDots++;
        }
    }
    let enemyPositions = getRandomEnemyPositions(map);
    enemies = [
        { x: enemyPositions[0].x, y: enemyPositions[0].y, color: '#ff0000', direction: 'right', type: 'blinky' },
        { x: enemyPositions[1].x, y: enemyPositions[1].y, color: '#ff69b4', direction: 'left', type: 'pinky' },
        { x: enemyPositions[2].x, y: enemyPositions[2].y, color: '#00b7eb', direction: 'up', type: 'inky' },
        { x: enemyPositions[3].x, y: enemyPositions[3].y, color: '#ffa500', direction: 'down', type: 'clyde' }
    ];
    player = {
        x: 9 * TILE_SIZE,
        y: 16 * TILE_SIZE,
        frame: 0,
        direction: 'right'
    };
    score = 0;
    dotsCollected = 0;
    gameOver = false;
    gameOverReason = '';
    keys = { up: false, down: false, left: false, right: false };
    lastCanMove = 'N/A';
    debugCollision = '';
    powerUpActive = false;
    powerUpTimer = 0;
    fruit = null;
    fruitTimer = 0;
    updateScore();
    updateLevel();
    updateLives();
    console.log('Game started with mode:', mode, 'level:', level);
    console.log('Initial map[16][9]:', map[16][9]);
    console.log('Initial enemy positions:', enemies.map(e => `(${e.x / TILE_SIZE}, ${e.y / TILE_SIZE})`));
}

function startGame(mode) {
    resetGameState(mode);
    document.getElementById('mode-modal').classList.remove('show');
    setTimeout(() => document.getElementById('mode-modal').style.display = 'none', 300);
}

function toggleTheme() {
    const body = document.body;
    const toggleButton = document.getElementById('theme-toggle');
    if (body.classList.contains('dark-theme')) {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
        toggleButton.textContent = 'Dark Theme';
        toggleButton.setAttribute('aria-label', 'Switch to dark theme');
    } else {
        body.classList.remove('light-theme');
        body.classList.add('dark-theme');
        toggleButton.textContent = 'Light Theme';
        toggleButton.setAttribute('aria-label', 'Switch to light theme');
    }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    const toggleButton = document.getElementById('sound-toggle');
    toggleButton.textContent = soundEnabled ? 'Mute Sound' : 'Unmute Sound';
    toggleButton.setAttribute('aria-label', soundEnabled ? 'Mute sound' : 'Unmute sound');
    if (!soundEnabled && dotSound) {
        dotSound.stop();
    }
}

function updateDebug() {
    let activeKeys = [];
    if (keys.up) activeKeys.push('Up');
    if (keys.down) activeKeys.push('Down');
    if (keys.left) activeKeys.push('Left');
    if (keys.right) activeKeys.push('Right');
    let tileX = Math.floor((player.x + PLAYER_SIZE / 2) / TILE_SIZE);
    let tileY = Math.floor((player.y + PLAYER_SIZE / 2) / TILE_SIZE);
    let mapValue = (tileX >= 0 && tileX < MAP_WIDTH && tileY >= 0 && tileY < MAP_HEIGHT && map) ? map[tileY][tileX] : 'N/A';
    let debugDiv = document.getElementById('debug');
    debugDiv.innerHTML = `Keys: ${activeKeys.length > 0 ? activeKeys.join(', ') : 'None'} | Can Move: ${lastCanMove} | Pos: (${player.x}, ${player.y}) | Tile: (${tileX}, ${tileY}) Map: ${mapValue} | ${debugCollision}`;
}

function updateScore() {
    let scoreDiv = document.getElementById('score');
    scoreDiv.innerHTML = `Score: ${score}`;
}

function updateLevel() {
    let levelDiv = document.getElementById('level');
    levelDiv.innerHTML = `Level: ${level}`;
}

function updateLives() {
    let livesDiv = document.getElementById('lives');
    livesDiv.innerHTML = `Lives: ${lives}`;
}

function draw() {
    if (gameMode === null || map === null || gameOver) {
        return;
    }

    background(0);

    let settings = modeSettings[gameMode];

    // Draw map with themed colors
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (map[y][x] === 1) {
                fill(settings.wallColor[0], settings.wallColor[1], settings.wallColor[2]);
                rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            } else if (map[y][x] === 2) {
                fill(settings.dotColor[0], settings.dotColor[1], settings.dotColor[2]);
                ellipse(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE / 4);
            } else if (map[y][x] === 3) {
                fill(255, 255, 255);
                ellipse(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE / 2);
            } else if (map[y][x] === 4) {
                // Draw fruit (e.g., cherry)
                fill(255, 0, 0);
                ellipse(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE / 2);
            }
        }
    }

    // Update player position
    let newX = player.x;
    let newY = player.y;

    if (keys.up && canMove('up', player.x, player.y)) {
        newY -= PLAYER_SPEED;
        lastCanMove = 'Yes';
        player.frame += 0.2;
        player.direction = 'up';
    } else if (keys.down && canMove('down', player.x, player.y)) {
        newY += PLAYER_SPEED;
        lastCanMove = 'Yes';
        player.frame += 0.2;
        player.direction = 'down';
    } else if (keys.left && canMove('left', player.x, player.y)) {
        newX -= PLAYER_SPEED;
        lastCanMove = 'Yes';
        player.frame += 0.2;
        player.direction = 'left';
    } else if (keys.right && canMove('right', player.x, player.y)) {
        newX += PLAYER_SPEED;
        lastCanMove = 'Yes';
        player.frame += 0.2;
        player.direction = 'right';
    } else if (keys.up || keys.down || keys.left || keys.right) {
        lastCanMove = 'No';
    }

    if (player.frame >= 2) player.frame = 0;

    player.x = newX;
    player.y = newY;

    // Update power-up timer
    if (powerUpActive) {
        powerUpTimer -= deltaTime;
        if (powerUpTimer <= 0) {
            powerUpActive = false;
        }
    }

    // Update fruit timer
    fruitTimer += deltaTime;
    if (fruitTimer >= FRUIT_SPAWN_INTERVAL && !fruit) {
        let validPositions = [];
        for (let y = 1; y < MAP_HEIGHT - 1; y++) {
            for (let x = 1; x < MAP_WIDTH - 1; x++) {
                if (map[y][x] === 0) {
                    validPositions.push({ x, y });
                }
            }
        }
        if (validPositions.length > 0) {
            let pos = validPositions[Math.floor(Math.random() * validPositions.length)];
            map[pos.y][pos.x] = 4;
            fruit = { x: pos.x, y: pos.y };
        }
        fruitTimer = 0;
    }

    // Update enemies with personalities
    enemies.forEach(enemy => {
        let directions = POSSIBLE_DIRECTIONS.filter(dir => canMoveEnemy(dir, enemy.x, enemy.y));
        if (directions.length > 0) {
            let targetDir = null;
            if (powerUpActive) {
                // Flee: move away from Pac-Man
                let maxDist = -Infinity;
                let bestDir = null;
                for (let dir of directions) {
                    let nx = enemy.x;
                    let ny = enemy.y;
                    if (dir === 'up') ny -= settings.enemySpeed * 0.5;
                    else if (dir === 'down') ny += settings.enemySpeed * 0.5;
                    else if (dir === 'left') nx -= settings.enemySpeed * 0.5;
                    else if (dir === 'right') nx += settings.enemySpeed * 0.5;
                    let dist = Math.abs(nx - player.x) + Math.abs(ny - player.y);
                    if (dist > maxDist) {
                        maxDist = dist;
                        bestDir = dir;
                    }
                }
                targetDir = bestDir;
            } else {
                if (enemy.type === 'blinky') {
                    // Direct chase
                    let minDist = Infinity;
                    let bestDir = null;
                    for (let dir of directions) {
                        let nx = enemy.x;
                        let ny = enemy.y;
                        if (dir === 'up') ny -= settings.enemySpeed;
                        else if (dir === 'down') ny += settings.enemySpeed;
                        else if (dir === 'left') nx -= settings.enemySpeed;
                        else if (dir === 'right') nx += settings.enemySpeed;
                        let dist = Math.abs(nx - player.x) + Math.abs(ny - player.y);
                        if (dist < minDist) {
                            minDist = dist;
                            bestDir = dir;
                        }
                    }
                    targetDir = bestDir;
                } else if (enemy.type === 'pinky') {
                    // Predict 4 tiles ahead
                    let targetX = player.x;
                    let targetY = player.y;
                    if (player.direction === 'up') targetY -= 4 * TILE_SIZE;
                    else if (player.direction === 'down') targetY += 4 * TILE_SIZE;
                    else if (player.direction === 'left') targetX -= 4 * TILE_SIZE;
                    else if (player.direction === 'right') targetX += 4 * TILE_SIZE;
                    let minDist = Infinity;
                    let bestDir = null;
                    for (let dir of directions) {
                        let nx = enemy.x;
                        let ny = enemy.y;
                        if (dir === 'up') ny -= settings.enemySpeed;
                        else if (dir === 'down') ny += settings.enemySpeed;
                        else if (dir === 'left') nx -= settings.enemySpeed;
                        else if (dir === 'right') nx += settings.enemySpeed;
                        let dist = Math.abs(nx - targetX) + Math.abs(ny - targetY);
                        if (dist < minDist) {
                            minDist = dist;
                            bestDir = dir;
                        }
                    }
                    targetDir = bestDir;
                } else if (enemy.type === 'inky') {
                    // Alternate chase and random
                    let bestDir = null;
                    if (Math.random() < 0.5) {
                        let minDist = Infinity;
                        for (let dir of directions) {
                            let nx = enemy.x;
                            let ny = enemy.y;
                            if (dir === 'up') ny -= settings.enemySpeed;
                            else if (dir === 'down') ny += settings.enemySpeed;
                            else if (dir === 'left') nx -= settings.enemySpeed;
                            else if (dir === 'right') nx += settings.enemySpeed;
                            let dist = Math.abs(nx - player.x) + Math.abs(ny - player.y);
                            if (dist < minDist) {
                                minDist = dist;
                                bestDir = dir;
                            }
                        }
                    } else {
                        bestDir = directions[Math.floor(Math.random() * directions.length)];
                    }
                    targetDir = bestDir;
                } else if (enemy.type === 'clyde') {
                    // Chase if far, scatter if close
                    let distToPlayer = Math.abs(enemy.x - player.x) + Math.abs(enemy.y - player.y);
                    let bestDir = null;
                    if (distToPlayer > 8 * TILE_SIZE) {
                        let minDist = Infinity;
                        for (let dir of directions) {
                            let nx = enemy.x;
                            let ny = enemy.y;
                            if (dir === 'up') ny -= settings.enemySpeed;
                            else if (dir === 'down') ny += settings.enemySpeed;
                            else if (dir === 'left') nx -= settings.enemySpeed;
                            else if (dir === 'right') nx += settings.enemySpeed;
                            let dist = Math.abs(nx - player.x) + Math.abs(ny - player.y);
                            if (dist < minDist) {
                                minDist = dist;
                                bestDir = dir;
                            }
                        }
                    } else {
                        let corners = [
                            { x: 1 * TILE_SIZE, y: 1 * TILE_SIZE },
                            { x: (MAP_WIDTH - 2) * TILE_SIZE, y: 1 * TILE_SIZE },
                            { x: 1 * TILE_SIZE, y: (MAP_HEIGHT - 2) * TILE_SIZE },
                            { x: (MAP_WIDTH - 2) * TILE_SIZE, y: (MAP_HEIGHT - 2) * TILE_SIZE }
                        ];
                        let targetCorner = corners[Math.floor(Math.random() * corners.length)];
                        let minDist = Infinity;
                        for (let dir of directions) {
                            let nx = enemy.x;
                            let ny = enemy.y;
                            if (dir === 'up') ny -= settings.enemySpeed;
                            else if (dir === 'down') ny += settings.enemySpeed;
                            else if (dir === 'left') nx -= settings.enemySpeed;
                            else if (dir === 'right') nx += settings.enemySpeed;
                            let dist = Math.abs(nx - targetCorner.x) + Math.abs(ny - targetCorner.y);
                            if (dist < minDist) {
                                minDist = dist;
                                bestDir = dir;
                            }
                        }
                    }
                    targetDir = bestDir;
                }
            }

            enemy.direction = targetDir || directions[Math.floor(Math.random() * directions.length)];

            // Move enemy
            let speed = powerUpActive ? settings.enemySpeed * 0.5 : settings.enemySpeed;
            if (enemy.direction === 'up') {
                enemy.y -= speed;
            } else if (enemy.direction === 'down') {
                enemy.y += speed;
            } else if (enemy.direction === 'left') {
                enemy.x -= speed;
            } else if (enemy.direction === 'right') {
                enemy.x += speed;
            }
        }
    });

    // Check for enemy collision
    enemies.forEach(enemy => {
        let corners = [
            { x: enemy.x + COLLISION_BUFFER, y: enemy.y + COLLISION_BUFFER },
            { x: enemy.x + ENEMY_SIZE - COLLISION_BUFFER - 1, y: enemy.y + COLLISION_BUFFER },
            { x: enemy.x + COLLISION_BUFFER, y: enemy.y + ENEMY_SIZE - COLLISION_BUFFER - 1 },
            { x: enemy.x + ENEMY_SIZE - COLLISION_BUFFER - 1, y: enemy.y + ENEMY_SIZE - COLLISION_BUFFER - 1 }
        ];
        for (let corner of corners) {
            if (Math.abs(corner.x - (player.x + PLAYER_SIZE / 2)) < PLAYER_SIZE / 2 &&
                Math.abs(corner.y - (player.y + PLAYER_SIZE / 2)) < PLAYER_SIZE / 2) {
                if (powerUpActive) {
                    // Eat ghost
                    score += GHOST_EAT_POINTS;
                    updateScore();
                    let validPositions = getRandomEnemyPositions(map);
                    enemy.x = validPositions[0].x;
                    enemy.y = validPositions[0].y;
                    enemy.direction = POSSIBLE_DIRECTIONS[Math.floor(Math.random() * POSSIBLE_DIRECTIONS.length)];
                } else {
                    lives--;
                    updateLives();
                    if (lives > 0) {
                        // Respawn Pac-Man
                        player.x = 9 * TILE_SIZE;
                        player.y = 16 * TILE_SIZE;
                        player.direction = 'right';
                        player.frame = 0;
                    } else {
                        gameOver = true;
                        gameOverReason = 'lose';
                        showModal();
                    }
                }
            }
        }
    });

    // Check for dot, power-up, or fruit collection
    let tileX = Math.floor((player.x + PLAYER_SIZE / 2) / TILE_SIZE);
    let tileY = Math.floor((player.y + PLAYER_SIZE / 2) / TILE_SIZE);
    if (tileX >= 0 && tileX < MAP_WIDTH && tileY >= 0 && tileY < MAP_HEIGHT) {
        if (map[tileY][tileX] === 2) {
            map[tileY][tileX] = 0;
            score += 10;
            dotsCollected++;
            if (soundEnabled && dotSound) {
                dotSound.start();
                dotSound.amp(0.2, 0);
                dotSound.amp(0, 0.2);
            }
            updateScore();
            if (dotsCollected === totalDots) {
                // Level up
                level++;
                map = generateRandomMap(gameMode);
                totalDots = 0;
                for (let y = 0; y < MAP_HEIGHT; y++) {
                    for (let x = 0; x < MAP_WIDTH; x++) {
                        if (map[y][x] === 2) totalDots++;
                    }
                }
                player.x = 9 * TILE_SIZE;
                player.y = 16 * TILE_SIZE;
                player.direction = 'right';
                player.frame = 0;
                let enemyPositions = getRandomEnemyPositions(map);
                enemies.forEach((enemy, index) => {
                    enemy.x = enemyPositions[index].x;
                    enemy.y = enemyPositions[index].y;
                    enemy.direction = ['right', 'left', 'up', 'down'][index];
                });
                dotsCollected = 0;
                fruit = null;
                fruitTimer = 0;
                powerUpActive = false;
                powerUpTimer = 0;
                modeSettings[gameMode].pathDensity = Math.max(0.5, modeSettings[gameMode].pathDensity - 0.05);
                modeSettings[gameMode].enemySpeed += 0.2;
                modeSettings[gameMode].chaseProbability = Math.min(0.95, modeSettings[gameMode].chaseProbability + 0.05);
                updateLevel();
            }
        } else if (map[tileY][tileX] === 3) {
            map[tileY][tileX] = 0;
            powerUpActive = true;
            powerUpTimer = POWER_UP_DURATION;
            score += 50;
            updateScore();
        } else if (map[tileY][tileX] === 4) {
            map[tileY][tileX] = 0;
            score += FRUIT_POINTS[gameMode];
            fruit = null;
            updateScore();
        }
    }

    // Draw Pac-Man with pulsating effect during power-up
    fill(255, 255, 0);
    let mouthAngle = Math.floor(player.frame) === 0 ? PI / 4 : PI / 8;
    let startAngle, endAngle;
    switch (player.direction) {
        case 'right':
            startAngle = mouthAngle;
            endAngle = TWO_PI - mouthAngle;
            break;
        case 'left':
            startAngle = PI + mouthAngle;
            endAngle = PI - mouthAngle;
            break;
        case 'up':
            startAngle = -PI / 2 + mouthAngle;
            endAngle = -PI / 2 - mouthAngle;
            break;
        case 'down':
            startAngle = PI / 2 + mouthAngle;
            endAngle = PI / 2 - mouthAngle;
            break;
    }
    let scaleFactor = powerUpActive ? 1 + 0.1 * Math.sin(millis() / 100) : 1;
    push();
    translate(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2);
    scale(scaleFactor);
    arc(0, 0, PLAYER_SIZE, PLAYER_SIZE, startAngle, endAngle, PIE);
    pop();

    // Draw enemies with animated eyes
    enemies.forEach(enemy => {
        push();
        translate(enemy.x + ENEMY_SIZE / 2, enemy.y + ENEMY_SIZE / 2);
        fill(powerUpActive ? '#00f' : enemy.color);
        arc(0, 0, ENEMY_SIZE, ENEMY_SIZE, PI, TWO_PI, CHORD);
        rect(-ENEMY_SIZE / 2, 0, ENEMY_SIZE, ENEMY_SIZE / 2);
        beginShape();
        vertex(-ENEMY_SIZE / 2, ENEMY_SIZE / 2);
        quadraticVertex(-ENEMY_SIZE / 3, ENEMY_SIZE * 0.75, 0, ENEMY_SIZE / 2);
        quadraticVertex(ENEMY_SIZE / 3, ENEMY_SIZE * 0.25, ENEMY_SIZE / 2, ENEMY_SIZE / 2);
        vertex(ENEMY_SIZE / 2, ENEMY_SIZE / 2);
        vertex(-ENEMY_SIZE / 2, ENEMY_SIZE / 2);
        endShape(CLOSE);
        // Eyes with direction-based pupils
        fill(255);
        ellipse(-ENEMY_SIZE / 4, -ENEMY_SIZE / 4, ENEMY_SIZE / 4, ENEMY_SIZE / 4);
        ellipse(ENEMY_SIZE / 4, -ENEMY_SIZE / 4, ENEMY_SIZE / 4, ENEMY_SIZE / 4);
        fill(0);
        let pupilOffsetX = 0, pupilOffsetY = 0;
        if (enemy.direction === 'right') pupilOffsetX = 2;
        else if (enemy.direction === 'left') pupilOffsetX = -2;
        else if (enemy.direction === 'up') pupilOffsetY = -2;
        else if (enemy.direction === 'down') pupilOffsetY = 2;
        ellipse(-ENEMY_SIZE / 4 + pupilOffsetX, -ENEMY_SIZE / 4 + pupilOffsetY, ENEMY_SIZE / 8, ENEMY_SIZE / 8);
        ellipse(ENEMY_SIZE / 4 + pupilOffsetX, -ENEMY_SIZE / 4 + pupilOffsetY, ENEMY_SIZE / 8, ENEMY_SIZE / 8);
        pop();
    });

    updateDebug();
}

function canMove(direction, x, y) {
    let newX = x;
    let newY = y;

    if (direction === 'up') {
        newY -= PLAYER_SPEED;
    } else if (direction === 'down') {
        newY += PLAYER_SPEED;
    } else if (direction === 'left') {
        newX -= PLAYER_SPEED;
    } else if (direction === 'right') {
        newX += PLAYER_SPEED;
    }

    let corners = [
        { x: newX + COLLISION_BUFFER, y: newY + COLLISION_BUFFER },
        { x: newX + PLAYER_SIZE - COLLISION_BUFFER - 1, y: newY + COLLISION_BUFFER },
        { x: newX + COLLISION_BUFFER, y: newY + PLAYER_SIZE - COLLISION_BUFFER - 1 },
        { x: newX + PLAYER_SIZE - COLLISION_BUFFER - 1, y: newY + PLAYER_SIZE - COLLISION_BUFFER - 1 }
    ];

    debugCollision = `Target: Corners `;
    for (let corner of corners) {
        let tileX = Math.floor(corner.x / TILE_SIZE);
        let tileY = Math.floor(corner.y / TILE_SIZE);
        debugCollision += `(${tileX}, ${tileY}) `;
        if (tileX < 0 || tileX >= MAP_WIDTH || tileY < 0 || tileY >= MAP_HEIGHT) {
            debugCollision += 'Out ';
            return false;
        }
        let mapValue = map[tileY][tileX];
        debugCollision += `Map: ${mapValue} `;
        if (mapValue === 1) {
            debugCollision += 'Wall';
            return false;
        }
    }
    lastCanMove = 'Yes';
    return true;
}

function canMoveEnemy(direction, x, y) {
    let settings = modeSettings[gameMode];
    let speed = powerUpActive ? settings.enemySpeed * 0.5 : settings.enemySpeed;
    let newX = x;
    let newY = y;

    if (direction === 'up') {
        newY -= speed;
    } else if (direction === 'down') {
        newY += speed;
    } else if (direction === 'left') {
        newX -= speed;
    } else if (direction === 'right') {
        newX += speed;
    }

    let corners = [
        { x: newX + COLLISION_BUFFER, y: newY + COLLISION_BUFFER },
        { x: newX + ENEMY_SIZE - COLLISION_BUFFER - 1, y: newY + COLLISION_BUFFER },
        { x: newX + COLLISION_BUFFER, y: newY + ENEMY_SIZE - COLLISION_BUFFER - 1 },
        { x: newX + ENEMY_SIZE - COLLISION_BUFFER - 1, y: newY + ENEMY_SIZE - COLLISION_BUFFER - 1 }
    ];

    for (let corner of corners) {
        let tileX = Math.floor(corner.x / TILE_SIZE);
        let tileY = Math.floor(corner.y / TILE_SIZE);
        if (tileX < 0 || tileX >= MAP_WIDTH || tileY < 0 || tileY >= MAP_HEIGHT) {
            return false;
        }
        if (map[tileY][tileX] === 1) {
            return false;
        }
    }
    return true;
}

function keyPressed() {
    if (gameOver || gameMode === null) return;
    if (keyCode === UP_ARROW) {
        keys.up = true;
    } else if (keyCode === DOWN_ARROW) {
        keys.down = true;
    } else if (keyCode === LEFT_ARROW) {
        keys.left = true;
    } else if (keyCode === RIGHT_ARROW) {
        keys.right = true;
    }
}

function keyReleased() {
    if (gameOver || gameMode === null) return;
    if (keyCode === UP_ARROW) {
        keys.up = false;
    } else if (keyCode === DOWN_ARROW) {
        keys.down = false;
    } else if (keyCode === LEFT_ARROW) {
        keys.left = false;
    } else if (keyCode === RIGHT_ARROW) {
        keys.right = false;
    }
}

function updateHighScoresDisplay() {
    document.getElementById('high-score-easy').innerHTML = `High Score (Easy): ${highScores.easy}`;
    document.getElementById('high-score-medium').innerHTML = `High Score (Medium): ${highScores.medium}`;
    document.getElementById('high-score-hard').innerHTML = `High Score (Hard): ${highScores.hard}`;
}

function saveHighScore() {
    if (score > highScores[gameMode]) {
        highScores[gameMode] = score;
        localStorage.setItem(`highScore${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)}`, score);
    }
}

function showModal() {
    saveHighScore();
    let modal = document.getElementById('game-over-modal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

function restartGame() {
    let gameOverModal = document.getElementById('game-over-modal');
    gameOverModal.classList.remove('show');
    setTimeout(() => {
        gameOverModal.style.display = 'none';
        const modeModal = document.getElementById('mode-modal');
        modeModal.style.display = 'flex';
        setTimeout(() => modeModal.classList.add('show'), 10);
    }, 300);
    updateHighScoresDisplay();
    gameOver = false;
    gameMode = null;
    map = null;
    player = {
        x: 9 * TILE_SIZE,
        y: 16 * TILE_SIZE,
        frame: 0,
        direction: 'right'
    };
    enemies = [];
    score = 0;
    level = 1;
    lives = 3;
    dotsCollected = 0;
    powerUpActive = false;
    powerUpTimer = 0;
    fruit = null;
    fruitTimer = 0;
    updateScore();
    updateLevel();
    updateLives();
}