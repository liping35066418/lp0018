class SeededRandom {
  constructor(seed) {
    this.seed = seed >>> 0;
    if (this.seed === 0) this.seed = 1;
  }
  
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }
}

class ParkourGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.W = this.canvas.width;
    this.H = this.canvas.height;
    
    this.backendUrl = 'http://localhost:9618/api';
    
    this.gameState = 'menu';
    this.gameId = null;
    this.seed = null;
    this.config = null;
    
    this.rng = null;
    this.state = null;
    
    this.lastFrameTime = 0;
    this.accumulator = 0;
    
    this.actions = [];
    this.elapsedGameTime = 0;
    
    this.pendingActions = {
      jump: false,
      crouch: false,
      laneChange: 0,
      dash: false
    };
    this.lastCrouchState = false;
    
    this.upKeyHoldTime = 0;
    this.lastJumpTime = 0;
    this.dashDoubleTapWindow = 300;
    this.dashLongPressThreshold = 200;
    this.upKeyPressed = false;
    
    this.menuSortMode = 'score';
    this.gameoverSortMode = 'score';
    this.lastGameResult = null;
    
    this.particles = [];
    this.shakeIntensity = 0;
    this.shakeDecay = 0.85;
    
    this.clouds = [];
    this.mountains = [];
    this.buildings = [];
    this.groundOffset = 0;
    
    this.keys = {};
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.isTouchDevice = this.detectTouchDevice();
    
    this.initBackground();
    this.bindEvents();
    this.loadHighScores();
    this.resizeCanvas();
    this.showTouchControls();
    this.gameLoop();
  }
  
  detectTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
  
  showTouchControls() {
    const touchControls = document.getElementById('touch-controls');
    if (this.isTouchDevice) {
      touchControls.classList.remove('hidden');
    }
  }
  
  resizeCanvas() {
    const container = document.getElementById('game-container');
    const ratio = this.W / this.H;
    let width = window.innerWidth;
    let height = window.innerHeight;
    
    if (width / height > ratio) {
      width = height * ratio;
    } else {
      height = width / ratio;
    }
    
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }
  
  initBackground() {
    for (let i = 0; i < 8; i++) {
      this.clouds.push({
        x: Math.random() * this.W * 2,
        y: 30 + Math.random() * 120,
        width: 60 + Math.random() * 100,
        speed: 0.3 + Math.random() * 0.5
      });
    }
    
    for (let i = 0; i < 15; i++) {
      this.mountains.push({
        x: i * 200,
        height: 80 + Math.random() * 120,
        width: 200 + Math.random() * 100
      });
    }
    
    for (let i = 0; i < 20; i++) {
      this.buildings.push({
        x: i * 120,
        height: 60 + Math.random() * 150,
        width: 80 + Math.random() * 50,
        windows: Math.floor(Math.random() * 6) + 2
      });
    }
  }
  
  bindEvents() {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    window.addEventListener('resize', () => this.resizeCanvas());
    
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    
    document.getElementById('start-btn').addEventListener('click', () => this.startGame());
    document.getElementById('restart-btn').addEventListener('click', () => this.startGame());
    document.getElementById('menu-btn').addEventListener('click', () => this.showMenu());
    
    const touchJump = document.getElementById('touch-jump');
    const touchCrouch = document.getElementById('touch-crouch');
    const touchDash = document.getElementById('touch-dash');
    const touchLeft = document.getElementById('touch-left');
    const touchRight = document.getElementById('touch-right');
    
    if (touchJump) {
      touchJump.addEventListener('touchstart', (e) => { e.preventDefault(); this.triggerJump(); });
      touchJump.addEventListener('mousedown', (e) => { e.preventDefault(); this.triggerJump(); });
    }
    if (touchCrouch) {
      touchCrouch.addEventListener('touchstart', (e) => { e.preventDefault(); this.setCrouch(true); });
      touchCrouch.addEventListener('touchend', (e) => { e.preventDefault(); this.setCrouch(false); });
      touchCrouch.addEventListener('mousedown', (e) => { e.preventDefault(); this.setCrouch(true); });
      touchCrouch.addEventListener('mouseup', (e) => { e.preventDefault(); this.setCrouch(false); });
    }
    if (touchDash) {
      touchDash.addEventListener('touchstart', (e) => { e.preventDefault(); this.triggerDash(); });
      touchDash.addEventListener('mousedown', (e) => { e.preventDefault(); this.triggerDash(); });
    }
    if (touchLeft) {
      touchLeft.addEventListener('touchstart', (e) => { e.preventDefault(); this.triggerLaneChange(-1); });
      touchLeft.addEventListener('mousedown', (e) => { e.preventDefault(); this.triggerLaneChange(-1); });
    }
    if (touchRight) {
      touchRight.addEventListener('touchstart', (e) => { e.preventDefault(); this.triggerLaneChange(1); });
      touchRight.addEventListener('mousedown', (e) => { e.preventDefault(); this.triggerLaneChange(1); });
    }
    
    document.querySelectorAll('.sort-tab').forEach(tab => {
      tab.addEventListener('click', () => this.handleSortTabClick(tab));
    });
  }
  
  triggerJump() {
    if (this.gameState !== 'playing') return;
    if (!this.state || this.state.player.isJumping) return;
    this.pendingActions.jump = true;
    this.actions.push({ time: this.elapsedGameTime, type: 'jump' });
  }
  
  setCrouch(value) {
    if (this.gameState !== 'playing') return;
    if (this.lastCrouchState === value) return;
    this.lastCrouchState = value;
    this.pendingActions.crouch = value;
    this.actions.push({ time: this.elapsedGameTime, type: 'crouch', value });
  }
  
  triggerLaneChange(direction) {
    if (this.gameState !== 'playing') return;
    if (!this.state) return;
    const newLane = Math.max(-1, Math.min(1, this.state.player.lane + direction));
    if (newLane === this.state.player.lane) return;
    this.pendingActions.laneChange = direction;
    this.actions.push({ time: this.elapsedGameTime, type: 'laneChange', value: direction });
  }
  
  triggerDash() {
    if (this.gameState !== 'playing') return;
    if (!this.state) return;
    const p = this.state.player;
    if (p.isDashing || p.dashCooldownTimer > 0) return;
    this.pendingActions.dash = true;
    this.actions.push({ time: this.elapsedGameTime, type: 'dash' });
  }
  
  handleKeyDown(e) {
    if (this.gameState !== 'playing') return;
    
    switch(e.code) {
      case 'Space':
      case 'ArrowUp':
      case 'KeyW':
        e.preventDefault();
        const now = performance.now();
        const isDoubleTap = (now - this.lastJumpTime) < this.dashDoubleTapWindow;
        if (isDoubleTap && !this.state.player.isDashing && this.state.player.dashCooldownTimer <= 0) {
          this.triggerDash();
          this.lastJumpTime = 0;
        } else {
          if (!this.state.player.isJumping) {
            this.triggerJump();
          }
          this.lastJumpTime = now;
        }
        if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          this.upKeyPressed = true;
          this.upKeyHoldTime = 0;
        }
        break;
      case 'ArrowDown':
      case 'KeyS':
        e.preventDefault();
        this.setCrouch(true);
        break;
      case 'ArrowLeft':
      case 'KeyA':
        e.preventDefault();
        this.triggerLaneChange(-1);
        break;
      case 'ArrowRight':
      case 'KeyD':
        e.preventDefault();
        this.triggerLaneChange(1);
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        e.preventDefault();
        this.triggerDash();
        break;
    }
  }
  
  handleKeyUp(e) {
    switch(e.code) {
      case 'ArrowDown':
      case 'KeyS':
        this.setCrouch(false);
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.upKeyPressed = false;
        this.upKeyHoldTime = 0;
        break;
    }
  }
  
  handleTouchStart(e) {
    e.preventDefault();
    if (this.gameState !== 'playing') return;
    
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    this.touchStartX = touch.clientX - rect.left;
    this.touchStartY = touch.clientY - rect.top;
  }
  
  handleTouchEnd(e) {
    e.preventDefault();
    if (this.gameState !== 'playing') return;
    
    const touch = e.changedTouches[0];
    const rect = this.canvas.getBoundingClientRect();
    const endX = touch.clientX - rect.left;
    const endY = touch.clientY - rect.top;
    
    const diffX = endX - this.touchStartX;
    const diffY = endY - this.touchStartY;
    const absDiffX = Math.abs(diffX);
    const absDiffY = Math.abs(diffY);
    
    const minSwipe = 30;
    
    if (absDiffX < minSwipe && absDiffY < minSwipe) {
      const clickY = (this.touchStartY / rect.height) * this.H;
      if (clickY < this.H / 2) {
        this.triggerJump();
      } else {
        this.setCrouch(true);
        setTimeout(() => { this.setCrouch(false); }, 300);
      }
    } else if (absDiffX > absDiffY) {
      if (diffX > 0) {
        this.triggerLaneChange(1);
      } else {
        this.triggerLaneChange(-1);
      }
    } else {
      if (diffY > 0) {
        this.triggerDash();
      }
    }
  }
  
  handleTouchMove(e) {
    e.preventDefault();
  }
  
  async startGame() {
    const playerName = document.getElementById('player-name').value || '匿名玩家';
    this.playerName = playerName;
    
    try {
      const res = await fetch(`${this.backendUrl}/game/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName })
      });
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      this.gameId = data.data.gameId;
      this.seed = data.data.seed;
      this.config = data.data.config;
      
      this.rng = new SeededRandom(this.seed);
      this.createState();
      
      this.actions = [];
      this.elapsedGameTime = 0;
      this.pendingActions = { jump: false, crouch: false, laneChange: 0, dash: false };
      this.lastCrouchState = false;
      this.upKeyHoldTime = 0;
      this.upKeyPressed = false;
      this.lastJumpTime = 0;
      this.particles = [];
      this.shakeIntensity = 0;
      this.accumulator = 0;
      
      this.gameState = 'playing';
      
      this.hideOverlay('start-screen');
      this.hideOverlay('gameover-screen');
      this.updateHUD();
      
    } catch (err) {
      console.error('启动游戏失败:', err);
      alert('无法连接到后端服务，请确保后端已在 9618 端口启动');
    }
  }
  
  createState() {
    const rng = this.rng;
    const cfg = this.config;
    
    this.state = {
      elapsedTime: 0,
      score: 0,
      lives: cfg.maxLives,
      combo: 0,
      speed: cfg.baseSpeed,
      timeLeft: cfg.gameTime,
      difficultyLevel: 1,
      dashCount: 0,
      dashBreakCount: 0,
      player: {
        x: 120,
        y: 0,
        width: 50,
        height: 80,
        velocityY: 0,
        isJumping: false,
        isCrouching: false,
        invincible: false,
        invincibleTimer: 0,
        shield: false,
        lane: 0,
        animFrame: 0,
        animTimer: 0,
        isDashing: false,
        dashTimer: 0,
        dashCooldownTimer: 0
      },
      obstacles: [],
      items: [],
      lastObstacleX: 0,
      lastItemX: 0,
      effects: [],
      status: 'playing'
    };
    
    this.state.player.y = cfg.canvasHeight - cfg.groundHeight - this.state.player.height;
    
    const scene = this.generateInitialScene();
    this.state.obstacles = scene.obstacles;
    this.state.items = scene.items;
    this.state.lastObstacleX = Math.max(...this.state.obstacles.map(o => o.x));
    this.state.lastItemX = Math.max(...this.state.items.map(i => i.x));
  }
  
  generateInitialScene() {
    const obstacles = [];
    const items = [];
    let lastObstacleX = 800;
    let lastItemX = 600;
    
    for (let i = 0; i < 5; i++) {
      const obstacle = this.generateObstacle(0, lastObstacleX);
      obstacles.push(obstacle);
      lastObstacleX = obstacle.x;
    }
    
    for (let i = 0; i < 3; i++) {
      const item = this.generateItem(0, lastItemX);
      items.push(item);
      lastItemX = item.x;
    }
    
    return { obstacles, items };
  }
  
  getDifficultyLevel(elapsedTime) {
    return Math.min(
      Math.floor(elapsedTime / this.config.difficultyInterval) + 1,
      20
    );
  }
  
  getCurrentSpeed(elapsedTime) {
    const level = this.getDifficultyLevel(elapsedTime);
    return Math.min(
      this.config.baseSpeed + (level - 1) * this.config.difficultyStep,
      this.config.maxSpeed
    );
  }
  
  getObstacleSpawnInterval(elapsedTime) {
    const level = this.getDifficultyLevel(elapsedTime);
    const baseInterval = 1800;
    return Math.max(baseInterval - level * 80, 600);
  }
  
  getItemSpawnInterval(elapsedTime) {
    const level = this.getDifficultyLevel(elapsedTime);
    const baseInterval = 2500;
    return Math.max(baseInterval - level * 60, 1000);
  }
  
  generateObstacle(elapsedTime, lastX) {
    const rng = this.rng;
    const level = this.getDifficultyLevel(elapsedTime);
    const minGap = Math.max(250 - level * 10, 150);
    
    const availableTypes = this.config.obstacleTypes.filter((_, index) => {
      if (level < 2 && index >= 2) return false;
      if (level < 4 && index >= 4) return false;
      return true;
    });
    
    const typeIndex = Math.floor(rng.next() * availableTypes.length);
    const obstacleType = availableTypes[typeIndex];
    
    return {
      id: Math.floor(rng.next() * 1e9),
      ...obstacleType,
      x: lastX + minGap + rng.next() * 200,
      y: obstacleType.elevated 
        ? this.config.canvasHeight - this.config.groundHeight - obstacleType.height - obstacleType.elevatedHeight
        : this.config.canvasHeight - this.config.groundHeight - obstacleType.height
    };
  }
  
  generateItem(elapsedTime, lastX) {
    const rng = this.rng;
    const level = this.getDifficultyLevel(elapsedTime);
    const minGap = 150;
    
    const rand = rng.next();
    let cumulative = 0;
    let selectedType = this.config.itemTypes[0];
    
    for (const itemType of this.config.itemTypes) {
      let prob = itemType.probability;
      if (itemType.type === 'heart' && level > 5) prob *= 0.6;
      if (itemType.type === 'star' && level > 8) prob *= 1.2;
      cumulative += prob;
      if (rand <= cumulative) {
        selectedType = itemType;
        break;
      }
    }
    
    const heightVariation = rng.next() > 0.5;
    
    return {
      id: Math.floor(rng.next() * 1e9),
      ...selectedType,
      x: lastX + minGap + rng.next() * 300,
      y: heightVariation
        ? this.config.canvasHeight - this.config.groundHeight - 80 - rng.next() * 100
        : this.config.canvasHeight - this.config.groundHeight - 40 - rng.next() * 50
    };
  }
  
  checkCollision(player, entity) {
    const playerBox = {
      x: player.x + player.width * 0.15,
      y: player.y + player.height * 0.1,
      width: player.width * 0.7,
      height: player.height * (player.isCrouching ? 0.6 : 0.9)
    };
    
    const entityBox = {
      x: entity.x + entity.width * 0.1,
      y: entity.y + entity.height * 0.1,
      width: entity.width * 0.8,
      height: entity.height * 0.8
    };
    
    return playerBox.x < entityBox.x + entityBox.width &&
           playerBox.x + playerBox.width > entityBox.x &&
           playerBox.y < entityBox.y + entityBox.height &&
           playerBox.y + playerBox.height > entityBox.y;
  }
  
  handleObstacleCollision(player, obstacle) {
    if (player.isDashing) {
      return { hit: false, scoreGained: obstacle.score, dashBreak: true };
    }
    if (player.invincible || player.shield) {
      if (player.shield) {
        player.shield = false;
      }
      return { hit: false, scoreGained: obstacle.score * 2 };
    }
    return { hit: true, damage: obstacle.damage, scoreGained: 0 };
  }
  
  handleItemCollision(player, item) {
    const result = { scoreGained: item.score || 0 };
    
    if (item.heal) {
      result.heal = item.heal;
    }
    if (item.invincible) {
      result.invincible = 5000;
    }
    if (item.timeBonus) {
      result.timeBonus = item.timeBonus;
    }
    if (item.shield) {
      result.shield = true;
    }
    
    return result;
  }
  
  calculateScore(baseScore, elapsedTime, combo) {
    const level = this.getDifficultyLevel(elapsedTime);
    const comboMultiplier = 1 + combo * 0.1;
    const levelMultiplier = 1 + (level - 1) * 0.05;
    return Math.floor(baseScore * comboMultiplier * levelMultiplier);
  }
  
  step(deltaTime, action) {
    const state = this.state;
    const cfg = this.config;
    
    if (state.status !== 'playing') return;
    
    if (this.upKeyPressed) {
      this.upKeyHoldTime += deltaTime;
      if (this.upKeyHoldTime >= this.dashLongPressThreshold && !state.player.isDashing && state.player.dashCooldownTimer <= 0) {
        this.triggerDash();
        this.upKeyHoldTime = 0;
      }
    }
    
    state.elapsedTime += deltaTime;
    const baseSpeed = this.getCurrentSpeed(state.elapsedTime);
    state.difficultyLevel = this.getDifficultyLevel(state.elapsedTime);
    state.timeLeft = Math.max(0, cfg.gameTime - Math.floor(state.elapsedTime / 1000));
    
    const player = state.player;
    if (action) {
      if (action.jump && !player.isJumping) {
        player.velocityY = cfg.jumpForce;
        player.isJumping = true;
        this.createJumpParticles();
      }
      if (action.crouch !== undefined) {
        player.isCrouching = action.crouch;
      }
      if (action.laneChange) {
        player.lane = Math.max(-1, Math.min(1, player.lane + action.laneChange));
      }
      if (action.dash && !player.isDashing && player.dashCooldownTimer <= 0) {
        player.isDashing = true;
        player.dashTimer = cfg.dashDuration;
        player.dashCooldownTimer = cfg.dashCooldown + cfg.dashDuration;
        state.dashCount++;
        this.createDashParticles();
      }
    }
    
    if (player.isDashing) {
      player.dashTimer -= deltaTime;
      if (player.dashTimer <= 0) {
        player.isDashing = false;
      }
    }
    if (player.dashCooldownTimer > 0) {
      player.dashCooldownTimer -= deltaTime;
    }
    
    state.speed = player.isDashing ? baseSpeed * cfg.dashSpeedMultiplier : baseSpeed;
    
    if (player.invincibleTimer > 0) {
      player.invincibleTimer -= deltaTime;
      if (player.invincibleTimer <= 0) {
        player.invincible = false;
      }
    }
    
    player.velocityY += cfg.gravity;
    player.y += player.velocityY;
    
    const playerHeight = player.isCrouching ? player.height * 0.6 : player.height;
    const groundY = cfg.canvasHeight - cfg.groundHeight - playerHeight;
    
    if (player.y >= groundY) {
      player.y = groundY;
      player.velocityY = 0;
      player.isJumping = false;
    }
    
    player.x = 120 + player.lane * 30;
    
    player.animTimer += deltaTime;
    if (player.animTimer > 50) {
      player.animFrame++;
      player.animTimer = 0;
    }
    
    const scrollAmount = state.speed * (deltaTime / cfg.physicsStep);
    state.obstacles.forEach(obs => { obs.x -= scrollAmount; });
    state.items.forEach(item => { item.x -= scrollAmount; });
    state.lastObstacleX -= scrollAmount;
    state.lastItemX -= scrollAmount;
    
    state.obstacles = state.obstacles.filter(obs => obs.x + obs.width > -100);
    state.items = state.items.filter(item => item.x + item.width > -100);
    
    const spawnInterval = this.getObstacleSpawnInterval(state.elapsedTime);
    if (state.lastObstacleX < cfg.canvasWidth + 100 && this.rng.next() < deltaTime / spawnInterval) {
      const newObstacle = this.generateObstacle(state.elapsedTime, cfg.canvasWidth + 200);
      state.obstacles.push(newObstacle);
      state.lastObstacleX = newObstacle.x;
    }
    
    const itemInterval = this.getItemSpawnInterval(state.elapsedTime);
    if (state.lastItemX < cfg.canvasWidth + 100 && this.rng.next() < deltaTime / itemInterval) {
      const newItem = this.generateItem(state.elapsedTime, cfg.canvasWidth + 300);
      state.items.push(newItem);
      state.lastItemX = newItem.x;
    }
    
    state.obstacles = state.obstacles.filter(obs => {
      if (this.checkCollision(player, obs)) {
        const result = this.handleObstacleCollision(player, obs);
        if (result.hit) {
          state.lives -= result.damage;
          state.combo = 0;
          this.screenShake();
          this.createDamageParticles();
          state.effects.push({
            id: Date.now(),
            type: 'damage',
            x: player.x + player.width / 2,
            y: player.y + player.height / 2,
            duration: 500,
            startTime: state.elapsedTime
          });
          if (state.lives <= 0) {
            state.status = 'gameover';
          }
        } else {
          let gainedScore = result.scoreGained;
          if (result.dashBreak) {
            gainedScore = obs.score * cfg.dashBreakScoreMultiplier;
            state.dashBreakCount++;
            this.createDashBreakParticles(obs.x + obs.width / 2, obs.y + obs.height / 2);
            state.effects.push({
              id: Date.now(),
              type: 'collect',
              x: obs.x + obs.width / 2,
              y: obs.y + obs.height / 2,
              color: '#ff6b00',
              text: `💥 +${gainedScore}`,
              duration: 900,
              startTime: state.elapsedTime
            });
          }
          state.score += this.calculateScore(gainedScore, state.elapsedTime, state.combo);
          state.combo++;
        }
        return false;
      }
      return true;
    });
    
    state.items = state.items.filter(item => {
      if (this.checkCollision(player, item)) {
        const result = this.handleItemCollision(player, item);
        state.score += this.calculateScore(result.scoreGained, state.elapsedTime, state.combo);
        if (result.heal) {
          state.lives = Math.min(cfg.maxLives, state.lives + result.heal);
        }
        if (result.invincible) {
          player.invincible = true;
          player.invincibleTimer = result.invincible;
        }
        if (result.shield) {
          player.shield = true;
        }
        if (result.timeBonus) {
          state.timeLeft += result.timeBonus;
        }
        state.combo++;
        this.createCollectParticles(item.x + item.width / 2, item.y + item.height / 2, item.color);
        state.effects.push({
          id: Date.now(),
          type: 'collect',
          x: item.x + item.width / 2,
          y: item.y + item.height / 2,
          color: item.color,
          text: `+${result.scoreGained}`,
          duration: 800,
          startTime: state.elapsedTime
        });
        return false;
      }
      return true;
    });
    
    state.score += Math.floor(scrollAmount * 0.1);
    
    state.effects = state.effects.filter(e => state.elapsedTime - e.startTime < e.duration);
    
    if (state.timeLeft <= 0 && state.status === 'playing') {
      state.status = 'gameover';
    }
    
    if (state.status === 'gameover') {
      this.endGame();
    }
    
    this.updateHUD();
  }
  
  async endGame() {
    if (this.gameState !== 'playing') return;
    this.gameState = 'gameover';
    
    try {
      const res = await fetch(`${this.backendUrl}/game/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: this.gameId,
          playerName: this.playerName,
          actions: this.actions,
          clientScore: this.state.score
        })
      });
      
      const data = await res.json();
      if (data.success) {
        this.showGameOver(data.data);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('结束游戏失败:', err);
      this.showGameOver({
        finalScore: this.state.score,
        rank: '--',
        highScores: [],
        maxLives: this.config.maxLives,
        verified: false
      });
    }
  }
  
  showMenu() {
    this.gameState = 'menu';
    this.hideOverlay('gameover-screen');
    this.showOverlay('start-screen');
    this.loadHighScores();
  }
  
  async loadHighScores() {
    try {
      const res = await fetch(`${this.backendUrl}/highscores`);
      const data = await res.json();
      if (data.success) {
        this.menuSortMode = 'score';
        const tabs = document.querySelectorAll('#menu-sort-tabs .sort-tab');
        tabs.forEach(t => t.classList.toggle('active', t.dataset.sort === 'score'));
        this.renderHighScores(data.data, 'highscores-list', 'score');
      }
    } catch (err) {
      console.error('加载排行榜失败:', err);
    }
  }
  
  sortScores(scores, sortMode) {
    const sorted = [...scores];
    if (sortMode === 'time') {
      sorted.sort((a, b) => (b.timeSurvived || 0) - (a.timeSurvived || 0));
    } else {
      sorted.sort((a, b) => b.score - a.score);
    }
    return sorted;
  }
  
  renderHighScores(scores, elementId, sortMode = 'score') {
    const container = document.getElementById(elementId);
    if (!scores || scores.length === 0) {
      container.innerHTML = '<p class="empty">暂无记录，快来创造第一名！</p>';
      return;
    }
    
    const sorted = this.sortScores(scores, sortMode);
    
    container.innerHTML = sorted.map((s, i) => `
      <div class="highscore-item" data-name="${s.name}" data-score="${s.score}" data-time="${s.timeSurvived || 0}">
        <div class="highscore-rank">
          <span class="rank-num ${i < 3 ? `rank-${i+1}` : 'rank-other'}">${i + 1}</span>
          <span class="player-nickname">${s.name}</span>
        </div>
        <div class="hs-info">
          <span class="hs-score">${s.score.toLocaleString()}</span>
          <span class="hs-time">⏱ ${s.timeSurvived || 0}s</span>
        </div>
      </div>
    `).join('');
  }
  
  highlightCurrentPlayer(elementId, sortMode) {
    const container = document.getElementById(elementId);
    const items = container.querySelectorAll('.highscore-item');
    items.forEach(it => it.classList.remove('current'));
    
    if (!this.lastGameResult || elementId !== 'gameover-highscores-list') return;
    
    const playerName = this.lastGameResult.playerName;
    const playerScore = this.lastGameResult.finalScore;
    const playerTime = this.lastGameResult.timeSurvived;
    
    const sortedItems = Array.from(items);
    let bestMatch = -1;
    let bestMatchScore = -Infinity;
    
    sortedItems.forEach((item, idx) => {
      const name = item.dataset.name;
      const score = parseInt(item.dataset.score);
      const time = parseInt(item.dataset.time);
      
      let matchScore = 0;
      if (name === playerName) matchScore += 100;
      if (sortMode === 'score' && score === playerScore) matchScore += 50;
      if (sortMode === 'time' && time === playerTime) matchScore += 50;
      if (score === playerScore && time === playerTime) matchScore += 200;
      
      if (matchScore > bestMatchScore) {
        bestMatchScore = matchScore;
        bestMatch = idx;
      }
    });
    
    if (bestMatch >= 0 && bestMatchScore > 0) {
      sortedItems[bestMatch].classList.add('current');
    }
  }
  
  handleSortTabClick(tab) {
    const sortMode = tab.dataset.sort;
    const targetId = tab.dataset.target;
    const tabsContainer = tab.parentElement;
    
    tabsContainer.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    if (targetId === 'highscores-list') {
      this.menuSortMode = sortMode;
      fetch(`${this.backendUrl}/highscores`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            this.renderHighScores(data.data, targetId, sortMode);
          }
        })
        .catch(err => console.error('加载排行榜失败:', err));
    } else if (targetId === 'gameover-highscores-list' && this.lastGameResult) {
      this.gameoverSortMode = sortMode;
      this.renderHighScores(this.lastGameResult.highScores, targetId, sortMode);
      this.highlightCurrentPlayer(targetId, sortMode);
    }
  }
  
  showGameOver(result) {
    this.lastGameResult = {
      ...result,
      playerName: this.playerName,
      finalScore: result.finalScore,
      timeSurvived: result.timeSurvived !== undefined ? result.timeSurvived : Math.floor(this.state.elapsedTime / 1000)
    };
    
    document.getElementById('final-score').textContent = result.finalScore.toLocaleString();
    document.getElementById('final-rank').textContent = result.rank ? `#${result.rank}` : '#--';
    document.getElementById('final-difficulty').textContent = `Lv.${this.state.difficultyLevel}`;
    document.getElementById('final-time').textContent = `${this.lastGameResult.timeSurvived}s`;
    
    document.getElementById('final-dash-count').textContent = result.dashCount !== undefined ? result.dashCount : this.state.dashCount;
    document.getElementById('final-dash-break').textContent = result.dashBreakCount !== undefined ? result.dashBreakCount : this.state.dashBreakCount;
    
    const verifyBadge = document.getElementById('verify-badge');
    if (verifyBadge) {
      verifyBadge.textContent = result.verified ? '✓ 分数已验证' : '⚠ 分数未验证';
      verifyBadge.style.color = result.verified ? '#4caf50' : '#ff9800';
    }
    
    this.gameoverSortMode = 'score';
    const tabs = document.querySelectorAll('#gameover-sort-tabs .sort-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.sort === 'score'));
    
    this.renderHighScores(result.highScores, 'gameover-highscores-list', 'score');
    this.highlightCurrentPlayer('gameover-highscores-list', 'score');
    
    this.showOverlay('gameover-screen');
  }
  
  showOverlay(id) {
    document.getElementById(id).classList.remove('hidden');
  }
  
  hideOverlay(id) {
    document.getElementById(id).classList.add('hidden');
  }
  
  updateHUD() {
    if (!this.state) return;
    
    document.getElementById('score-value').textContent = this.state.score.toLocaleString();
    
    const mins = Math.floor(this.state.timeLeft / 60);
    const secs = this.state.timeLeft % 60;
    document.getElementById('time-value').textContent = 
      `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    document.getElementById('difficulty-value').textContent = `Lv.${this.state.difficultyLevel}`;
    
    const livesPanel = document.getElementById('lives-panel');
    const hearts = livesPanel.querySelectorAll('.heart');
    hearts.forEach((h, i) => {
      h.classList.toggle('lost', i >= this.state.lives);
    });
    
    const comboPanel = document.getElementById('combo-panel');
    const comboValue = document.getElementById('combo-value');
    if (this.state.combo > 1) {
      comboPanel.classList.add('active');
      comboValue.textContent = `${this.state.combo} COMBO!`;
    } else {
      comboPanel.classList.remove('active');
    }
    
    const dashPanel = document.getElementById('dash-panel');
    const dashBar = document.getElementById('dash-bar');
    const dashText = document.getElementById('dash-text');
    const p = this.state.player;
    const cfg = this.config;
    
    dashPanel.classList.remove('ready', 'dashing');
    dashBar.classList.remove('cooldown');
    
    if (p.isDashing) {
      const progress = Math.max(0, p.dashTimer / cfg.dashDuration);
      dashBar.style.width = `${progress * 100}%`;
      dashText.textContent = `冲刺中 ${(p.dashTimer / 1000).toFixed(1)}s`;
      dashPanel.classList.add('dashing');
    } else if (p.dashCooldownTimer > 0) {
      const cdTotal = cfg.dashCooldown;
      const cdRemaining = Math.max(0, p.dashCooldownTimer - cfg.dashDuration);
      const progress = 1 - (cdRemaining / cdTotal);
      dashBar.style.width = `${progress * 100}%`;
      dashBar.classList.add('cooldown');
      dashText.textContent = `冷却 ${(cdRemaining / 1000).toFixed(1)}s`;
    } else {
      dashBar.style.width = '100%';
      dashText.textContent = '冲刺就绪';
      dashPanel.classList.add('ready');
    }
    
    const statusPanel = document.getElementById('status-panel');
    let badges = '';
    if (p.isDashing) {
      badges += '<span class="status-badge dashing-badge">⚡ 冲刺中</span>';
    }
    if (this.state.player.invincible) {
      badges += '<span class="status-badge" style="background: linear-gradient(135deg, #ffd700, #ff9800);">⭐ 无敌</span>';
    }
    if (this.state.player.shield) {
      badges += '<span class="status-badge" style="background: linear-gradient(135deg, #2196f3, #3f51b5);">🛡️ 护盾</span>';
    }
    statusPanel.innerHTML = badges;
  }
  
  addEffect(effect) {
    this.state.effects.push({
      ...effect,
      startTime: this.state.elapsedTime
    });
  }
  
  screenShake() {
    this.shakeIntensity = 15;
    this.shakeDecay = 0.85;
  }
  
  createDamageParticles() {
    for (let i = 0; i < 20; i++) {
      this.particles.push({
        x: this.state.player.x + this.state.player.width / 2,
        y: this.state.player.y + this.state.player.height / 2,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1,
        decay: 0.02,
        size: 3 + Math.random() * 5,
        color: `hsl(${Math.random() * 30}, 100%, 60%)`
      });
    }
  }
  
  createCollectParticles(x, y, color) {
    for (let i = 0; i < 15; i++) {
      const angle = (Math.PI * 2 * i) / 15;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * 5,
        vy: Math.sin(angle) * 5,
        life: 1,
        decay: 0.025,
        size: 4 + Math.random() * 4,
        color: color || '#ffd700'
      });
    }
  }
  
  createJumpParticles() {
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: this.state.player.x + this.state.player.width / 2,
        y: this.state.player.y + this.state.player.height,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * 3,
        life: 1,
        decay: 0.04,
        size: 2 + Math.random() * 3,
        color: '#a0a0a0'
      });
    }
  }
  
  createDashParticles() {
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        x: this.state.player.x + this.state.player.width / 2,
        y: this.state.player.y + this.state.player.height / 2,
        vx: -5 - Math.random() * 8,
        vy: (Math.random() - 0.5) * 6,
        life: 1,
        decay: 0.03,
        size: 4 + Math.random() * 5,
        color: `hsl(${30 + Math.random() * 30}, 100%, ${50 + Math.random() * 20}%)`
      });
    }
  }
  
  createDashBreakParticles(x, y) {
    for (let i = 0; i < 25; i++) {
      const angle = (Math.PI * 2 * i) / 25;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * (3 + Math.random() * 5),
        vy: Math.sin(angle) * (3 + Math.random() * 5) - 2,
        life: 1,
        decay: 0.025,
        size: 3 + Math.random() * 6,
        color: i % 2 === 0 
          ? `hsl(${Math.random() * 30}, 100%, 60%)` 
          : `hsl(${40 + Math.random() * 20}, 100%, 55%)`
      });
    }
  }
  
  updateParticles() {
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.life -= p.decay;
      return p.life > 0;
    });
  }
  
  drawParticles() {
    this.particles.forEach(p => {
      this.ctx.globalAlpha = p.life;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.globalAlpha = 1;
  }
  
  drawBackground(speed) {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.H);
    gradient.addColorStop(0, '#0a0a1a');
    gradient.addColorStop(0.3, '#1a1a3e');
    gradient.addColorStop(0.7, '#2d1b4e');
    gradient.addColorStop(1, '#1a0a2e');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.W, this.H);
    
    this.clouds.forEach(cloud => {
      cloud.x -= cloud.speed * (speed / 6);
      if (cloud.x + cloud.width < 0) {
        cloud.x = this.W + Math.random() * 200;
      }
      this.drawCloud(cloud.x, cloud.y, cloud.width);
    });
    
    this.ctx.fillStyle = 'rgba(30, 20, 60, 0.8)';
    this.mountains.forEach(m => {
      m.x -= speed * 0.15;
      if (m.x + m.width < 0) {
        m.x = this.W + 100;
      }
      this.drawMountain(m.x, m.height, m.width);
    });
    
    this.buildings.forEach((b, i) => {
      b.x -= speed * 0.4;
      if (b.x + b.width < 0) {
        const maxX = Math.max(...this.buildings.map(b2 => b2.x));
        b.x = maxX + 100 + Math.random() * 50;
        b.height = 60 + Math.random() * 150;
        b.windows = Math.floor(Math.random() * 6) + 2;
      }
      this.drawBuilding(b.x, b.height, b.width, b.windows);
    });
  }
  
  drawCloud(x, y, w) {
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    this.ctx.beginPath();
    this.ctx.arc(x, y, w * 0.3, 0, Math.PI * 2);
    this.ctx.arc(x + w * 0.3, y - 10, w * 0.35, 0, Math.PI * 2);
    this.ctx.arc(x + w * 0.6, y, w * 0.3, 0, Math.PI * 2);
    this.ctx.arc(x + w * 0.3, y + 10, w * 0.25, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  drawMountain(x, h, w) {
    const groundY = this.H - 100;
    this.ctx.beginPath();
    this.ctx.moveTo(x, groundY);
    this.ctx.lineTo(x + w * 0.3, groundY - h);
    this.ctx.lineTo(x + w * 0.5, groundY - h * 0.7);
    this.ctx.lineTo(x + w * 0.7, groundY - h * 0.9);
    this.ctx.lineTo(x + w, groundY);
    this.ctx.closePath();
    this.ctx.fill();
  }
  
  drawBuilding(x, h, w, windows) {
    const groundY = this.H - 100;
    const y = groundY - h;
    
    this.ctx.fillStyle = 'rgba(20, 15, 40, 0.9)';
    this.ctx.fillRect(x, y, w, h);
    
    this.ctx.strokeStyle = 'rgba(100, 80, 150, 0.3)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, w, h);
    
    const winRows = windows;
    const winCols = Math.floor(w / 20);
    const winW = (w - 10) / winCols - 5;
    const winH = (h - 20) / winRows - 8;
    
    for (let r = 0; r < winRows; r++) {
      for (let c = 0; c < winCols; c++) {
        const isLit = Math.random() > 0.4;
        this.ctx.fillStyle = isLit 
          ? `rgba(255, ${200 + Math.random() * 55}, ${100 + Math.random() * 100}, 0.8)`
          : 'rgba(30, 20, 50, 0.8)';
        this.ctx.fillRect(
          x + 8 + c * (winW + 5),
          y + 12 + r * (winH + 8),
          winW,
          winH
        );
      }
    }
  }
  
  drawGround(speed) {
    const groundY = this.H - 100;
    
    this.groundOffset = (this.groundOffset + speed) % 40;
    
    const groundGrad = this.ctx.createLinearGradient(0, groundY, 0, this.H);
    groundGrad.addColorStop(0, '#3d2a1f');
    groundGrad.addColorStop(0.3, '#2a1a0f');
    groundGrad.addColorStop(1, '#1a0d05');
    this.ctx.fillStyle = groundGrad;
    this.ctx.fillRect(0, groundY, this.W, 100);
    
    this.ctx.fillStyle = '#4a7c59';
    this.ctx.fillRect(0, groundY, this.W, 8);
    
    this.ctx.fillStyle = '#5a9c69';
    for (let x = -this.groundOffset; x < this.W; x += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, groundY + 8);
      this.ctx.lineTo(x + 10, groundY);
      this.ctx.lineTo(x + 20, groundY + 8);
      this.ctx.fill();
    }
    
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    for (let x = -this.groundOffset * 2; x < this.W; x += 20) {
      this.ctx.fillRect(x, groundY + 30 + (x % 3), 8, 3);
    }
    
    this.ctx.strokeStyle = 'rgba(100, 200, 255, 0.1)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([10, 10]);
    this.ctx.beginPath();
    this.ctx.moveTo(90, groundY);
    this.ctx.lineTo(90, this.H);
    this.ctx.moveTo(150, groundY);
    this.ctx.lineTo(150, this.H);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }
  
  drawPlayer() {
    const p = this.state.player;
    const crouchFactor = p.isCrouching ? 0.6 : 1;
    const actualHeight = p.height * crouchFactor;
    const yOffset = p.height - actualHeight;
    
    const drawX = p.x;
    const drawY = p.y + yOffset;
    
    this.ctx.save();
    
    if (p.invincible && Math.floor(Date.now() / 100) % 2 === 0) {
      this.ctx.globalAlpha = 0.5;
    }
    
    if (p.isDashing) {
      for (let i = 1; i <= 4; i++) {
        this.ctx.globalAlpha = (0.4 - i * 0.08);
        this.ctx.fillStyle = `hsl(${30 + i * 10}, 100%, 60%)`;
        const offsetX = -i * 12;
        this.roundRect(drawX + 5 + offsetX, drawY + 15, p.width - 10, actualHeight - 30, 8);
        this.ctx.fill();
      }
      this.ctx.globalAlpha = p.invincible && Math.floor(Date.now() / 100) % 2 === 0 ? 0.5 : 1;
      
      this.ctx.shadowColor = 'rgba(255, 150, 0, 0.8)';
      this.ctx.shadowBlur = 25;
      this.ctx.shadowOffsetX = -10;
    } else {
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      this.ctx.shadowBlur = 10;
      this.ctx.shadowOffsetY = 5;
    }
    
    this.ctx.fillStyle = '#4fc3f7';
    this.roundRect(drawX + 5, drawY + 15, p.width - 10, actualHeight - 30, 8);
    this.ctx.fill();
    
    this.ctx.fillStyle = '#81d4fa';
    this.ctx.beginPath();
    this.ctx.arc(drawX + p.width / 2, drawY + 18, 18, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.beginPath();
    this.ctx.arc(drawX + p.width / 2 + 3, drawY + 16, 4, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(drawX + p.width / 2 + 4, drawY + 15, 1.5, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.strokeStyle = '#1a1a2e';
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    this.ctx.arc(drawX + p.width / 2 + 2, drawY + 22, 4, 0, Math.PI);
    this.ctx.stroke();
    
    this.ctx.fillStyle = '#ff7043';
    const legOffset = Math.sin(p.animFrame * 0.5) * 5;
    if (!p.isCrouching) {
      this.ctx.fillRect(drawX + 8, drawY + actualHeight - 18, 10, 18 + legOffset);
      this.ctx.fillRect(drawX + p.width - 18, drawY + actualHeight - 18, 10, 18 - legOffset);
    } else {
      this.ctx.fillRect(drawX + 8, drawY + actualHeight - 10, 14, 10);
      this.ctx.fillRect(drawX + p.width - 22, drawY + actualHeight - 10, 14, 10);
    }
    
    this.ctx.fillStyle = '#29b6f6';
    const armOffset = Math.sin(p.animFrame * 0.5 + Math.PI) * 4;
    this.ctx.fillRect(drawX, drawY + 25 + armOffset, 10, 22);
    this.ctx.fillRect(drawX + p.width - 10, drawY + 25 - armOffset, 10, 22);
    
    if (p.shield) {
      this.ctx.strokeStyle = `rgba(33, 150, 243, ${0.5 + Math.sin(Date.now() / 200) * 0.3})`;
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.arc(drawX + p.width / 2, drawY + actualHeight / 2, p.width * 0.8, 0, Math.PI * 2);
      this.ctx.stroke();
      
      this.ctx.fillStyle = `rgba(33, 150, 243, 0.1)`;
      this.ctx.beginPath();
      this.ctx.arc(drawX + p.width / 2, drawY + actualHeight / 2, p.width * 0.8, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    if (p.invincible) {
      this.ctx.strokeStyle = `rgba(255, 215, 0, ${0.6 + Math.sin(Date.now() / 150) * 0.4})`;
      this.ctx.lineWidth = 3;
      const starR = p.width * 0.9;
      this.ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (Date.now() / 500 + i * Math.PI / 4);
        const sx = drawX + p.width / 2 + Math.cos(angle) * starR;
        const sy = drawY + actualHeight / 2 + Math.sin(angle) * starR;
        if (i === 0) this.ctx.moveTo(sx, sy);
        else this.ctx.lineTo(sx, sy);
      }
      this.ctx.closePath();
      this.ctx.stroke();
    }
    
    this.ctx.restore();
  }
  
  drawObstacles() {
    this.state.obstacles.forEach(obs => {
      this.ctx.save();
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      this.ctx.shadowBlur = 8;
      this.ctx.shadowOffsetY = 4;
      
      switch(obs.type) {
        case 'spike':
          this.drawSpike(obs);
          break;
        case 'box':
          this.drawBox(obs);
          break;
        case 'high_bar':
          this.drawHighBar(obs);
          break;
        case 'low_bar':
          this.drawLowBar(obs);
          break;
        case 'double_spike':
          this.drawDoubleSpike(obs);
          break;
        default:
          this.ctx.fillStyle = obs.color;
          this.ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      }
      
      this.ctx.restore();
    });
  }
  
  drawSpike(obs) {
    this.ctx.fillStyle = '#c0392b';
    this.ctx.beginPath();
    this.ctx.moveTo(obs.x, obs.y + obs.height);
    this.ctx.lineTo(obs.x + obs.width / 2, obs.y);
    this.ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.fillStyle = '#e74c3c';
    this.ctx.beginPath();
    this.ctx.moveTo(obs.x + 5, obs.y + obs.height);
    this.ctx.lineTo(obs.x + obs.width / 2, obs.y + 8);
    this.ctx.lineTo(obs.x + obs.width / 2, obs.y + obs.height);
    this.ctx.closePath();
    this.ctx.fill();
  }
  
  drawBox(obs) {
    const grad = this.ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.height);
    grad.addColorStop(0, '#a0522d');
    grad.addColorStop(0.5, '#8b4513');
    grad.addColorStop(1, '#654321');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    
    this.ctx.strokeStyle = '#3d2817';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
    
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(obs.x, obs.y + obs.height / 2);
    this.ctx.lineTo(obs.x + obs.width, obs.y + obs.height / 2);
    this.ctx.moveTo(obs.x + obs.width / 2, obs.y);
    this.ctx.lineTo(obs.x + obs.width / 2, obs.y + obs.height);
    this.ctx.stroke();
  }
  
  drawHighBar(obs) {
    const grad = this.ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.height);
    grad.addColorStop(0, '#34495e');
    grad.addColorStop(1, '#2c3e50');
    this.ctx.fillStyle = grad;
    this.roundRect(obs.x, obs.y, obs.width, obs.height, 4);
    this.ctx.fill();
    
    this.ctx.fillStyle = 'rgba(241, 196, 15, 0.8)';
    for (let i = 0; i < 3; i++) {
      this.ctx.fillRect(obs.x + 15 + i * 35, obs.y + obs.height / 2 - 3, 20, 6);
    }
    
    const poleX = obs.x + 10;
    const poleY = obs.y + obs.height;
    this.ctx.fillStyle = '#7f8c8d';
    this.ctx.fillRect(poleX, poleY, 8, obs.elevatedHeight - 40);
    this.ctx.fillRect(obs.x + obs.width - 18, poleY, 8, obs.elevatedHeight - 40);
  }
  
  drawLowBar(obs) {
    const grad = this.ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.height);
    grad.addColorStop(0, '#455a64');
    grad.addColorStop(1, '#37474f');
    this.ctx.fillStyle = grad;
    this.roundRect(obs.x, obs.y, obs.width, obs.height, 6);
    this.ctx.fill();
    
    this.ctx.strokeStyle = '#ff5252';
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([10, 8]);
    this.ctx.beginPath();
    this.ctx.moveTo(obs.x, obs.y + obs.height / 2);
    this.ctx.lineTo(obs.x + obs.width, obs.y + obs.height / 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }
  
  drawDoubleSpike(obs) {
    this.ctx.fillStyle = '#922b21';
    for (let i = 0; i < 2; i++) {
      const sx = obs.x + i * (obs.width / 2);
      this.ctx.beginPath();
      this.ctx.moveTo(sx, obs.y + obs.height);
      this.ctx.lineTo(sx + obs.width / 4, obs.y);
      this.ctx.lineTo(sx + obs.width / 2, obs.y + obs.height);
      this.ctx.closePath();
      this.ctx.fill();
    }
    
    this.ctx.fillStyle = '#c0392b';
    for (let i = 0; i < 2; i++) {
      const sx = obs.x + i * (obs.width / 2) + 3;
      this.ctx.beginPath();
      this.ctx.moveTo(sx, obs.y + obs.height);
      this.ctx.lineTo(sx + obs.width / 4 - 3, obs.y + 10);
      this.ctx.lineTo(sx + obs.width / 4 - 3, obs.y + obs.height);
      this.ctx.closePath();
      this.ctx.fill();
    }
  }
  
  drawItems() {
    const time = Date.now() / 200;
    
    this.state.items.forEach(item => {
      this.ctx.save();
      this.ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
      
      const floatOffset = Math.sin(time + item.x) * 5;
      this.ctx.translate(0, floatOffset);
      
      this.ctx.shadowColor = item.color;
      this.ctx.shadowBlur = 15;
      
      switch(item.type) {
        case 'coin':
          this.drawCoin(item, time);
          break;
        case 'gem':
          this.drawGem(item);
          break;
        case 'heart':
          this.drawHeart(item);
          break;
        case 'star':
          this.drawStar(item, time);
          break;
        case 'clock':
          this.drawClock(item, time);
          break;
        case 'shield':
          this.drawShieldItem(item, time);
          break;
        default:
          this.ctx.fillStyle = item.color;
          this.ctx.fillRect(-item.width / 2, -item.height / 2, item.width, item.height);
      }
      
      this.ctx.restore();
    });
  }
  
  drawCoin(item, time) {
    const scaleX = Math.abs(Math.cos(time));
    this.ctx.scale(scaleX + 0.3, 1);
    
    const grad = this.ctx.createRadialGradient(0, 0, 2, 0, 0, item.width / 2);
    grad.addColorStop(0, '#fff9c4');
    grad.addColorStop(0.5, '#ffd700');
    grad.addColorStop(1, '#ff8f00');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, item.width / 2 - 2, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.fillStyle = '#ff6f00';
    this.ctx.font = 'bold 16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('$', 0, 0);
  }
  
  drawGem(item) {
    const s = item.width / 2;
    
    this.ctx.fillStyle = '#9b59b6';
    this.ctx.beginPath();
    this.ctx.moveTo(0, -s);
    this.ctx.lineTo(s, -s * 0.3);
    this.ctx.lineTo(s * 0.7, s);
    this.ctx.lineTo(-s * 0.7, s);
    this.ctx.lineTo(-s, -s * 0.3);
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    this.ctx.beginPath();
    this.ctx.moveTo(0, -s + 3);
    this.ctx.lineTo(s * 0.5, -s * 0.2);
    this.ctx.lineTo(0, 0);
    this.ctx.lineTo(-s * 0.5, -s * 0.2);
    this.ctx.closePath();
    this.ctx.fill();
  }
  
  drawHeart(item) {
    const s = item.width / 2;
    
    this.ctx.fillStyle = '#e91e63';
    this.ctx.beginPath();
    this.ctx.moveTo(0, s * 0.8);
    this.ctx.bezierCurveTo(-s * 1.2, s * 0.3, -s * 0.8, -s * 0.8, 0, -s * 0.3);
    this.ctx.bezierCurveTo(s * 0.8, -s * 0.8, s * 1.2, s * 0.3, 0, s * 0.8);
    this.ctx.fill();
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.beginPath();
    this.ctx.ellipse(-s * 0.3, -s * 0.2, s * 0.2, s * 0.15, -0.5, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  drawStar(item, time) {
    const s = item.width / 2;
    this.ctx.rotate(time * 0.5);
    
    this.ctx.fillStyle = '#ffeb3b';
    this.ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? s : s * 0.5;
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.beginPath();
    this.ctx.arc(-s * 0.2, -s * 0.2, s * 0.2, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  drawClock(item, time) {
    const s = item.width / 2;
    
    this.ctx.fillStyle = '#00bcd4';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, s - 2, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.fillStyle = '#e0f7fa';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, s - 6, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.strokeStyle = '#006064';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(0, -s * 0.6);
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(s * 0.5, s * 0.2);
    this.ctx.stroke();
    
    this.ctx.fillStyle = '#006064';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 3, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  drawShieldItem(item, time) {
    const s = item.width / 2;
    
    const pulse = 1 + Math.sin(time) * 0.1;
    this.ctx.scale(pulse, pulse);
    
    this.ctx.fillStyle = '#2196f3';
    this.ctx.beginPath();
    this.ctx.moveTo(0, -s);
    this.ctx.lineTo(s * 0.9, -s * 0.5);
    this.ctx.lineTo(s * 0.9, s * 0.2);
    this.ctx.quadraticCurveTo(s * 0.5, s, 0, s * 0.9);
    this.ctx.quadraticCurveTo(-s * 0.5, s, -s * 0.9, s * 0.2);
    this.ctx.lineTo(-s * 0.9, -s * 0.5);
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.beginPath();
    this.ctx.moveTo(-s * 0.3, -s * 0.5);
    this.ctx.lineTo(s * 0.2, -s * 0.7);
    this.ctx.lineTo(-s * 0.1, 0);
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 2.5;
    this.ctx.beginPath();
    this.ctx.moveTo(0, -s * 0.4);
    this.ctx.lineTo(0, s * 0.4);
    this.ctx.moveTo(-s * 0.35, 0);
    this.ctx.lineTo(s * 0.35, 0);
    this.ctx.stroke();
  }
  
  drawEffects() {
    const now = this.state.elapsedTime;
    
    this.state.effects.forEach(e => {
      const elapsed = now - e.startTime;
      if (elapsed >= e.duration) return;
      
      const progress = elapsed / e.duration;
      
      if (e.type === 'collect' && e.text) {
        this.ctx.save();
        this.ctx.globalAlpha = 1 - progress;
        this.ctx.fillStyle = e.color || '#ffd700';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        this.ctx.shadowBlur = 5;
        this.ctx.fillText(e.text, e.x, e.y - progress * 60);
        this.ctx.restore();
      }
      
      if (e.type === 'damage') {
        this.ctx.save();
        this.ctx.globalAlpha = (1 - progress) * 0.5;
        this.ctx.fillStyle = '#ff0000';
        this.ctx.beginPath();
        this.ctx.arc(e.x, e.y, 30 + progress * 40, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }
    });
  }
  
  drawSpeedLines(speed) {
    if (speed < 8) return;
    
    const intensity = Math.min((speed - 8) / 10, 1);
    this.ctx.strokeStyle = `rgba(255, 255, 255, ${intensity * 0.3})`;
    this.ctx.lineWidth = 2;
    
    for (let i = 0; i < 8; i++) {
      const y = (Date.now() / (10 - i) + i * 80) % this.H;
      const x = (i * 137 + Date.now() / 5) % this.W;
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x - 40 - speed * 2, y);
      this.ctx.stroke();
    }
  }
  
  roundRect(x, y, w, h, r) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }
  
  gameLoop() {
    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    if (this.gameState === 'playing' && this.state) {
      const clampedDelta = Math.min(deltaTime, 100);
      this.accumulator += clampedDelta;
      
      const stepMs = this.config ? this.config.physicsStep : 16.67;
      
      while (this.accumulator >= stepMs) {
        let action = null;
        
        if (this.pendingActions.jump || this.pendingActions.crouch !== this.lastCrouchState || this.pendingActions.laneChange !== 0 || this.pendingActions.dash) {
          action = { ...this.pendingActions };
        }
        
        this.step(stepMs, action);
        
        this.pendingActions.jump = false;
        this.pendingActions.laneChange = 0;
        this.pendingActions.dash = false;
        
        this.elapsedGameTime += stepMs;
        this.accumulator -= stepMs;
      }
      
      this.updateParticles();
      
      if (this.shakeIntensity > 0.1) {
        this.shakeIntensity *= this.shakeDecay;
      } else {
        this.shakeIntensity = 0;
      }
    }
    
    this.render();
    
    requestAnimationFrame(() => this.gameLoop());
  }
  
  render() {
    this.ctx.save();
    
    if (this.shakeIntensity > 0) {
      this.ctx.translate(
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity
      );
    }
    
    const speed = this.gameState === 'playing' && this.state
      ? this.state.speed 
      : 3;
    
    this.drawBackground(speed);
    this.drawGround(speed);
    this.drawSpeedLines(speed * 2);
    
    if (this.state) {
      this.drawObstacles();
      this.drawItems();
      this.drawPlayer();
      this.drawEffects();
    }
    
    this.drawParticles();
    
    this.ctx.restore();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ParkourGame();
});