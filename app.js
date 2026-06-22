const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game grid & smooth translation state
let gridCount = 20;
let tileSize;
let snake = []; 
let direction = { x: 0, y: -1 };
let nextDirection = { x: 0, y: -1 };
let lastValidDirection = { x: 0, y: -1 };

// Entity Pools
let foods = []; 
let enemies = [];
let projectiles = [];
let particles = [];
let bosses = [];

// Game Systems
let score, level, xp, xpNeeded, hp;
let gameInterval, isPaused;
let progressTimer = 0; 
let lastFrameTime = 0;

// Upgrades
let attackSpeed = 0; 
let shieldCount = 0;
let hasSpikes = false;
let maxFoodCount = 1; 
let lastShotTime = 0;
let speedBonus = 0; // added on top of base move speed by the Speed Boost perk
let scoreMultiplier = 1;
let hasSecondWind = false;
let secondWindUsed = false;
let enemySpawnReduction = 0; // subtracted from the spawn-chance roll
let hasSplashDamage = false;
let maxHpCap = 5;

// Base glide speed (how fast the snake interpolates between grid cells).
// This is multiplied up slightly per level so the game naturally
// quickens as you progress, on top of anything the player picks.
const BASE_MOVE_SPEED = 0.27;
const PER_LEVEL_SPEED_GAIN = 0.012;
const MAX_MOVE_SPEED = 0.6; // hard cap so it never becomes uncontrollable

// Dev console state (only reachable via the hidden unlock in Options)
let devSpeedMultiplier = 1;
let godMode = false;

const upgradesPool = [
    { id: 'hp', title: 'Bio-Repair', icon: '❤️', desc: 'Heals 1 lost heart (Max HP)', rarity: 'common' },
    { id: 'fireball', title: 'Plasma Blaster', icon: '🔥', desc: 'Auto-fires projectiles rapidly at close targets', rarity: 'common' },
    { id: 'shield', title: 'Kinetic Shield', icon: '🛡️', desc: 'Absorbs one collision with walls or targets', rarity: 'common' },
    { id: 'spikes', title: 'Nova Spikes', icon: '⚡', desc: 'Eaten food triggers an explosion killing near enemies', rarity: 'rare' },
    { id: 'more_food', title: 'Scout Radar', icon: '🍎', desc: 'Permanently increases the active food count on the field', rarity: 'common' },
    { id: 'speed', title: 'Adrenal Surge', icon: '💨', desc: 'Permanently increases movement speed', rarity: 'common' },
    { id: 'score_mult', title: 'Precision Core', icon: '🎯', desc: 'Permanently increases score gained from all sources by 25%', rarity: 'rare' },
    { id: 'quick_learner', title: 'Quick Learner', icon: '🧠', desc: 'Immediately reduces XP needed to reach the next level', rarity: 'common' },
    { id: 'second_wind', title: 'Second Wind', icon: '💚', desc: 'Cheats death once, reviving with 2 HP instead of dying', rarity: 'legendary' },
    { id: 'phase_shift', title: 'Phase Shift', icon: '🌀', desc: 'Permanently reduces how often new enemies spawn', rarity: 'rare' },
    { id: 'overcharge', title: 'Overcharge', icon: '☄️', desc: 'Projectiles explode on impact, damaging nearby enemies too', rarity: 'legendary' },
    { id: 'vital_surge', title: 'Vital Surge', icon: '🩹', desc: 'Raises max HP cap and heals 1 heart', rarity: 'rare' }
];

function getCurrentMoveSpeed() {
    let speed = BASE_MOVE_SPEED + (level - 1) * PER_LEVEL_SPEED_GAIN + speedBonus;
    speed = Math.min(speed, MAX_MOVE_SPEED);
    return speed * devSpeedMultiplier;
}

function addScore(points) {
    score += Math.round(points * scoreMultiplier);
}

// Canvas color palettes. Dark mode leans on neon glow (shadowBlur); light
// mode uses flatter, more saturated colors with outlines instead of glow,
// since glow effects need a dark background to actually read well.
const PALETTE = {
    dark: {
        gridLine: 'rgba(255, 255, 255, 0.03)',
        food: '#ff007f',
        foodGlow: '#ff007f',
        foodCore: '#ffffff',
        enemy: '#a124db',
        enemyEye: '#00ffff',
        enemyGlow: '#a124db',
        boss: '#ff0055',
        bossFlash: '#ffffff',
        bossCore: '#111116',
        bossBarBg: 'rgba(0,0,0,0.5)',
        snakeHead: '#00ffcc',
        snakeEye: '#ffffff',
        snakeBodyA: '#00b399',
        snakeBodyB: '#00806d',
        shieldRing: 'rgba(0, 255, 255, 0.4)',
        projectile: '#00ffff',
        useGlow: true
    },
    light: {
        gridLine: 'rgba(26, 26, 46, 0.07)',
        food: '#e6005c',
        foodGlow: 'transparent',
        foodCore: '#ffffff',
        enemy: '#7a1fa6',
        enemyEye: '#00838f',
        enemyGlow: 'transparent',
        boss: '#c2003f',
        bossFlash: '#fff3f6',
        bossCore: '#2a0a14',
        bossBarBg: 'rgba(0,0,0,0.15)',
        snakeHead: '#00897b',
        snakeEye: '#ffffff',
        snakeBodyA: '#00897b',
        snakeBodyB: '#00695c',
        shieldRing: 'rgba(0, 137, 123, 0.5)',
        projectile: '#0097a7',
        useGlow: false
    }
};

function getPalette() {
    return document.body.classList.contains('light-mode') ? PALETTE.light : PALETTE.dark;
}

function initGame() {
    stopMenuDemo();
    setMusicIntensity('game');
    document.getElementById('main-menu-screen').classList.add('hidden');
    document.getElementById('options-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('upgrade-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    pausedForMenu = false;
    document.getElementById('hud').classList.remove('hidden');
    canvas.classList.remove('hidden');
    document.getElementById('touch-controls').classList.remove('hidden');

    resizeCanvas();
    
    // Smooth positions track float values for sub-grid rendering
    snake = [
        { x: 10, y: 10, targetX: 10, targetY: 10 },
        { x: 10, y: 11, targetX: 10, targetY: 11 },
        { x: 10, y: 12, targetX: 10, targetY: 12 }
    ];
    
    direction = { x: 0, y: -1 };
    nextDirection = { x: 0, y: -1 };
    lastValidDirection = { x: 0, y: -1 };
    
    enemies = [];
    projectiles = [];
    particles = [];
    bosses = [];
    foods = [];
    
    score = 0; level = 1; xp = 0; xpNeeded = 3; hp = 3;
    attackSpeed = 0; shieldCount = 0; hasSpikes = false; maxFoodCount = 1;
    speedBonus = 0;
    scoreMultiplier = 1; hasSecondWind = false; secondWindUsed = false;
    enemySpawnReduction = 0; hasSplashDamage = false; maxHpCap = 5;
    isPaused = false;
    progressTimer = 0;
    
    refillFood();
    updateHUD();
    
    if(gameInterval) cancelAnimationFrame(gameInterval);
    lastFrameTime = performance.now();
    gameInterval = requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    tileSize = Math.floor(canvas.width / gridCount);
}

function createExplosion(gridX, gridY, color, count = 8) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: gridX * tileSize + tileSize / 2,
            y: gridY * tileSize + tileSize / 2,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            radius: Math.random() * 2.5 + 1,
            alpha: 1,
            color: color
        });
    }
}

