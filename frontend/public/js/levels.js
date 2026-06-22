const API_BASE = 'http://localhost:9918/api';

class LevelsPage {
  constructor() {
    this.levels = [];
    this.assets = [];
    this.init();
  }

  async init() {
    this.bindEvents();
    await Promise.all([this.loadLevels(), this.loadAssets()]);
    this.renderLevels();
  }

  async loadAssets() {
    try {
      const response = await fetch(`${API_BASE}/assets`);
      const data = await response.json();
      if (data.success) {
        this.assets = data.data;
      }
    } catch (error) {
      console.error('加载构件库失败:', error);
    }
  }

  bindEvents() {
    document.querySelectorAll('.test-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const testType = e.currentTarget.dataset.test;
        this.startQuickTest(testType);
      });
    });
  }

  async loadLevels() {
    try {
      const response = await fetch(`${API_BASE}/levels`);
      const data = await response.json();

      if (data.success) {
        this.levels = data.data;
      } else {
        this.showError('加载关卡失败: ' + (data.error || data.message || '未知错误'));
      }
    } catch (error) {
      console.error('加载关卡失败:', error);
      this.showError('无法连接到后端服务，请确认端口9918已启动 (' + error.message + ')');
    }
  }

  renderLevels() {
    const grid = document.getElementById('levels-grid');
    
    if (this.levels.length === 0) {
      grid.innerHTML = '<p class="empty-text">暂无关卡数据</p>';
      return;
    }

    const getAssetName = (assetId) => {
      if (this.assets && this.assets.length > 0) {
        const asset = this.assets.find(a => a.id === assetId);
        if (asset) return asset.name;
      }
      return String(assetId);
    };

    const getRewardDisplay = (level) => {
      if (level.rewardText && typeof level.rewardText === 'string' && level.rewardText.trim() !== '') {
        return level.rewardText;
      }
      if (level.unlockedAssets && Array.isArray(level.unlockedAssets) && level.unlockedAssets.length > 0) {
        return level.unlockedAssets.map(id => getAssetName(id)).join('、');
      }
      if (Array.isArray(level.reward) && level.reward.length > 0) {
        return level.reward.map(id => getAssetName(id)).join('、');
      }
      if (typeof level.reward === 'string' && level.reward.trim() !== '') {
        return level.reward;
      }
      return '无';
    };

    grid.innerHTML = this.levels.map((level, index) => {
      const isLocked = index > 0;
      const statusClass = isLocked ? 'locked' : 'available';
      const difficulty = level.difficulty !== undefined ? level.difficulty : (index + 1);
      const safeDifficulty = Math.min(Math.max(1, difficulty), 3);
      const difficultyStars = '★'.repeat(safeDifficulty) + '☆'.repeat(3 - safeDifficulty);
      const rewardDisplay = getRewardDisplay(level);
      
      return `
        <div class="level-card ${statusClass}" data-level-id="${level.id}">
          <div class="level-card-header">
            <span class="level-number">第 ${level.id} 关</span>
            ${isLocked ? '<span class="lock-icon">🔒</span>' : '<span class="play-icon">▶</span>'}
          </div>
          <h3 class="level-card-title">${level.name}</h3>
          <p class="level-card-desc">${level.description}</p>
          <div class="level-constraints">
            <span class="constraint-tag">📏 ${level.constraints.minChannelWidth}m通道</span>
            <span class="constraint-tag">💡 ≥${level.constraints.minLightCount}灯光</span>
            <span class="constraint-tag">📊 ${level.constraints.maxPolyCount.toLocaleString()}面</span>
          </div>
          <div class="level-card-footer">
            <span class="difficulty">难度: <span class="stars">${difficultyStars}</span></span>
            <span class="reward">🎁 ${rewardDisplay}</span>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.level-card').forEach(card => {
      card.addEventListener('click', () => {
        const levelId = parseInt(card.dataset.levelId);
        this.enterLevel(levelId);
      });
    });
  }

  enterLevel(levelId) {
    window.location.href = `editor.html?level=${levelId}`;
  }

  async startQuickTest(testType) {
    try {
      const response = await fetch(`${API_BASE}/generate-test-scene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testType, levelId: 1 })
      });
      const data = await response.json();
      
      if (data.success) {
        const sceneData = encodeURIComponent(JSON.stringify(data.data));
        window.location.href = `editor.html?level=1&test=${testType}&scene=${sceneData}`;
      } else {
        this.showToast('生成测试场景失败', 'error');
      }
    } catch (error) {
      console.error('生成测试场景失败:', error);
      this.showToast('无法连接到后端服务', 'error');
    }
  }

  showError(message) {
    const grid = document.getElementById('levels-grid');
    grid.innerHTML = `<div class="error-message">❌ ${message}</div>`;
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.zIndex = '1000';
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new LevelsPage();
});
