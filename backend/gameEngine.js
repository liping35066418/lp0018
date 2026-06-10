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

class GameEngine {
  constructor() {
    this.config = {
      groundHeight: 100,
      canvasWidth: 960,
      canvasHeight: 540,
      gravity: 0.8,
      jumpForce: -16,
      baseSpeed: 6,
      maxSpeed: 18,
      difficultyInterval: 10000,
      difficultyStep: 0.5,
      maxLives: 3,
      gameTime: 120,
      physicsStep: 16.67
    };
    
    this.obstacleTypes = [
      { type: 'spike', width: 40, height: 50, damage: 1, score: 10, color: '#e74c3c' },
      { type: 'box', width: 60, height: 60, damage: 1, score: 15, color: '#8b4513' },
      { type: 'high_bar', width: 120, height: 20, damage: 1, score: 20, color: '#2c3e50', elevated: true, elevatedHeight: 120 },
      { type: 'low_bar', width: 100, height: 30, damage: 1, score: 15, color: '#34495e' },
      { type: 'double_spike', width: 70, height: 50, damage: 1, score: 25, color: '#c0392b' }
    ];
    
    this.itemTypes = [
      { type: 'coin', width: 30, height: 30, score: 50, probability: 0.4, color: '#f1c40f' },
      { type: 'gem', width: 35, height: 35, score: 150, probability: 0.15, color: '#9b59b6' },
      { type: 'heart', width: 35, height: 35, heal: 1, probability: 0.08, color: '#e91e63' },
      { type: 'star', width: 40, height: 40, score: 300, probability: 0.05, color: '#ffeb3b', invincible: true },
      { type: 'clock', width: 35, height: 35, timeBonus: 10, probability: 0.07, color: '#00bcd4' },
      { type: 'shield', width: 38, height: 38, shield: true, probability: 0.05, color: '#2196f3' }
    ];
    
    this.highScores = [];
  }
  
  getGameConfig() {
    return {
      ...this.config,
      obstacleTypes: this.obstacleTypes,
      itemTypes: this.itemTypes
    };
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
  
  createState(seed) {
    const rng = new SeededRandom(seed);
    const state = {
      seed,
      rng,
      elapsedTime: 0,
      score: 0,
      lives: this.config.maxLives,
      combo: 0,
      speed: this.config.baseSpeed,
      timeLeft: this.config.gameTime,
      difficultyLevel: 1,
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
        lane: 0
      },
      obstacles: [],
      items: [],
      lastObstacleX: 0,
      lastItemX: 0,
      effects: [],
      status: 'playing'
    };
    state.player.y = this.config.canvasHeight - this.config.groundHeight - state.player.height;
    
    const scene = this.generateInitialSceneWithRng(state.rng);
    state.obstacles = scene.obstacles;
    state.items = scene.items;
    state.lastObstacleX = Math.max(...state.obstacles.map(o => o.x));
    state.lastItemX = Math.max(...state.items.map(i => i.x));
    
    return state;
  }
  
  generateInitialSceneWithRng(rng) {
    const obstacles = [];
    const items = [];
    let lastObstacleX = 800;
    let lastItemX = 600;
    
    for (let i = 0; i < 5; i++) {
      const obstacle = this.generateObstacleWithRng(0, lastObstacleX, rng);
      obstacles.push(obstacle);
      lastObstacleX = obstacle.x;
    }
    
    for (let i = 0; i < 3; i++) {
      const item = this.generateItemWithRng(0, lastItemX, rng);
      items.push(item);
      lastItemX = item.x;
    }
    
    return { obstacles, items };
  }
  