function getSafeGridPosition() {
    let attempts = 0;
    while (attempts < 150) {
        let pos = {
            x: Math.floor(Math.random() * gridCount),
            y: Math.floor(Math.random() * gridCount)
        };
        let onSnake = snake.some(p => Math.round(p.targetX) === pos.x && Math.round(p.targetY) === pos.y);
        let onFood = foods.some(f => f.x === pos.x && f.y === pos.y);
        let onEnemy = enemies.some(e => e.x === pos.x && e.y === pos.y);
        let onBoss = bosses.some(b => b.x === pos.x && b.y === pos.y);
        
        if (!onSnake && !onFood && !onEnemy && !onBoss) return pos;
        attempts++;
    }
    return { x: Math.floor(Math.random() * gridCount), y: Math.floor(Math.random() * gridCount) };
}

function refillFood() {
    while (foods.length < maxFoodCount) {
        foods.push(getSafeGridPosition());
    }
}

function spawnEnemy() {
    if (bosses.length === 0 && Math.random() > (0.3 + enemySpawnReduction)) {
        enemies.push(getSafeGridPosition());
    }
}

function spawnBoss() {
    bosses.push({
        x: Math.floor(gridCount / 2),
        y: Math.floor(gridCount / 2),
        hp: 5,
        maxHp: 5,
        flashFrames: 0
    });
    createExplosion(gridCount/2, gridCount/2, '#ff0055', 30);
}

function gameLoop(now) {
    let deltaSeconds = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    // Clamp delta so a dropped/backgrounded tab doesn't cause one huge
    // catch-up jump (e.g. snake teleporting several cells at once).
    deltaSeconds = Math.min(deltaSeconds, 1 / 15);

    updateTick(deltaSeconds);
    gameInterval = requestAnimationFrame(gameLoop);
}

function updateTick(deltaSeconds) {
    if (isPaused) return;

    let head = snake[0];
    let distanceToTarget = Math.hypot(head.targetX - head.x, head.targetY - head.y);
    // Exponential-decay interpolation, expressed per-second instead of
    // per-tick, so movement speed is identical regardless of the
    // device's actual frame rate (a slow phone no longer plays slower).
    let speedPerSecond = Math.min(getCurrentMoveSpeed(), 0.97);
    let moveStepSpeed = 1 - Math.pow(1 - speedPerSecond, deltaSeconds * 60);

    if (distanceToTarget > 0.01) {
        // Linearly slide each body segment smoothly toward its grid target location
        snake.forEach(part => {
            part.x += (part.targetX - part.x) * moveStepSpeed;
            part.y += (part.targetY - part.y) * moveStepSpeed;
        });
    } else {
        // Snaps perfectly to the grid cells when targets are reached
        snake.forEach(part => {
            part.x = part.targetX;
            part.y = part.targetY;
        });
        advanceGridStep();
    }

    projectiles.forEach((proj, pIdx) => {
        proj.x += proj.vx;
        proj.y += proj.vy;
        if (proj.x < 0 || proj.x >= gridCount || proj.y < 0 || proj.y >= gridCount) {
            projectiles.splice(pIdx, 1);
        }
    });

    particles.forEach((p, index) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.03;
        if (p.alpha <= 0) particles.splice(index, 1);
    });

    draw();
}

function advanceGridStep() {
    direction = nextDirection;
    lastValidDirection = direction; 

    let currentHead = snake[0];
    let nextX = currentHead.targetX + direction.x;
    let nextY = currentHead.targetY + direction.y;

    // Boundary Wall Crashes
    if (nextX < 0 || nextX >= gridCount || nextY < 0 || nextY >= gridCount) {
        if (godMode) {
            // Wrap around instead of dying when invincible
            nextX = (nextX + gridCount) % gridCount;
            nextY = (nextY + gridCount) % gridCount;
        } else if (shieldCount > 0) {
            shieldCount--;
            createExplosion(currentHead.targetX, currentHead.targetY, '#00ffcc', 12);
            nextDirection = { x: -direction.x, y: -direction.y };
            updateHUD();
            return;
        } else {
            gameOver();
            return;
        }
    }

    // Body Self Collisions
    for (let i = 1; i < snake.length; i++) {
        if (snake[i].targetX === nextX && snake[i].targetY === nextY) {
            if (godMode) break;
            gameOver();
            return;
        }
    }

    let newHeadTarget = { x: currentHead.targetX, y: currentHead.targetY, targetX: nextX, targetY: nextY };
    snake.unshift(newHeadTarget);

    // Collision Check: Eating Food 
    let eatenFoodIdx = foods.findIndex(f => f.x === nextX && f.y === nextY);
    if (eatenFoodIdx !== -1) {
        foods.splice(eatenFoodIdx, 1);
        addScore(10);
        xp++;
        createExplosion(nextX, nextY, '#ff007f', 15);
        
        if (hasSpikes) triggerSpikes(nextX, nextY);
        refillFood();
        spawnEnemy();
        
        if (xp >= xpNeeded) {
            triggerLevelUp();
        }
    } else {
        snake.pop();
    }

    checkCombatCollisions(nextX, nextY);

    // Auto weapon fire logic
    if (attackSpeed > 0) {
        let now = Date.now();
        if (now - lastShotTime > (1000 / attackSpeed)) {
            fireProjectiles();
            lastShotTime = now;
        }
    }
}

