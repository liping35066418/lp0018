const API_BASE = 'http://localhost:9918/api';

class ThreeDEditor {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.dragControls = null;
    this.gridHelper = null;
    this.objects = [];
    this.assets = [];
    this.level = null;
    this.levelId = 1;
    this.selectedObject = null;
    this.currentCategory = 'wall';
    this.transformMode = 'translate';
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.isDraggingAsset = false;
    this.dragAsset = null;
    this.dragOffset = new THREE.Vector3();
    this.autoValidateTimer = null;
    this.isValidating = false;

    this.init();
  }

  async init() {
    try {
      const threeReady = await this.waitForThreeJS(5000);
      if (!threeReady) {
        throw new Error('Three.js 三维库加载超时，请检查网络连接或刷新页面');
      }
      if (typeof THREE !== 'undefined' && typeof window.OrbitControls !== 'undefined' && !THREE.OrbitControls) {
        THREE.OrbitControls = window.OrbitControls;
      }
      if (!THREE.OrbitControls) {
        throw new Error('OrbitControls 控制器未加载，请刷新页面重试');
      }

      this.parseUrlParams();
      this.bindUIEvents();
      this.initThreeJS();
      await this.loadLevelData();
      await this.loadAssets();
      this.renderAssetList();
      this.animate();

      if (this.initialSceneData) {
        this.loadSceneData(this.initialSceneData);
        setTimeout(() => this.validate(), 500);
      }
    } catch (error) {
      console.error('编辑器初始化失败:', error);
      this.showFatalError(error.message || '未知错误');
    }
  }

  waitForThreeJS(timeout) {
    return new Promise(resolve => {
      const start = Date.now();
      function check() {
        if (typeof THREE !== 'undefined' && (THREE.OrbitControls || window.OrbitControls)) {
          resolve(true);
        } else if (Date.now() - start > timeout) {
          resolve(false);
        } else {
          setTimeout(check, 50);
        }
      }
      check();
    });
  }

  showFatalError(message) {
    const app = document.getElementById('editor-app');
    app.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0f1a;color:#fff;padding:20px;">
        <div style="max-width:500px;text-align:center;">
          <div style="font-size:64px;margin-bottom:20px;">⚠️</div>
          <h2 style="font-size:24px;margin-bottom:16px;color:#ef4444;">编辑器启动失败</h2>
          <p style="color:#94a3b8;margin-bottom:24px;line-height:1.6;">${message}</p>
          <button onclick="location.reload()" style="background:#3b82f6;color:#fff;border:none;padding:12px 32px;border-radius:8px;cursor:pointer;font-size:16px;">
            刷新重试
          </button>
        </div>
      </div>
    `;
  }

  parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    this.levelId = parseInt(params.get('level')) || 1;
    this.testType = params.get('test');
    
    const sceneParam = params.get('scene');
    if (sceneParam) {
      try {
        this.initialSceneData = JSON.parse(decodeURIComponent(sceneParam));
      } catch (e) {
        console.error('解析场景数据失败:', e);
      }
    }
  }

  bindUIEvents() {
    document.getElementById('back-btn').addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
      this.clearScene();
    });

    document.getElementById('validate-btn').addEventListener('click', () => {
      this.validate();
    });

    document.querySelectorAll('.category-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.currentCategory = e.currentTarget.dataset.category;
        this.renderAssetList();
      });
    });

    document.querySelectorAll('.transform-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.transform-btn[data-mode]').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.transformMode = e.currentTarget.dataset.mode;
        this.updateTransformMode();
      });
    });

    document.querySelector('.transform-btn[data-action="delete"]').addEventListener('click', () => {
      this.deleteSelected();
    });

    document.querySelectorAll('.quick-test-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const testType = e.currentTarget.dataset.test;
        this.loadTestScene(testType);
      });
    });

    document.getElementById('modal-close').addEventListener('click', () => {
      this.hideModal();
    });

    document.getElementById('continue-btn').addEventListener('click', () => {
      this.hideModal();
    });

    document.getElementById('next-btn').addEventListener('click', () => {
      window.location.href = `editor.html?level=${this.levelId + 1}`;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedObject && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
          this.deleteSelected();
        }
      }
      if (e.key === 'g' || e.key === 'G') this.setTransformMode('translate');
      if (e.key === 'r' || e.key === 'R') this.setTransformMode('rotate');
      if (e.key === 's' || e.key === 'S') this.setTransformMode('scale');
      if (e.key === 'Escape') this.deselectAll();
    });

    const viewport = document.getElementById('viewport');
    viewport.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    viewport.addEventListener('drop', (e) => {
      e.preventDefault();
      const assetId = e.dataTransfer.getData('assetId');
      if (assetId) {
        this.handleAssetDrop(assetId, e.clientX, e.clientY);
      }
    });

    window.addEventListener('resize', () => {
      this.onWindowResize();
    });
  }

  initThreeJS() {
    const container = document.getElementById('viewport');
    const canvas = document.getElementById('three-canvas');

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1a);
    this.scene.fog = new THREE.Fog(0x0a0f1a, 20, 60);

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(10, 10, 10);

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 50;
    this.controls.maxPolarAngle = Math.PI / 2.1;

    this.setupLighting();
    this.setupGrid();

    this.renderer.domElement.addEventListener('click', (e) => this.onCanvasClick(e));
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(15, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.camera.left = -30;
    directionalLight.shadow.camera.right = 30;
    directionalLight.shadow.camera.top = 30;
    directionalLight.shadow.camera.bottom = -30;
    this.scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0x88ccff, 0.3);
    fillLight.position.set(-10, 10, -10);
    this.scene.add(fillLight);
  }

  setupGrid() {
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
    }

    const width = this.level ? this.level.sceneSize.width : 8;
    const depth = this.level ? this.level.sceneSize.depth : 6;

    this.gridHelper = new THREE.Group();

    const size = Math.max(width, depth);
    const grid = new THREE.GridHelper(size, Math.max(width, depth) * 2, 0x2a4a6a, 0x1a3a5a);
    grid.position.x = width / 2;
    grid.position.z = depth / 2;
    this.gridHelper.add(grid);

    const floorGeometry = new THREE.PlaneGeometry(width, depth);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d1420,
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(width / 2, 0, depth / 2);
    floor.receiveShadow = true;
    this.gridHelper.add(floor);

    const edgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, 0.1, depth));
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 2 });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edges.position.set(width / 2, 0.05, depth / 2);
    this.gridHelper.add(edges);

    this.scene.add(this.gridHelper);

    this.camera.position.set(width + 5, 8, depth + 5);
    this.controls.target.set(width / 2, 0, depth / 2);
    this.controls.update();
  }

  async loadLevelData() {
    try {
      const response = await fetch(`${API_BASE}/levels`);
      const data = await response.json();
      
      if (data.success) {
        this.level = data.data.find(l => l.id === this.levelId);
        if (this.level) {
          this.updateLevelUI();
          this.setupGrid();
        }
      }
    } catch (error) {
      console.error('加载关卡数据失败:', error);
      this.showToast('无法连接到后端服务', 'error');
    }
  }

  async loadAssets() {
    try {
      const response = await fetch(`${API_BASE}/assets`);
      const data = await response.json();

      if (data.success) {
        this.assets = data.data;
      } else {
        throw new Error(data.message || '加载构件库失败');
      }
    } catch (error) {
      console.error('加载构件库失败:', error);
      const list = document.getElementById('asset-list');
      if (list) {
        list.innerHTML = `<div class="asset-loading"><span style="color:#ff4757;">❌ 构件库加载失败</span><p style="font-size:12px;color:var(--text-muted);">${error.message}</p><button onclick="location.reload()" style="margin-top:12px;padding:6px 16px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:6px;color:#fff;cursor:pointer;">刷新重试</button></div>`;
      }
      this.showToast('构件库加载失败: ' + error.message, 'error');
    }
  }

  updateLevelUI() {
    document.getElementById('level-name').textContent = this.level.name;
    document.getElementById('level-desc').textContent = this.level.description;
    document.getElementById('poly-limit').textContent = this.level.constraints.maxPolyCount.toLocaleString();
    document.getElementById('channel-required').textContent = `${this.level.constraints.minChannelWidth}m`;
    document.getElementById('poly-max').textContent = this.level.constraints.maxPolyCount.toLocaleString();
  }

  renderAssetList() {
    const list = document.getElementById('asset-list');
    const categoryAssets = this.assets.filter(a => a.category === this.currentCategory);
    
    if (categoryAssets.length === 0) {
      list.innerHTML = '<p class="empty-text">该分类暂无构件</p>';
      return;
    }

    list.innerHTML = categoryAssets.map(asset => {
      const isLocked = asset.highPoly && !this.level?.unlocked;
      const polyColor = asset.polyCount > 5000 ? 'high' : asset.polyCount > 1000 ? 'medium' : 'low';
      
      return `
        <div class="asset-item ${isLocked ? 'locked' : ''}" draggable="${!isLocked}" data-asset-id="${asset.id}">
          <div class="asset-preview" style="background: ${asset.color}22;">
            <span class="asset-icon">${this.getCategoryIcon(asset.category)}</span>
          </div>
          <div class="asset-info">
            <span class="asset-name">${asset.name}</span>
            <span class="asset-poly ${polyColor}">${asset.polyCount.toLocaleString()} 面</span>
          </div>
          ${isLocked ? '<span class="asset-lock">🔒</span>' : ''}
        </div>
      `;
    }).join('');

    list.querySelectorAll('.asset-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        if (item.classList.contains('locked')) {
          e.preventDefault();
          this.showToast('该构件需要通关后解锁', 'warning');
          return;
        }
        e.dataTransfer.setData('assetId', item.dataset.assetId);
        e.dataTransfer.effectAllowed = 'copy';
      });

      item.addEventListener('click', () => {
        if (item.classList.contains('locked')) {
          this.showToast('该构件需要通关后解锁', 'warning');
          return;
        }
        this.addAssetToScene(item.dataset.assetId);
      });
    });
  }

  getCategoryIcon(category) {
    const icons = {
      wall: '🧱',
      booth: '🪑',
      light: '💡',
      decoration: '🎨'
    };
    return icons[category] || '📦';
  }

  createMesh(asset) {
    let geometry;
    const { width, height, depth } = asset.size;

    switch (asset.shape) {
      case 'box':
        geometry = new THREE.BoxGeometry(width, height, depth);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(width / 2, width / 2, height, 16);
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(width / 2, 16, 12);
        break;
      case 'cone':
        geometry = new THREE.ConeGeometry(width / 2, height, 16);
        break;
      case 'torus':
        geometry = new THREE.TorusGeometry(width / 2, width / 6, 8, 16);
        break;
      case 'plane':
        geometry = new THREE.PlaneGeometry(width, depth);
        break;
      default:
        geometry = new THREE.BoxGeometry(width, height, depth);
    }

    const material = new THREE.MeshStandardMaterial({
      color: asset.color,
      roughness: 0.5,
      metalness: 0.3,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.assetId = asset.id;
    mesh.userData.asset = asset;
    mesh.userData.objectId = Date.now() + Math.random();

    if (asset.category === 'light') {
      const pointLight = new THREE.PointLight(asset.color, 1, 10);
      pointLight.position.y = height / 2;
      pointLight.castShadow = true;
      mesh.add(pointLight);

      const glowGeometry = new THREE.SphereGeometry(width / 3, 8, 8);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: asset.color,
        transparent: true,
        opacity: 0.5
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.position.y = height / 2;
      mesh.add(glow);
    }

    return mesh;
  }

  addAssetToScene(assetId) {
    const asset = this.assets.find(a => a.id === assetId);
    if (!asset) return;

    const mesh = this.createMesh(asset);
    
    const centerX = this.level ? this.level.sceneSize.width / 2 : 4;
    const centerZ = this.level ? this.level.sceneSize.depth / 2 : 3;
    
    mesh.position.set(centerX, asset.size.height / 2, centerZ);
    
    this.scene.add(mesh);
    this.objects.push(mesh);
    this.selectObject(mesh);
    this.updateSceneStats();
    this.scheduleAutoValidate();
    
    this.showToast(`已添加 ${asset.name}`, 'success');
  }

  handleAssetDrop(assetId, clientX, clientY) {
    const asset = this.assets.find(a => a.id === assetId);
    if (!asset) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersect = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.plane, intersect);

    if (intersect) {
      const mesh = this.createMesh(asset);
      
      const width = this.level ? this.level.sceneSize.width : 8;
      const depth = this.level ? this.level.sceneSize.depth : 6;
      
      intersect.x = Math.max(0.5, Math.min(width - 0.5, intersect.x));
      intersect.z = Math.max(0.5, Math.min(depth - 0.5, intersect.z));
      
      mesh.position.set(intersect.x, asset.size.height / 2, intersect.z);
      
      this.scene.add(mesh);
      this.objects.push(mesh);
      this.selectObject(mesh);
      this.updateSceneStats();
      this.scheduleAutoValidate();
      
      this.showToast(`已添加 ${asset.name}`, 'success');
    }
  }

  onCanvasClick(event) {
    if (this.isDraggingAsset) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.objects, true);

    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.assetId) {
        obj = obj.parent;
      }
      if (obj.userData.assetId) {
        this.selectObject(obj);
      }
    } else {
      this.deselectAll();
    }
  }

  selectObject(obj) {
    if (this.selectedObject) {
      this.selectedObject.material.emissive = new THREE.Color(0x000000);
    }
    
    this.selectedObject = obj;
    obj.material.emissive = new THREE.Color(0x3b82f6);
    obj.material.emissiveIntensity = 0.3;
  }

  deselectAll() {
    if (this.selectedObject) {
      this.selectedObject.material.emissive = new THREE.Color(0x000000);
      this.selectedObject = null;
    }
  }

  deleteSelected() {
    if (!this.selectedObject) return;

    const index = this.objects.indexOf(this.selectedObject);
    if (index > -1) {
      this.objects.splice(index, 1);
    }
    
    this.scene.remove(this.selectedObject);
    this.selectedObject.geometry.dispose();
    this.selectedObject.material.dispose();
    this.selectedObject = null;
    
    this.updateSceneStats();
    this.scheduleAutoValidate();
    this.showToast('已删除选中构件', 'info');
  }

  setTransformMode(mode) {
    this.transformMode = mode;
    document.querySelectorAll('.transform-btn[data-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    this.updateTransformMode();
  }

  updateTransformMode() {
    this.controls.enabled = true;
  }

  clearScene() {
    this.objects.forEach(obj => {
      this.scene.remove(obj);
      obj.geometry.dispose();
      obj.material.dispose();
    });
    this.objects = [];
    this.selectedObject = null;
    this.updateSceneStats();
    this.resetValidationUI();
    this.showToast('场景已清空', 'info');
  }

  updateSceneStats() {
    let totalPoly = 0;
    this.objects.forEach(obj => {
      if (obj.userData.asset) {
        const scale = obj.scale.x * obj.scale.y * obj.scale.z;
        totalPoly += Math.round(obj.userData.asset.polyCount * scale);
      }
    });

    document.getElementById('object-count').textContent = this.objects.length;
    document.getElementById('poly-count').textContent = totalPoly.toLocaleString();
    document.getElementById('poly-current').textContent = totalPoly.toLocaleString();

    const polyProgress = Math.min(100, (totalPoly / this.level.constraints.maxPolyCount) * 100);
    document.getElementById('poly-progress').style.width = `${polyProgress}%`;
  }

  scheduleAutoValidate() {
    if (this.autoValidateTimer) {
      clearTimeout(this.autoValidateTimer);
    }
    
    this.autoValidateTimer = setTimeout(() => {
      this.validate(true);
    }, 500);
  }

  async validate(isAuto = false) {
    if (this.isValidating) return;
    this.isValidating = true;

    if (!isAuto) {
      this.showToast('正在校验...', 'info');
    }

    if (this.objects.length === 0) {
      this.resetValidationUI();
      if (!isAuto) {
        this.showResultModal({
          passed: false,
          errors: [{ type: 'polycount', severity: 'warning', title: '场景为空', description: '请先添加构件到场景中再进行校验' }],
          channelWidth: { minWidth: 0, passed: false },
          lightOcclusion: { totalLights: 0, occludedLights: 0, passed: false },
          polyCount: { current: 0, limit: this.level?.constraints?.maxPolyCount || 0, passed: false }
        });
      }
      this.isValidating = false;
      return;
    }

    const sceneObjects = this.objects.map(obj => ({
      id: String(obj.userData.objectId),
      assetId: obj.userData.assetId,
      position: {
        x: parseFloat(obj.position.x.toFixed(3)),
        y: parseFloat(obj.position.y.toFixed(3)),
        z: parseFloat(obj.position.z.toFixed(3))
      },
      rotation: {
        x: parseFloat(obj.rotation.x.toFixed(3)),
        y: parseFloat(obj.rotation.y.toFixed(3)),
        z: parseFloat(obj.rotation.z.toFixed(3))
      },
      scale: {
        x: parseFloat(obj.scale.x.toFixed(3)),
        y: parseFloat(obj.scale.y.toFixed(3)),
        z: parseFloat(obj.scale.z.toFixed(3))
      }
    }));

    try {
      const payload = JSON.stringify({ levelId: this.levelId, objects: sceneObjects });
      const response = await fetch(`${API_BASE}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      const data = await response.json();

      if (data.success) {
        this.updateValidationUI(data.data, isAuto);
      } else {
        console.error('校验返回失败:', data.error || data.message);
        if (!isAuto) {
          this.showToast('校验失败: ' + (data.error || data.message || '未知错误'), 'error');
        }
      }
    } catch (error) {
      console.error('校验请求失败:', error);
      if (!isAuto) {
        this.showToast('无法连接到校验服务: ' + error.message, 'error');
      }
    } finally {
      this.isValidating = false;
    }
  }

  updateValidationUI(result, isAuto) {
    const { passed, errors, channelWidth } = result;
    const lightStats = result.lightOcclusion || result.lightStats || {};
    const polyStats = result.polyCount || result.polyStats || {};

    const lightUnobstructed = (lightStats.totalLights !== undefined)
      ? (lightStats.totalLights - (lightStats.occludedLights || 0))
      : (lightStats.unobstructed || 0);
    const lightTotal = lightStats.totalLights !== undefined ? lightStats.totalLights : (lightStats.total || 0);
    const lightPassed = lightStats.passed !== undefined ? lightStats.passed : false;
    const lightProgress = lightTotal > 0 ? (lightUnobstructed / lightTotal * 100) : 0;

    this.updateConstraintUI('channel', channelWidth.passed, 
      `${channelWidth.minWidth.toFixed(1)}m`, channelWidth.minWidth / this.level.constraints.minChannelWidth * 100);

    this.updateConstraintUI('light', lightPassed,
      `${lightUnobstructed}/${lightTotal}`, lightProgress);

    const polyCurrent = polyStats.current || 0;
    const polyMax = polyStats.limit || polyStats.max || 0;
    const polyPassed = polyStats.passed !== undefined ? polyStats.passed : false;
    const polyProgress = polyMax > 0 ? (polyCurrent / polyMax * 100) : 0;

    this.updateConstraintUI('poly', polyPassed,
      polyCurrent.toLocaleString(), polyProgress);

    const errorsList = document.getElementById('errors-list');
    if (errors && errors.length > 0) {
      errorsList.innerHTML = errors.map(err => {
        const title = err.title || err.message || '违规项';
        const description = err.description || err.suggestion || '';
        const severity = err.severity || 'error';
        return `
          <div class="error-item severity-${severity}">
            <span class="error-icon">${err.type === 'channel' ? '📏' : err.type === 'light' ? '💡' : '📊'}</span>
            <div class="error-content">
              <span class="error-title">${title}</span>
              <span class="error-desc">${description}</span>
            </div>
          </div>
        `;
      }).join('');
    } else {
      errorsList.innerHTML = '<p class="empty-text">暂无违规项</p>';
    }

    if (!isAuto) {
      this.showResultModal(result);
    }
  }

  updateConstraintUI(type, passed, currentText, progressPercent) {
    const statusEl = document.getElementById(`${type}-status`);
    const currentEl = document.getElementById(`${type}-current`);
    const progressEl = document.getElementById(`${type}-progress`);

    currentEl.textContent = currentText;
    progressEl.style.width = `${Math.min(100, progressPercent)}%`;

    if (passed) {
      statusEl.innerHTML = '<span class="status-success">✓ 通过</span>';
      progressEl.className = 'progress-fill success';
    } else {
      statusEl.innerHTML = '<span class="status-error">✗ 违规</span>';
      progressEl.className = 'progress-fill error';
    }
  }

  resetValidationUI() {
    ['channel', 'light', 'poly'].forEach(type => {
      document.getElementById(`${type}-status`).innerHTML = '<span class="status-pending">待检测</span>';
      document.getElementById(`${type}-current`).textContent = type === 'channel' ? '0.0m' : type === 'light' ? '0/0' : '0';
      document.getElementById(`${type}-progress`).style.width = '0%';
      document.getElementById(`${type}-progress`).className = 'progress-fill';
    });
    document.getElementById('errors-list').innerHTML = '<p class="empty-text">暂无违规项</p>';
  }

  showResultModal(result) {
    const modal = document.getElementById('result-modal');
    const titleEl = document.getElementById('result-title');
    const summaryEl = document.getElementById('result-summary');
    const detailsEl = document.getElementById('result-details');
    const rewardsEl = document.getElementById('result-rewards');
    const nextBtn = document.getElementById('next-btn');

    const { passed, errors, channelWidth } = result;
    const lightOcclusion = result.lightOcclusion || result.lightStats || {};
    const polyCount = result.polyCount || result.polyStats || {};

    const lightTotal = lightOcclusion.totalLights !== undefined ? lightOcclusion.totalLights : (lightOcclusion.total || 0);
    const lightUnobstructed = lightOcclusion.totalLights !== undefined
      ? (lightOcclusion.totalLights - (lightOcclusion.occludedLights || 0))
      : (lightOcclusion.unobstructed || 0);
    const polyCurrent = polyCount.current || 0;

    if (passed) {
      titleEl.textContent = '🎉 恭喜通过！';
      summaryEl.innerHTML = `
        <div class="result-icon success">✓</div>
        <h3>完美通过所有约束校验</h3>
        <p>你已成功搭建符合规范的${this.level.name}</p>
      `;

      detailsEl.innerHTML = `
        <div class="result-stats">
          <div class="result-stat">
            <span class="stat-label">最小通道宽度</span>
            <span class="stat-value success">${channelWidth.minWidth.toFixed(1)}m</span>
          </div>
          <div class="result-stat">
            <span class="stat-label">正常光源</span>
            <span class="stat-value success">${lightUnobstructed}/${lightTotal}</span>
          </div>
          <div class="result-stat">
            <span class="stat-label">总面数</span>
            <span class="stat-value success">${polyCurrent.toLocaleString()}</span>
          </div>
        </div>
      `;

      if (this.level.reward && this.level.unlockedAssets) {
        rewardsEl.classList.remove('hidden');
        rewardsEl.innerHTML = `
          <div class="rewards-content">
            <h4>🎁 解锁奖励</h4>
            <p class="reward-desc">${this.level.reward}</p>
            <div class="unlocked-assets">
              ${this.level.unlockedAssets.map(assetId => {
                const asset = this.assets.find(a => a.id === assetId);
                return asset ? `<span class="unlock-badge">${this.getCategoryIcon(asset.category)} ${asset.name}</span>` : '';
              }).join('')}
            </div>
          </div>
        `;
      } else {
        rewardsEl.classList.add('hidden');
      }

      const hasNextLevel = this.levelId < 3;
      nextBtn.classList.toggle('hidden', !hasNextLevel);
    } else {
      titleEl.textContent = '❌ 搭建不通过';
      summaryEl.innerHTML = `
        <div class="result-icon error">✗</div>
        <h3>存在 ${errors ? errors.length : 0} 项违规</h3>
        <p>请调整场景布局后重新提交校验</p>
      `;

      detailsEl.innerHTML = `
        <div class="result-errors">
          ${(errors || []).map(err => {
            const title = err.title || err.message || '违规项';
            const description = err.description || err.suggestion || '';
            return `
              <div class="result-error-item severity-${err.severity || 'error'}">
                <span class="error-type">${err.type === 'channel' ? '📏 通道' : err.type === 'light' ? '💡 光源' : '📊 面数'}</span>
                <div class="error-info">
                  <strong>${title}</strong>
                  <p>${description}</p>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      rewardsEl.classList.add('hidden');
      nextBtn.classList.add('hidden');
    }

    modal.classList.remove('hidden');
  }

  hideModal() {
    document.getElementById('result-modal').classList.add('hidden');
  }

  async loadTestScene(testType) {
    try {
      this.showToast('正在生成测试场景...', 'info');
      
      const response = await fetch(`${API_BASE}/generate-test-scene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testType, levelId: this.levelId })
      });

      const data = await response.json();
      
      if (data.success) {
        this.clearScene();
        this.loadSceneData(data.data);
        setTimeout(() => this.validate(), 300);
      } else {
        this.showToast('生成测试场景失败', 'error');
      }
    } catch (error) {
      console.error('生成测试场景失败:', error);
      this.showToast('无法连接到后端服务', 'error');
    }
  }

  loadSceneData(sceneData) {
    if (!sceneData.objects) return;

    sceneData.objects.forEach(objData => {
      const asset = this.assets.find(a => a.id === objData.assetId);
      if (!asset) return;

      const mesh = this.createMesh(asset);
      mesh.position.set(objData.position.x, objData.position.y, objData.position.z);
      mesh.rotation.set(objData.rotation.x, objData.rotation.y, objData.rotation.z);
      mesh.scale.set(objData.scale.x, objData.scale.y, objData.scale.z);
      
      this.scene.add(mesh);
      this.objects.push(mesh);
    });

    this.updateSceneStats();
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  onWindowResize() {
    const container = document.getElementById('viewport');
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    this.controls.update();
    
    const time = Date.now() * 0.001;
    this.objects.forEach((obj, i) => {
      if (obj.userData.asset?.category === 'light') {
        obj.position.y = obj.userData.asset.size.height / 2 + Math.sin(time * 2 + i) * 0.05;
      }
    });
    
    this.renderer.render(this.scene, this.camera);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.editor = new ThreeDEditor();
});
