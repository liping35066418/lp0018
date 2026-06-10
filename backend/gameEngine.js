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
      gameTime: 120
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
  
  generateObstacle(elapsedTime, lastX) {
    const level = this.getDifficultyLevel(elapsedTime);
    const minGap = Math.max(250 - level * 10, 150);
    
    const availableTypes = this.obstacleTypes.filter((_, index) => {
      if (level < 2 && index >= 2) return false;
      if (level < 4 && index >= 4) return false;
      return true;
    });
    
    const typeIndex = Math.floor(Math.random() * availableTypes.length);
    const obstacleType = availableTypes[typeIndex];
    
    return {
      id: Date.now() + Math.random(),
      ...obstacleType,
      x: lastX + minGap + Math.random() * 200,
      y: obstacleType.elevated 
        ? this.config.canvasHeight - this.config.groundHeight - obstacleType.height - obstacleType.elevatedHeight
        : this.config.canvasHeight - this.config.groundHeight - obstacleType.height
    };
  }
  
  generateItem(elapsedTime, lastX) {
    const level = this.getDifficultyLevel(elapsedTime);
    const minGap = 150;
    
    const rand = Math.random();
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
    
    const heightVariation = Math.random() > 0.5;
    
    return {
      id: Date.now() + Math.random(),
      ...selectedType,
      x: lastX + minGap + Math.random() * 300,
      y: heightVariation
        ? this.config.canvasHeight - this.config.groundHeight - 80 - Math.random() * 100
        : this.config.canvasHeight - this.config.groundHeight - 40 - Math.random() * 50
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
}

module.exports = GameEngine;