  generateObstacleWithRng(elapsedTime, lastX, rng) {
    const level = this.getDifficultyLevel(elapsedTime);
    const minGap = Math.max(250 - level * 10, 150);
    
    const availableTypes = this.obstacleTypes.filter((_, index) => {
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
  
  generateItemWithRng(elapsedTime, lastX, rng) {
    const level = this.getDifficultyLevel(elapsedTime);
    const minGap = 150;
    
    const rand = rng.next();
    let cumulative = 0;
    let selectedType = this.itemTypes[0];
    
    for (const itemType of this.itemTypes) {
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
  
  step(state, deltaTime, action) {
    if (state.status !== 'playing') return state;
    
    state.elapsedTime += deltaTime;
    state.speed = this.getCurrentSpeed(state.elapsedTime);
    state.difficultyLevel = this.getDifficultyLevel(state.elapsedTime);
    state.timeLeft = Math.max(0, this.config.gameTime - Math.floor(state.elapsedTime / 1000));
    
    const player = state.player;
    if (action) {
      if (action.jump && !player.isJumping) {
        player.velocityY = this.config.jumpForce;
        player.isJumping = true;
      }
      if (action.crouch !== undefined) {
        player.isCrouching = action.crouch;
      }
      if (action.laneChange) {
        player.lane = Math.max(-1, Math.min(1, player.lane + action.laneChange));
      }
    }
    
    if (player.invincibleTimer > 0) {
      player.invincibleTimer -= deltaTime;
      if (player.invincibleTimer <= 0) {
        player.invincible = false;
      }
    }
    
    player.velocityY += this.config.gravity;
    player.y += player.velocityY;
    
    const playerHeight = player.isCrouching ? player.height * 0.6 : player.height;
    const groundY = this.config.canvasHeight - this.config.groundHeight - playerHeight;
    
    if (player.y >= groundY) {
      player.y = groundY;
      player.velocityY = 0;
      player.isJumping = false;
    }
    
    player.x = 120 + player.lane * 30;
    
    const scrollAmount = state.speed * (deltaTime / this.config.physicsStep);
    state.obstacles.forEach(obs => { obs.x -= scrollAmount; });
    state.items.forEach(item => { item.x -= scrollAmount; });
    state.lastObstacleX -= scrollAmount;
    state.lastItemX -= scrollAmount;
    
    state.obstacles = state.obstacles.filter(obs => obs.x + obs.width > -100);
    state.items = state.items.filter(item => item.x + item.width > -100);
    
    const spawnInterval = this.getObstacleSpawnInterval(state.elapsedTime);
    if (state.lastObstacleX < this.config.canvasWidth + 100 && state.rng.next() < deltaTime / spawnInterval) {
      const newObstacle = this.generateObstacleWithRng(state.elapsedTime, this.config.canvasWidth + 200, state.rng);
      state.obstacles.push(newObstacle);
      state.lastObstacleX = newObstacle.x;
    }
    
    const itemInterval = this.getItemSpawnInterval(state.elapsedTime);
    if (state.lastItemX < this.config.canvasWidth + 100 && state.rng.next() < deltaTime / itemInterval) {
      const newItem = this.generateItemWithRng(state.elapsedTime, this.config.canvasWidth + 300, state.rng);
      state.items.push(newItem);
      state.lastItemX = newItem.x;
    }
    
    state.obstacles = state.obstacles.filter(obs => {
      if (this.checkCollision(player, obs)) {
        const result = this.handleObstacleCollision(player, obs);
        if (result.hit) {
          state.lives -= result.damage;
          state.combo = 0;
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
          state.score += this.calculateScore(result.scoreGained, state.elapsedTime, state.combo);
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
          state.lives = Math.min(this.config.maxLives, state.lives + result.heal);
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
    
    return state;
  }
  
  replay(seed, actions) {
    const state = this.createState(seed);
    
    let currentTime = 0;
    let actionIndex = 0;
    
    const stepMs = this.config.physicsStep;
    
    while (state.status === 'playing' && state.elapsedTime < this.config.gameTime * 1000 + 60000) {
      let action = null;
      
      while (actionIndex < actions.length && actions[actionIndex].time <= state.elapsedTime + stepMs) {
        const a = actions[actionIndex];
        if (!action) action = {};
        if (a.type === 'jump') action.jump = true;
        if (a.type === 'crouch') action.crouch = a.value;
        if (a.type === 'laneChange') action.laneChange = (action.laneChange || 0) + a.value;
        actionIndex++;
      }
      
      this.step(state, stepMs, action);
    }
    
    return {
      score: state.score,
      status: state.status,
      timeSurvived: Math.min(state.elapsedTime, this.config.gameTime * 1000),
      lives: state.lives
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
  
  getHighScores() {
    return this.highScores.slice(0, 10);
  }
  
  submitHighScore(name, score) {
    const entry = {
      name,
      score,
      date: new Date().toISOString()
    };
    this.highScores.push(entry);
    this.highScores.sort((a, b) => b.score - a.score);
    this.highScores = this.highScores.slice(0, 10);
    return this.highScores.indexOf(entry) + 1;
  }
}

module.exports = GameEngine;