function checkCombatCollisions(headGridX, headGridY) {
    // 1. Regular Enemies vs Snake Head
    enemies.forEach((enemy, eIdx) => {
        if (headGridX === enemy.x && headGridY === enemy.y) {
            enemies.splice(eIdx, 1);
            createExplosion(enemy.x, enemy.y, '#ff3333', 12);
            handleDamage();
        }
    });

    // 2. Boss Arena Combat Interactions
    bosses.forEach((boss, bIdx) => {
        if (headGridX === boss.x && headGridY === boss.y) {
            handleDamage();
        }

        projectiles.forEach((proj, pIdx) => {
            let pX = Math.floor(proj.x);
            let pY = Math.floor(proj.y);
            if (pX === boss.x && pY === boss.y) {
                projectiles.splice(pIdx, 1);
                boss.hp--;
                boss.flashFrames = 4; 
                addScore(15);
                createExplosion(boss.x, boss.y, '#ff0055', 8);

                if (boss.hp <= 0) {
                    createExplosion(boss.x, boss.y, '#ffea00', 35);
                    bosses.splice(bIdx, 1);
                    addScore(200);
                    xp += 3; 
                    if (xp >= xpNeeded) triggerLevelUp();
                }
            }
        });
    });

    // Projectiles clearing small enemies
    projectiles.forEach((proj, pIdx) => {
        let pX = Math.floor(proj.x);
        let pY = Math.floor(proj.y);
        enemies.forEach((enemy, eIdx) => {
            if (pX === enemy.x && pY === enemy.y) {
                createExplosion(enemy.x, enemy.y, '#a124db', 10);
                enemies.splice(eIdx, 1);
                projectiles.splice(pIdx, 1);
                addScore(5);

                if (hasSplashDamage) {
                    // Overcharge: nearby enemies within a small radius also die
                    enemies = enemies.filter(other => {
                        let dist = Math.abs(other.x - pX) + Math.abs(other.y - pY);
                        if (dist > 0 && dist <= 1) {
                            createExplosion(other.x, other.y, '#ff8800', 8);
                            addScore(5);
                            return false;
                        }
                        return true;
                    });
                }
            }
        });
    });
}

function handleDamage() {
    if (godMode) return;
    if (shieldCount > 0) {
        shieldCount--;
    } else {
        hp--;
        if (hp <= 0) gameOver();
    }
    updateHUD();
}

function fireProjectiles() {
    let activeTarget = null;
    if (bosses.length > 0) activeTarget = bosses[0];
    else if (enemies.length > 0) activeTarget = enemies[0];

    if (!activeTarget) return;
    
    let head = snake[0];
    let angle = Math.atan2(activeTarget.y - head.targetY, activeTarget.x - head.targetX);
    projectiles.push({
        x: head.x, y: head.y,
        vx: Math.cos(angle) * 0.4, vy: Math.sin(angle) * 0.4
    });
}

function triggerSpikes(gx, gy) {
    createExplosion(gx, gy, '#00ffcc', 20);
    enemies = enemies.filter(enemy => {
        let dist = Math.abs(enemy.x - gx) + Math.abs(enemy.y - gy);
        if (dist <= 2) {
            addScore(5);
            createExplosion(enemy.x, enemy.y, '#a124db', 8);
            return false;
        }
        return true;
    });
}

function triggerLevelUp() {
    isPaused = true;
    level++;
    xp = 0;
    xpNeeded = Math.floor(xpNeeded * 1.35);
    
    if (level % 5 === 0) {
        spawnBoss();
    }

    document.getElementById('upgrade-level-num').textContent = level;

    const container = document.getElementById('upgrade-options');
    container.innerHTML = '';
    
    const shuffled = [...upgradesPool].sort(() => 0.5 - Math.random()).slice(0, 3);
    
    shuffled.forEach(upgrade => {
        const card = document.createElement('div');
        card.className = `upgrade-card rarity-${upgrade.rarity}`;
        card.innerHTML = `
            <div class="upgrade-icon-badge">${upgrade.icon}</div>
            <div class="upgrade-card-body">
                <div class="upgrade-rarity-tag">${upgrade.rarity}</div>
                <div class="upgrade-title">${upgrade.title}</div>
                <div class="upgrade-desc">${upgrade.desc}</div>
            </div>
        `;
        card.onclick = () => applyUpgrade(upgrade.id);
        container.appendChild(card);
    });
    
    document.getElementById('upgrade-screen').classList.remove('hidden');
}

function applyUpgrade(id) {
    if (id === 'hp') hp = Math.min(hp + 1, maxHpCap);
    if (id === 'fireball') attackSpeed += 1.5; 
    if (id === 'shield') shieldCount++;
    if (id === 'spikes') hasSpikes = true;
    if (id === 'more_food') { maxFoodCount++; refillFood(); }
    if (id === 'speed') speedBonus += 0.05;
    if (id === 'score_mult') scoreMultiplier += 0.25;
    if (id === 'quick_learner') xpNeeded = Math.max(1, Math.floor(xpNeeded * 0.7));
    if (id === 'second_wind') hasSecondWind = true;
    if (id === 'phase_shift') enemySpawnReduction = Math.min(enemySpawnReduction + 0.15, 0.6);
    if (id === 'overcharge') hasSplashDamage = true;
    if (id === 'vital_surge') { maxHpCap = Math.min(maxHpCap + 1, 9); hp = Math.min(hp + 1, maxHpCap); }
    
    document.getElementById('upgrade-screen').classList.add('hidden');
    isPaused = false;
}

// HUD icon canvas (HP hearts + shield count), drawn instead of emoji so
// they render identically everywhere instead of depending on OS emoji fonts.
const hpIconsCanvas = document.getElementById('hp-icons-canvas');
const hpIconsCtx = hpIconsCanvas.getContext('2d');

