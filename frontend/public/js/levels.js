const API_BASE = 'http://localhost:9918/api';

class LevelsPage {
  constructor() {
    this.levels = [];
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadLevels();
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
        this.renderLevels();
      } else {
        this.showError('加载关卡失败');
      }
    } catch (error) {
      console.error('加载关卡失败:', error);
      this.showError('无法连接到后端服务，请确认端口9918已启动');
    }
  }

  renderLevels() {
    const grid = document.getElementById('levels-grid');
    
    if (this.levels.length === 0) {
      grid.innerHTML = '<p class="empty-text">暂无关卡数据</p>';
      return;
    }

    grid.innerHTML = this.levels.map((level, index) => {
      const isLocked = index > 0;
      const statusClass = isLocked ? 'locked' : 'available';
      const difficultyStars = '★'.repeat(level.difficulty) + '☆'.repeat(3 - level.difficulty);
      
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
            <span class="reward">🎁 ${level.reward}</span>
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