function drawHexHeartIcon(ctx, x, y, scale, color, glow) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (glow) { ctx.shadowBlur = 8; ctx.shadowColor = color; }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(10, -6); ctx.lineTo(10, 6);
    ctx.lineTo(0, 12); ctx.lineTo(-10, 6); ctx.lineTo(-10, -6);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(0, -1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawShieldIconHud(ctx, x, y, scale, color, glow) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (glow) { ctx.shadowBlur = 8; ctx.shadowColor = color; }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(9, -6); ctx.lineTo(9, 4);
    ctx.lineTo(0, 12); ctx.lineTo(-9, 4); ctx.lineTo(-9, -6);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(6, -4); ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawHpIcons() {
    hpIconsCtx.clearRect(0, 0, hpIconsCanvas.width, hpIconsCanvas.height);
    const pal = getPalette();
    const heartColor = pal.useGlow ? '#ff3366' : '#d6004f';
    const shieldColor = pal.useGlow ? '#00ffcc' : '#00897b';

    const totalIcons = hp + shieldCount;
    // Shrink spacing/scale once icons would otherwise overflow the canvas
    const spacing = totalIcons > 10 ? (hpIconsCanvas.width - 16) / totalIcons : 24;
    const scale = totalIcons > 10 ? 0.6 : 0.85;

    for (let i = 0; i < hp; i++) {
        drawHexHeartIcon(hpIconsCtx, 14 + i * spacing, 14, scale, heartColor, pal.useGlow);
    }
    for (let i = 0; i < shieldCount; i++) {
        drawShieldIconHud(hpIconsCtx, 14 + (hp + i) * spacing, 14, scale, shieldColor, pal.useGlow);
    }
}

function updateHUD() {
    document.getElementById('score-val').textContent = score;
    document.getElementById('level-val').textContent = level;
    drawHpIcons();
        
    const xpPercent = (xp / xpNeeded) * 100;
    document.getElementById('xp-bar').style.width = `${xpPercent}%`;
}

function gameOver() {
    if (hasSecondWind && !secondWindUsed) {
        secondWindUsed = true;
        hp = 2;
        shieldCount = Math.max(shieldCount, 1); // brief grace period so they don't insta-die again
        createExplosion(snake[0].targetX, snake[0].targetY, '#33ff99', 25);
        updateHUD();
        return;
    }
    if(gameInterval) cancelAnimationFrame(gameInterval);
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('final-lvl').textContent = level;
    document.getElementById('final-score').textContent = score;
    document.getElementById('game-over-screen').classList.remove('hidden');
}

function returnToMainMenu() {
    if (gameInterval) cancelAnimationFrame(gameInterval);
    isPaused = false;
    setMusicIntensity('menu');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('upgrade-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    canvas.classList.add('hidden');
    document.getElementById('touch-controls').classList.add('hidden');
    document.getElementById('main-menu-screen').classList.remove('hidden');
    startMenuDemo();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.shadowBlur = 0;
    const pal = getPalette();
    
    // 1. Technical Background Grid
    ctx.strokeStyle = pal.gridLine;
    ctx.lineWidth = 1;
    for (let i = 0; i < gridCount; i++) {
        ctx.beginPath(); ctx.moveTo(i * tileSize, 0); ctx.lineTo(i * tileSize, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * tileSize); ctx.lineTo(canvas.width, i * tileSize); ctx.stroke();
    }
    
    // 2. Draw Active Foods (Glowing Biotech Orbs)
    foods.forEach(food => {
        let fx = food.x * tileSize + tileSize / 2;
        let fy = food.y * tileSize + tileSize / 2;
        let radius = (tileSize / 2.5) + Math.sin(Date.now() / 150) * 1.5; 
        
        ctx.save();
        if (pal.useGlow) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = pal.foodGlow;
        }
        
        let grad = ctx.createRadialGradient(fx, fy, 2, fx, fy, radius);
        grad.addColorStop(0, pal.foodCore);
        grad.addColorStop(0.4, pal.food);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(fx, fy, radius, 0, Math.PI * 2);
        ctx.fill();

        if (!pal.useGlow) {
            ctx.strokeStyle = pal.food;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.restore();
    });

    // 3. Draw Regular Enemies (Floating Cyber-Drones)
    enemies.forEach(enemy => {
        let hoverY = Math.sin((Date.now() / 200) + (enemy.x * enemy.y)) * 4;
        let ex = enemy.x * tileSize + tileSize / 2;
        let ey = enemy.y * tileSize + tileSize / 2 + hoverY;
        let size = tileSize * 0.7;

        ctx.save();
        if (pal.useGlow) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = pal.enemyGlow;
        }

        ctx.fillStyle = pal.enemy;
        ctx.beginPath();
        ctx.moveTo(ex, ey - size/2);
        ctx.lineTo(ex + size/2, ey);
        ctx.lineTo(ex, ey + size/2);
        ctx.lineTo(ex - size/2, ey);
        ctx.closePath();
        ctx.fill();
        if (!pal.useGlow) {
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.fillStyle = pal.enemyEye;
        ctx.beginPath();
        ctx.arc(ex, ey, size * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // 4. Draw Boss Entity (Massive Core Leviathan)
    bosses.forEach(boss => {
        let bx = boss.x * tileSize + tileSize / 2;
        let by = boss.y * tileSize + tileSize / 2;
        let pulseSize = (tileSize * 1.6) + Math.sin(Date.now() / 100) * 3;

        ctx.save();
        if (boss.flashFrames > 0) {
            ctx.fillStyle = pal.bossFlash;
            boss.flashFrames--;
            if (pal.useGlow) ctx.shadowColor = pal.bossFlash;
        } else {
            ctx.fillStyle = pal.boss;
            if (pal.useGlow) ctx.shadowColor = pal.boss;
        }
        if (pal.useGlow) ctx.shadowBlur = 25;

        ctx.beginPath();
        ctx.arc(bx, by, pulseSize / 2, 0, Math.PI * 2);
        ctx.fill();
        if (!pal.useGlow) {
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        ctx.fillStyle = pal.bossCore;
        ctx.beginPath();
        ctx.arc(bx, by, pulseSize / 3, 0, Math.PI * 2);
        ctx.fill();

        let barW = tileSize * 2;
        let barH = 5;
        ctx.fillStyle = pal.bossBarBg;
        ctx.fillRect(bx - barW/2, by - tileSize, barW, barH);
        ctx.fillStyle = pal.boss;
        ctx.fillRect(bx - barW/2, by - tileSize, barW * (boss.hp / boss.maxHp), barH);

        ctx.restore();
    });

    // 5. Draw Smooth-Flowing Snake Body
    for (let i = snake.length - 1; i >= 0; i--) {
        let part = snake[i];
        let rx = part.x * tileSize + tileSize / 2;
        let ry = part.y * tileSize + tileSize / 2;

        ctx.save();
        
        if (i === 0) {
            if (pal.useGlow) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = pal.snakeHead;
            }
            ctx.fillStyle = pal.snakeHead;
            
            ctx.beginPath();
            ctx.arc(rx, ry, tileSize * 0.48, 0, Math.PI * 2);
            ctx.fill();
            if (!pal.useGlow) {
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            let eyeOffset = tileSize * 0.18;
            let lookAheadX = lastValidDirection.x * 6;
            let lookAheadY = lastValidDirection.y * 6;
            
            ctx.fillStyle = pal.snakeEye;
            let perpX = -lastValidDirection.y * eyeOffset;
            let perpY = lastValidDirection.x * eyeOffset;

            ctx.beginPath();
            ctx.arc(rx + perpX + lookAheadX, ry + perpY + lookAheadY, 3, 0, Math.PI * 2);
            ctx.arc(rx - perpX + lookAheadX, ry - perpY + lookAheadY, 3, 0, Math.PI * 2);
            ctx.fill();
            
        } else {
            let progress = i / snake.length; 
            let bodySize = (tileSize * 0.42) * (1 - progress * 0.5); 
            
            if (shieldCount > 0) {
                ctx.strokeStyle = pal.shieldRing;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(rx, ry, bodySize + 3, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.fillStyle = (i % 2 === 0) ? pal.snakeBodyA : pal.snakeBodyB;
            ctx.beginPath();
            ctx.arc(rx, ry, bodySize, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // 6. Draw Plasma Projectiles
    projectiles.forEach(proj => {
        let px = proj.x * tileSize + tileSize / 2;
        let py = proj.y * tileSize + tileSize / 2;
        
        ctx.save();
        if (pal.useGlow) {
            ctx.shadowBlur = 12;
            ctx.shadowColor = pal.projectile;
        }
        ctx.fillStyle = pal.projectile;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // 7. Draw Particles
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// Configurable key bindings (Options > Controls). Defaults match the
// original hardcoded behavior: WASD and arrow keys both always work
// for their respective direction.
const DEFAULT_KEYBINDS = {
    up: ['arrowup', 'w'],
    down: ['arrowdown', 's'],
    left: ['arrowleft', 'a'],
    right: ['arrowright', 'd']
};
let keybinds = loadKeybinds();

function loadKeybinds() {
    try {
        const raw = localStorage.getItem('snakeRogue.keybinds');
        if (!raw) return JSON.parse(JSON.stringify(DEFAULT_KEYBINDS));
        const parsed = JSON.parse(raw);
        // Merge with defaults so any missing/corrupt direction still works
        return { ...JSON.parse(JSON.stringify(DEFAULT_KEYBINDS)), ...parsed };
    } catch (e) {
        return JSON.parse(JSON.stringify(DEFAULT_KEYBINDS));
    }
}

function saveKeybinds() {
    try {
        localStorage.setItem('snakeRogue.keybinds', JSON.stringify(keybinds));
    } catch (e) {
        // localStorage unavailable - remap just won't persist
    }
}

window.addEventListener('keydown', e => {
    // Ignore movement keys while any overlay/modal is open, so input
    // can't get "stuck" interacting with whatever's behind a panel.
    // Also ignore while a controls-remap button is actively listening,
    // so the key being captured doesn't simultaneously steer the snake.
    if (isPaused || remapListenDirection) return;

    const key = e.key.toLowerCase();
    if (keybinds.up.includes(key) && lastValidDirection.y !== 1) nextDirection = { x: 0, y: -1 };
    else if (keybinds.down.includes(key) && lastValidDirection.y !== -1) nextDirection = { x: 0, y: 1 };
    else if (keybinds.left.includes(key) && lastValidDirection.x !== 1) nextDirection = { x: -1, y: 0 };
    else if (keybinds.right.includes(key) && lastValidDirection.x !== -1) nextDirection = { x: 1, y: 0 };
});

// Shared helper so swipe and D-pad buttons both respect the
// "can't reverse directly into yourself" rule that keydown uses.
function requestDirection(dx, dy) {
    if (dx !== 0 && lastValidDirection.x !== -dx) {
        nextDirection = { x: dx, y: 0 };
    } else if (dy !== 0 && lastValidDirection.y !== -dy) {
        nextDirection = { x: 0, y: dy };
    }
}

// --- Touch swipe controls (on the canvas itself) ---
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 24; // px - minimum distance to count as an intentional swipe

canvas.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
}, { passive: true });

canvas.addEventListener('touchend', e => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;

    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

    if (Math.abs(dx) > Math.abs(dy)) {
        requestDirection(dx > 0 ? 1 : -1, 0);
    } else {
        requestDirection(0, dy > 0 ? 1 : -1);
    }
}, { passive: true });

// --- Touch D-pad buttons (fallback / easier for some players) ---
function bindDpadButton(id, dx, dy) {
    const btn = document.getElementById(id);
    if (!btn) return;
    // touchstart fires faster than click and lets us preventDefault
    // so it doesn't also fire a ghost click/zoom on some browsers.
    btn.addEventListener('touchstart', e => {
        e.preventDefault();
        requestDirection(dx, dy);
    }, { passive: false });
    btn.addEventListener('click', () => requestDirection(dx, dy));
}

bindDpadButton('btn-up', 0, -1);
bindDpadButton('btn-down', 0, 1);
bindDpadButton('btn-left', -1, 0);
bindDpadButton('btn-right', 1, 0);

// --- Restart / Menu buttons ---
document.getElementById('restart-btn').addEventListener('click', (e) => {
    e.target.blur();
    initGame();
});

document.getElementById('menu-btn-gameover').addEventListener('click', () => {
    returnToMainMenu();
});

document.getElementById('start-btn').addEventListener('click', (e) => {
    e.target.blur();
    initGame();
});

// =====================================================================
// Main Menu Background: decorative self-playing demo snake
// Entirely separate from real game state - just a looping visual.
// =====================================================================

const menuCanvas = document.getElementById('menu-bg-canvas');
const menuCtx = menuCanvas.getContext('2d');
const DEMO_GRID = 14;
let demoTileSize = 20;
let demoSnake = [];
let demoDirection = { x: 1, y: 0 };
let demoFood = { x: 5, y: 5 };
let demoStepTimer = 0;
let demoRafId = null;
let demoLastTime = 0;

function resizeMenuCanvas() {
    if (!menuCanvas) return;
    const rect = menuCanvas.parentElement.getBoundingClientRect();
    menuCanvas.width = rect.width;
    menuCanvas.height = rect.height;
    demoTileSize = Math.max(rect.width, rect.height) / DEMO_GRID;
}

function resetDemoSnake() {
    demoSnake = [
        { x: 4, y: 7 }, { x: 3, y: 7 }, { x: 2, y: 7 }
    ];
    demoDirection = { x: 1, y: 0 };
    placeDemoFood();
}

function placeDemoFood() {
    let pos;
    do {
        pos = {
            x: Math.floor(Math.random() * DEMO_GRID),
            y: Math.floor(Math.random() * DEMO_GRID)
        };
    } while (demoSnake.some(s => s.x === pos.x && s.y === pos.y));
    demoFood = pos;
}

function stepDemoSnake() {
    const head = demoSnake[0];

    // Simple greedy pathing toward the food, picking the axis with the
    // larger gap first; never reverses directly into itself.
    const dx = demoFood.x - head.x;
    const dy = demoFood.y - head.y;
    let candidates = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx !== 0) candidates.push({ x: Math.sign(dx), y: 0 });
        if (dy !== 0) candidates.push({ x: 0, y: Math.sign(dy) });
    } else {
        if (dy !== 0) candidates.push({ x: 0, y: Math.sign(dy) });
        if (dx !== 0) candidates.push({ x: Math.sign(dx), y: 0 });
    }
    // Fallback: keep current direction, then try any non-reversing turn
    candidates.push(demoDirection, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 });

    const isReverse = (d) => d.x === -demoDirection.x && d.y === -demoDirection.y;
    const wouldHitSelf = (d) => {
        const nx = (head.x + d.x + DEMO_GRID) % DEMO_GRID;
        const ny = (head.y + d.y + DEMO_GRID) % DEMO_GRID;
        return demoSnake.some(s => s.x === nx && s.y === ny);
    };

    let chosen = candidates.find(d => (d.x !== 0 || d.y !== 0) && !isReverse(d) && !wouldHitSelf(d));
    if (!chosen) chosen = demoDirection; // trapped - just keep going, it's only decorative

    demoDirection = chosen;
    const newHead = {
        x: (head.x + demoDirection.x + DEMO_GRID) % DEMO_GRID,
        y: (head.y + demoDirection.y + DEMO_GRID) % DEMO_GRID
    };
    demoSnake.unshift(newHead);

    if (newHead.x === demoFood.x && newHead.y === demoFood.y) {
        placeDemoFood();
        if (demoSnake.length > 14) demoSnake.pop(); // cap length so it doesn't fill the whole board
    } else {
        demoSnake.pop();
    }
}

function drawDemoSnake() {
    menuCtx.clearRect(0, 0, menuCanvas.width, menuCanvas.height);
    const pal = PALETTE.dark; // menu background always uses the dark neon look

    // food
    const fx = demoFood.x * demoTileSize + demoTileSize / 2;
    const fy = demoFood.y * demoTileSize + demoTileSize / 2;
    menuCtx.save();
    menuCtx.shadowBlur = 14;
    menuCtx.shadowColor = pal.foodGlow;
    let grad = menuCtx.createRadialGradient(fx, fy, 1, fx, fy, demoTileSize / 2.4);
    grad.addColorStop(0, pal.foodCore);
    grad.addColorStop(0.4, pal.food);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    menuCtx.fillStyle = grad;
    menuCtx.beginPath();
    menuCtx.arc(fx, fy, demoTileSize / 2.4, 0, Math.PI * 2);
    menuCtx.fill();
    menuCtx.restore();

    // body + head
    for (let i = demoSnake.length - 1; i >= 0; i--) {
        const part = demoSnake[i];
        const rx = part.x * demoTileSize + demoTileSize / 2;
        const ry = part.y * demoTileSize + demoTileSize / 2;
        menuCtx.save();
        if (i === 0) {
            menuCtx.shadowBlur = 16;
            menuCtx.shadowColor = pal.snakeHead;
            menuCtx.fillStyle = pal.snakeHead;
            menuCtx.beginPath();
            menuCtx.arc(rx, ry, demoTileSize * 0.46, 0, Math.PI * 2);
            menuCtx.fill();
        } else {
            const progress = i / demoSnake.length;
            const size = (demoTileSize * 0.4) * (1 - progress * 0.5);
            menuCtx.fillStyle = (i % 2 === 0) ? pal.snakeBodyA : pal.snakeBodyB;
            menuCtx.beginPath();
            menuCtx.arc(rx, ry, size, 0, Math.PI * 2);
            menuCtx.fill();
        }
        menuCtx.restore();
    }
}

function demoLoop(now) {
    if (!demoLastTime) demoLastTime = now;
    const delta = now - demoLastTime;
    demoLastTime = now;
    demoStepTimer += delta;

    if (demoStepTimer > 220) { // demo speed: one grid step ~every 220ms
        demoStepTimer = 0;
        stepDemoSnake();
    }
    drawDemoSnake();
    demoRafId = requestAnimationFrame(demoLoop);
}

function startMenuDemo() {
    if (demoRafId) return; // already running
    resizeMenuCanvas();
    resetDemoSnake();
    demoLastTime = 0;
    demoRafId = requestAnimationFrame(demoLoop);
}

function stopMenuDemo() {
    if (demoRafId) {
        cancelAnimationFrame(demoRafId);
        demoRafId = null;
    }
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('resize', resizeMenuCanvas);

// =====================================================================
// Pause Menu
// =====================================================================

const pauseScreen = document.getElementById('pause-screen');
let pausedForMenu = false; // distinct from upgrade-screen's use of isPaused

function openPauseMenu() {
    if (!gameInterval) return; // nothing to pause
    if (!document.getElementById('upgrade-screen').classList.contains('hidden')) return; // don't stack on upgrade picks
    pausedForMenu = true;
    isPaused = true;
    pauseScreen.classList.remove('hidden');
}

function closePauseMenu() {
    pausedForMenu = false;
    isPaused = false;
    pauseScreen.classList.add('hidden');
}

document.getElementById('pause-btn').addEventListener('click', (e) => {
    e.target.blur();
    openPauseMenu();
});

document.getElementById('resume-btn').addEventListener('click', (e) => {
    e.target.blur();
    closePauseMenu();
});

document.getElementById('pause-options-btn').addEventListener('click', () => {
    pauseScreen.classList.add('hidden');
    openOptions('pause-screen');
});

document.getElementById('pause-quit-btn').addEventListener('click', () => {
    pausedForMenu = false;
    pauseScreen.classList.add('hidden');
    returnToMainMenu();
});

// Esc also opens/closes the pause menu on desktop, since there's no
// guaranteed keyboard on mobile but it's a nice-to-have shortcut.
window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!devConsole.classList.contains('hidden')) {
        devConsole.classList.add('hidden');
        return;
    }
    if (!optionsScreen.classList.contains('hidden') && optionsReturnTo === 'pause-screen') {
        closeOptions();
        return;
    }
    if (pausedForMenu) {
        closePauseMenu();
    } else {
        openPauseMenu();
    }
});

// =====================================================================
// Main Menu / Options / Theme
// =====================================================================

const mainMenuScreen = document.getElementById('main-menu-screen');
const optionsScreen = document.getElementById('options-screen');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeToggleLabel = document.getElementById('theme-toggle-label');
const soundToggleBtn = document.getElementById('sound-toggle-btn');

let soundOn = loadSetting('soundOn', true);
let lightMode = loadSetting('lightMode', false);

function loadSetting(key, fallback) {
    try {
        const raw = localStorage.getItem('snakeRogue.' + key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

function saveSetting(key, value) {
    try {
        localStorage.setItem('snakeRogue.' + key, JSON.stringify(value));
    } catch (e) {
        // localStorage unavailable (e.g. private mode) - settings just won't persist
    }
}

function applyTheme() {
    document.body.classList.toggle('light-mode', lightMode);
    themeToggleBtn.classList.toggle('is-on', lightMode);
    themeToggleBtn.textContent = lightMode ? 'Light' : 'Dark';
    themeToggleLabel.textContent = lightMode ? 'Light Mode' : 'Dark Mode';
    if (typeof drawHpIcons === 'function' && typeof hp !== 'undefined' && gameInterval) {
        drawHpIcons();
    }
}

function applySoundUI() {
    soundToggleBtn.classList.toggle('is-on', soundOn);
    soundToggleBtn.textContent = soundOn ? 'On' : 'Off';
}

applyTheme();
applySoundUI();

document.getElementById('options-btn').addEventListener('click', () => {
    openOptions('main-menu-screen');
});

document.getElementById('options-back-btn').addEventListener('click', () => {
    closeOptions();
});

let optionsReturnTo = 'main-menu-screen';

function openOptions(returnTo) {
    optionsReturnTo = returnTo;
    document.getElementById(returnTo).classList.add('hidden');
    optionsScreen.classList.remove('hidden');
    refreshRemapLabels();
}

function closeOptions() {
    optionsScreen.classList.add('hidden');
    document.getElementById(optionsReturnTo).classList.remove('hidden');
}

themeToggleBtn.addEventListener('click', () => {
    lightMode = !lightMode;
    saveSetting('lightMode', lightMode);
    applyTheme();
});

soundToggleBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    saveSetting('soundOn', soundOn);
    applySoundUI();
});

// =====================================================================
// Background Music (synthesized with Web Audio API - no audio files)
// =====================================================================

let musicOn = loadSetting('musicOn', true);
let musicVolume = loadSetting('musicVolume', 0.5);
let audioCtx = null;
let musicGainNode = null;
let musicSchedulerTimer = null;
let musicNoteIndex = 0;
let musicIntensity = 'menu'; // 'menu' | 'game'

// Two short looping note sequences (semitone offsets from a root note),
// using simple square/triangle oscillators for a lightweight chiptune
// feel. Negative numbers are below the root note.
const MENU_MELODY = [0, 3, 7, 10, 7, 3, 0, -2, 0, 3, 7, 12, 10, 7, 3, 0];
const GAME_MELODY  = [0, 5, 7, 12, 10, 7, 5, 3, 0, 5, 9, 12, 14, 12, 9, 5];
const ROOT_FREQ = 196; // G3 - low enough to sit in the background, not fight the SFX range
const NOTE_DURATION = 0.18; // seconds per step

function ensureAudioContext() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    musicGainNode = audioCtx.createGain();
    musicGainNode.gain.value = musicVolume;
    musicGainNode.connect(audioCtx.destination);
}

function semitoneToFreq(semitones) {
    return ROOT_FREQ * Math.pow(2, semitones / 12);
}

function playMusicNote(freq, startTime, duration, wave) {
    const osc = audioCtx.createOscillator();
    const noteGain = audioCtx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;

    // Quick fade in/out per note avoids clicky edges between notes
    noteGain.gain.setValueAtTime(0, startTime);
    noteGain.gain.linearRampToValueAtTime(0.5, startTime + 0.02);
    noteGain.gain.linearRampToValueAtTime(0, startTime + duration * 0.95);

    osc.connect(noteGain);
    noteGain.connect(musicGainNode);
    osc.start(startTime);
    osc.stop(startTime + duration);
}

function scheduleNextMusicStep() {
    if (!audioCtx || !musicOn) return;

    const melody = musicIntensity === 'game' ? GAME_MELODY : MENU_MELODY;
    const semitone = melody[musicNoteIndex % melody.length];
    const now = audioCtx.currentTime;

    playMusicNote(semitoneToFreq(semitone), now, NOTE_DURATION, 'triangle');
    // A quieter octave-up layer on game music adds a bit more energy
    if (musicIntensity === 'game') {
        playMusicNote(semitoneToFreq(semitone + 12), now, NOTE_DURATION, 'square');
    }

    musicNoteIndex++;
    musicSchedulerTimer = setTimeout(scheduleNextMusicStep, NOTE_DURATION * 1000);
}

function startMusic() {
    if (!musicOn) return;
    ensureAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (musicSchedulerTimer) return; // already running
    musicNoteIndex = 0;
    scheduleNextMusicStep();
}

function stopMusic() {
    if (musicSchedulerTimer) {
        clearTimeout(musicSchedulerTimer);
        musicSchedulerTimer = null;
    }
}

function setMusicIntensity(intensity) {
    musicIntensity = intensity;
}

function setMusicVolume(vol) {
    musicVolume = vol;
    if (musicGainNode) musicGainNode.gain.value = vol;
}

// Browsers block audio until a user gesture; start music on first
// interaction anywhere on the page if it's supposed to be on.
function unlockAudioOnFirstInteraction() {
    if (musicOn) startMusic();
}
window.addEventListener('pointerdown', unlockAudioOnFirstInteraction, { once: true });
window.addEventListener('keydown', unlockAudioOnFirstInteraction, { once: true });

const musicToggleBtn = document.getElementById('music-toggle-btn');
const musicVolumeSlider = document.getElementById('music-volume-slider');

function applyMusicUI() {
    musicToggleBtn.classList.toggle('is-on', musicOn);
    musicToggleBtn.textContent = musicOn ? 'On' : 'Off';
    musicVolumeSlider.value = Math.round(musicVolume * 100);
}

musicToggleBtn.addEventListener('click', () => {
    musicOn = !musicOn;
    saveSetting('musicOn', musicOn);
    applyMusicUI();
    if (musicOn) startMusic(); else stopMusic();
});

musicVolumeSlider.addEventListener('input', (e) => {
    setMusicVolume(parseInt(e.target.value, 10) / 100);
    saveSetting('musicVolume', musicVolume);
});

applyMusicUI();

// =====================================================================
// Controls Remapping
// =====================================================================

// Friendly display names for keys that don't read well as raw e.key values
const KEY_DISPLAY_NAMES = {
    arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
    ' ': 'Space', control: 'Ctrl', shift: 'Shift', alt: 'Alt',
    escape: 'Esc', enter: 'Enter', tab: 'Tab'
};

function displayKeyName(key) {
    if (KEY_DISPLAY_NAMES[key]) return KEY_DISPLAY_NAMES[key];
    if (key.length === 1) return key.toUpperCase();
    return key.charAt(0).toUpperCase() + key.slice(1);
}

function refreshRemapLabels() {
    document.querySelectorAll('.remap-btn').forEach(btn => {
        const dir = btn.dataset.direction;
        const keys = keybinds[dir] || [];
        btn.textContent = keys.length ? keys.map(displayKeyName).join(' / ') : '—';
        btn.classList.remove('listening');
    });
}

let remapListenDirection = null;

function startRemapListening(direction, btn) {
    // Cancel any other button still waiting for input
    document.querySelectorAll('.remap-btn').forEach(b => b.classList.remove('listening'));
    remapListenDirection = direction;
    btn.classList.add('listening');
    btn.textContent = 'Press a key…';
}

window.addEventListener('keydown', (e) => {
    if (!remapListenDirection) return;
    e.preventDefault();

    const newKey = e.key.toLowerCase();
    const direction = remapListenDirection;
    remapListenDirection = null;

    // Don't allow Escape to become a movement key - it's reserved for
    // closing menus, and binding it here would create a confusing trap.
    if (newKey === 'escape') {
        refreshRemapLabels();
        return;
    }

    // Remove this key from any other direction first, so the same key
    // can't accidentally drive two directions at once.
    Object.keys(keybinds).forEach(dir => {
        keybinds[dir] = keybinds[dir].filter(k => k !== newKey);
    });

    keybinds[direction] = [newKey];
    saveKeybinds();
    refreshRemapLabels();
});

document.querySelectorAll('.remap-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        startRemapListening(btn.dataset.direction, btn);
    });
});

document.getElementById('controls-reset-btn').addEventListener('click', () => {
    keybinds = JSON.parse(JSON.stringify(DEFAULT_KEYBINDS));
    saveKeybinds();
    refreshRemapLabels();
});

// =====================================================================
// Hidden Dev Console unlock: long-press the Dark/Light Mode toggle
// =====================================================================

const devConsole = document.getElementById('dev-console');
const devUnlockHint = document.getElementById('dev-unlock-hint');
const themeOptionRow = document.getElementById('theme-option-row');
const LONG_PRESS_MS = 1200;
let devUnlocked = loadSetting('devUnlocked', false);
let longPressTimer = null;

function showUnlockedUI() {
    devUnlockHint.classList.remove('hidden');
    document.getElementById('dev-open-btn').classList.remove('hidden');
}

function hideUnlockedUI() {
    devUnlockHint.classList.add('hidden');
    document.getElementById('dev-open-btn').classList.add('hidden');
}

function unlockDevConsole() {
    if (devUnlocked) return;
    devUnlocked = true;
    saveSetting('devUnlocked', true);
    showUnlockedUI();
    themeOptionRow.classList.remove('long-pressing');
}

function lockDevConsole() {
    devUnlocked = false;
    saveSetting('devUnlocked', false);
    hideUnlockedUI();
    devConsole.classList.add('hidden');
}

function startLongPress(e) {
    // Prevent iOS Safari's text-selection / "Look Up" callout from
    // hijacking the hold gesture before our timer can fire. Skip this
    // when the press starts on the toggle button itself so its normal
    // click still works immediately.
    if (e.target !== themeToggleBtn && e.cancelable) e.preventDefault();
    clearTimeout(longPressTimer);
    themeOptionRow.classList.add('long-pressing');
    longPressTimer = setTimeout(unlockDevConsole, LONG_PRESS_MS);
}

function cancelLongPress() {
    clearTimeout(longPressTimer);
    themeOptionRow.classList.remove('long-pressing');
}

// touchstart is the authoritative event on mobile; passive:false so
// preventDefault() actually works. We skip binding mousedown when touch
// is available to avoid iOS firing both and double-triggering the timer.
let usingTouch = false;
themeOptionRow.addEventListener('touchstart', (e) => {
    usingTouch = true;
    startLongPress(e);
}, { passive: false });

themeOptionRow.addEventListener('mousedown', (e) => {
    if (usingTouch) return;
    startLongPress(e);
});

['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(evt => {
    themeOptionRow.addEventListener(evt, cancelLongPress);
});

if (devUnlocked) {
    showUnlockedUI();
}

document.getElementById('dev-open-btn').addEventListener('click', () => {
    openDevConsole();
});

// =====================================================================
// Dev Console: full sandbox controls
// =====================================================================

function openDevConsole() {
    syncDevConsoleFields();
    devConsole.classList.remove('hidden');
}

function syncDevConsoleFields() {
    document.getElementById('dev-speed').value = devSpeedMultiplier;
    document.getElementById('dev-speed-val').textContent = devSpeedMultiplier.toFixed(2) + 'x';
    document.getElementById('dev-score').value = score || 0;
    document.getElementById('dev-level').value = level || 1;
    document.getElementById('dev-hp').value = hp || 0;
    const godBtn = document.getElementById('dev-godmode-btn');
    godBtn.classList.toggle('is-on', godMode);
    godBtn.textContent = godMode ? 'ON' : 'OFF';

    const noActiveRun = !gameInterval;
    document.querySelectorAll('.dev-apply-btn, #dev-spawn-enemy, #dev-spawn-boss, #dev-give-all')
        .forEach(btn => { btn.disabled = noActiveRun; btn.style.opacity = noActiveRun ? 0.4 : 1; });
}

document.getElementById('dev-close-btn').addEventListener('click', () => {
    devConsole.classList.add('hidden');
});

document.getElementById('dev-hide-menu-btn').addEventListener('click', () => {
    lockDevConsole();
});

document.getElementById('dev-speed').addEventListener('input', (e) => {
    devSpeedMultiplier = parseFloat(e.target.value);
    document.getElementById('dev-speed-val').textContent = devSpeedMultiplier.toFixed(2) + 'x';
});

function stepDevSpeed(delta) {
    const slider = document.getElementById('dev-speed');
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    let next = Math.round((devSpeedMultiplier + delta) * 100) / 100;
    next = Math.min(max, Math.max(min, next));
    devSpeedMultiplier = next;
    slider.value = next;
    document.getElementById('dev-speed-val').textContent = next.toFixed(2) + 'x';
}

document.getElementById('dev-speed-up').addEventListener('click', () => stepDevSpeed(0.1));
document.getElementById('dev-speed-down').addEventListener('click', () => stepDevSpeed(-0.1));

document.getElementById('dev-godmode-btn').addEventListener('click', (e) => {
    godMode = !godMode;
    e.target.classList.toggle('is-on', godMode);
    e.target.textContent = godMode ? 'ON' : 'OFF';
});

document.querySelectorAll('.dev-apply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!gameInterval) return; // no active run to edit
        const target = btn.dataset.target;
        if (target === 'score') {
            score = parseInt(document.getElementById('dev-score').value, 10) || 0;
        } else if (target === 'level') {
            const targetLevel = Math.max(1, parseInt(document.getElementById('dev-level').value, 10) || 1);
            level = targetLevel;
            xp = 0;
            xpNeeded = Math.floor(3 * Math.pow(1.35, targetLevel - 1));
        } else if (target === 'hp') {
            hp = Math.max(0, parseInt(document.getElementById('dev-hp').value, 10) || 0);
            if (hp <= 0) gameOver();
        }
        updateHUD();
    });
});

document.getElementById('dev-spawn-enemy').addEventListener('click', () => {
    if (!gameInterval) return;
    enemies.push(getSafeGridPosition());
});

document.getElementById('dev-spawn-boss').addEventListener('click', () => {
    if (!gameInterval) return;
    spawnBoss();
});

document.getElementById('dev-give-all').addEventListener('click', () => {
    if (!gameInterval) return;
    maxHpCap = Math.max(maxHpCap, 7);
    hp = maxHpCap;
    shieldCount = Math.max(shieldCount, 3);
    hasSpikes = true;
    attackSpeed = Math.max(attackSpeed, 4.5);
    maxFoodCount = Math.max(maxFoodCount, 4);
    speedBonus = Math.max(speedBonus, 0.15);
    scoreMultiplier = Math.max(scoreMultiplier, 2);
    hasSecondWind = true;
    secondWindUsed = false;
    enemySpawnReduction = Math.max(enemySpawnReduction, 0.3);
    hasSplashDamage = true;
    refillFood();
    updateHUD();
});

window.onload = () => {
    resizeCanvas();
    // Game does not auto-start anymore; the main menu is shown first
    // and initGame() runs only when the player presses Start.
    startMenuDemo();
};
