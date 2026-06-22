const fs = require('fs');
const path = require('path');

class GeometryUtils {
  static getObjectBounds(obj, asset) {
    const w = asset.size.width * obj.scale.x;
    const h = asset.size.height * obj.scale.y;
    const d = asset.size.depth * obj.scale.z;
    
    const cx = obj.position.x;
    const cy = obj.position.y;
    const cz = obj.position.z;
    
    return {
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minY: cy - h / 2,
      maxY: cy + h / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      centerX: cx,
      centerY: cy,
      centerZ: cz,
      width: w,
      height: h,
      depth: d
    };
  }
  
  static distance2D(x1, z1, x2, z2) {
    return Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
  }
  
  static rayAABBIntersect(rayOrigin, rayDir, bounds) {
    let tmin = -Infinity;
    let tmax = Infinity;
    
    for (const axis of ['x', 'y', 'z']) {
      const o = rayOrigin[axis];
      const d = rayDir[axis];
      const minVal = bounds[`min${axis.toUpperCase()}`];
      const maxVal = bounds[`max${axis.toUpperCase()}`];
      
      if (Math.abs(d) < 1e-8) {
        if (o < minVal || o > maxVal) return null;
      } else {
        let t1 = (minVal - o) / d;
        let t2 = (maxVal - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    
    return tmin >= 0 ? tmin : tmax >= 0 ? 0 : null;
  }
  
  static normalize(v) {
    const len = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
    return len > 0 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 0, z: 0 };
  }
}

class GridUtils {
  constructor(sceneWidth, sceneDepth, cellSize = 0.1) {
    this.sceneWidth = sceneWidth;
    this.sceneDepth = sceneDepth;
    this.cellSize = cellSize;
    this.cols = Math.ceil(sceneWidth / cellSize);
    this.rows = Math.ceil(sceneDepth / cellSize);
    this.grid = new Array(this.rows).fill(null).map(() => new Array(this.cols).fill(0));
  }
  
  worldToGrid(x, z) {
    const halfW = this.sceneWidth / 2;
    const halfD = this.sceneDepth / 2;
    const col = Math.floor((x + halfW) / this.cellSize);
    const row = Math.floor((z + halfD) / this.cellSize);
    return { col: Math.max(0, Math.min(this.cols - 1, col)), row: Math.max(0, Math.min(this.rows - 1, row)) };
  }
  
  gridToWorld(col, row) {
    const halfW = this.sceneWidth / 2;
    const halfD = this.sceneDepth / 2;
    return {
      x: (col + 0.5) * this.cellSize - halfW,
      z: (row + 0.5) * this.cellSize - halfD
    };
  }
  
  markObstacle(minX, maxX, minZ, maxZ) {
    const start = this.worldToGrid(minX, minZ);
    const end = this.worldToGrid(maxX, maxZ);
    
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.col; c <= end.col; c++) {
        if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
          this.grid[r][c] = 1;
        }
      }
    }
  }
  
  floodFill(startX, startZ) {
    const start = this.worldToGrid(startX, startZ);
    const visited = new Array(this.rows).fill(null).map(() => new Array(this.cols).fill(false));
    const queue = [[start.row, start.col]];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    
    if (this.grid[start.row][start.col] === 1) return visited;
    
    visited[start.row][start.col] = true;
    
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      
      for (const [dr, dc] of directions) {
        const nr = r + dr;
        const nc = c + dc;
        
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols && 
            !visited[nr][nc] && this.grid[nr][nc] === 0) {
          visited[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
    }
    
    return visited;
  }
  
  distanceTransform(accessible) {
    const dist = new Array(this.rows).fill(null).map(() => new Array(this.cols).fill(Infinity));
    const queue = [];
    
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] === 1) {
          dist[r][c] = 0;
          queue.push([r, c]);
        }
      }
    }
    
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      
      for (const [dr, dc] of directions) {
        const nr = r + dr;
        const nc = c + dc;
        
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          const newDist = dist[r][c] + this.cellSize;
          if (newDist < dist[nr][nc]) {
            dist[nr][nc] = newDist;
            queue.push([nr, nc]);
          }
        }
      }
    }
    
    let minAccessibleDist = Infinity;
    let minPos = null;
    
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (accessible[r][c] && dist[r][c] < minAccessibleDist) {
          minAccessibleDist = dist[r][c];
          minPos = this.gridToWorld(c, r);
        }
      }
    }
    
    return {
      minDistance: minAccessibleDist === Infinity ? 0 : minAccessibleDist,
      minPosition: minPos,
      distanceGrid: dist
    };
  }
}

class ChannelValidator {
  validate(objects, assets, levelConfig) {
    const errors = [];
    const sceneWidth = levelConfig.sceneSize.width;
    const sceneDepth = levelConfig.sceneSize.depth;
    const minChannelWidth = levelConfig.constraints.minChannelWidth;
    
    const grid = new GridUtils(sceneWidth, sceneDepth, 0.1);
    
    for (const obj of objects) {
      const asset = assets.find(a => a.id === obj.assetId);
      if (!asset || asset.category === 'light') continue;
      
      const bounds = GeometryUtils.getObjectBounds(obj, asset);
      grid.markObstacle(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
    }
    
    const entranceX = 0;
    const entranceZ = -sceneDepth / 2 + 0.5;
    const accessible = grid.floodFill(entranceX, entranceZ);
    
    const distResult = grid.distanceTransform(accessible);
    const effectiveMinWidth = distResult.minDistance * 2;
    
    const passed = effectiveMinWidth >= minChannelWidth;
    
    if (!passed) {
      errors.push({
        type: 'channel',
        severity: 'error',
        message: `通道宽度不足: 最窄处仅 ${effectiveMinWidth.toFixed(2)}m，要求 ≥ ${minChannelWidth}m`,
        position: distResult.minPosition ? { x: distResult.minPosition.x, z: distResult.minPosition.z } : null,
        suggestion: '请将展台或墙体向两侧移动，确保通行通道足够宽敞'
      });
    }
    
    return {
      passed,
      minWidth: effectiveMinWidth,
      requiredWidth: minChannelWidth,
      errors
    };
  }
}

class LightOcclusionValidator {
  validate(objects, assets, levelConfig) {
    const errors = [];
    const lights = objects.filter(obj => {
      const asset = assets.find(a => a.id === obj.assetId);
      return asset && asset.category === 'light';
    });
    
    const booths = objects.filter(obj => {
      const asset = assets.find(a => a.id === obj.assetId);
      return asset && asset.category === 'booth';
    });
    
    const minLightCount = levelConfig.constraints.minLightCount || 0;
    const minLightDistance = levelConfig.constraints.minLightDistance || 0;
    
    if (lights.length < minLightCount) {
      errors.push({
        type: 'light',
        severity: 'error',
        message: `光源数量不足: 当前 ${lights.length} 盏，要求 ≥ ${minLightCount} 盏`,
        suggestion: '请添加至少 ' + minLightCount + ' 盏灯光以满足照明要求'
      });
      return {
        passed: false,
        totalLights: lights.length,
        occludedLights: 0,
        details: [],
        errors
      };
    }
    
    const details = [];
    let occludedCount = 0;
    
    for (const light of lights) {
      const lightAsset = assets.find(a => a.id === light.assetId);
      const lightPos = { x: light.position.x, y: light.position.y, z: light.position.z };
      
      const nearbyBooths = booths.filter(booth => {
        const dist = GeometryUtils.distance2D(lightPos.x, lightPos.z, booth.position.x, booth.position.z);
        return dist < (lightAsset.distance || 10);
      });
      
      if (minLightDistance > 0) {
        for (const booth of booths) {
          const dist = GeometryUtils.distance2D(lightPos.x, lightPos.z, booth.position.x, booth.position.z);
          if (dist < minLightDistance) {
            errors.push({
              type: 'light',
              severity: 'warning',
              message: `光源 "${lightAsset.name}" 与展台距离过近: ${dist.toFixed(2)}m，要求 ≥ ${minLightDistance}m`,
              objectIds: [light.id, booth.id],
              position: { x: lightPos.x, z: lightPos.z },
              suggestion: '请将光源或展台移开，保持适当距离以获得最佳照明效果'
            });
          }
        }
      }
      
      let occludedRays = 0;
      const totalRays = 100;
      const occludedBy = new Set();
      
      for (let i = 0; i < nearbyBooths.length; i++) {
        const targetBooth = nearbyBooths[i];
        const targetAsset = assets.find(a => a.id === targetBooth.assetId);
        const targetBounds = GeometryUtils.getObjectBounds(targetBooth, targetAsset);
        
        const samplePoints = this.generateSamplePoints(targetBounds, 20);
        
        for (const point of samplePoints) {
          const rayDir = GeometryUtils.normalize({
            x: point.x - lightPos.x,
            y: point.y - lightPos.y,
            z: point.z - lightPos.z
          });
          
          let occluded = false;
          
          for (const otherBooth of booths) {
            if (otherBooth.id === targetBooth.id) continue;
            
            const otherAsset = assets.find(a => a.id === otherBooth.assetId);
            const otherBounds = GeometryUtils.getObjectBounds(otherBooth, otherAsset);
            
            const hitDist = GeometryUtils.rayAABBIntersect(lightPos, rayDir, otherBounds);
            if (hitDist !== null && hitDist < 50) {
              occluded = true;
              occludedBy.add(otherBooth.id);
              break;
            }
          }
          
          if (occluded) occludedRays++;
        }
      }
      
      const occlusionRate = totalRays > 0 ? occludedRays / totalRays : 0;
      const isOccluded = occlusionRate > 0.3;
      
      if (isOccluded) occludedCount++;
      
      details.push({
        lightId: light.id,
        lightName: lightAsset.name,
        occludedBy: Array.from(occludedBy),
        occlusionRate: Math.round(occlusionRate * 100) / 100,
        isOccluded
      });
      
      if (isOccluded) {
        errors.push({
          type: 'light',
          severity: 'error',
          message: `光源 "${lightAsset.name}" 被遮挡: 遮挡率 ${(occlusionRate * 100).toFixed(0)}%`,
          objectIds: [light.id, ...Array.from(occludedBy)],
          position: { x: lightPos.x, z: lightPos.z },
          suggestion: '请移除或调整遮挡光源的展台，确保光线能够正常照射'
        });
      }
    }
    
    const passed = occludedCount === 0 && errors.filter(e => e.severity === 'error').length === 0;
    
    return {
      passed,
      totalLights: lights.length,
      occludedLights: occludedCount,
      details,
      errors
    };
  }
  
  generateSamplePoints(bounds, count) {
    const points = [];
    for (let i = 0; i < count; i++) {
      points.push({
        x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
        y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
        z: bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)
      });
    }
    return points;
  }
}

class PolyCountValidator {
  validate(objects, assets, levelConfig) {
    const errors = [];
    const maxPolyCount = levelConfig.constraints.maxPolyCount;
    
    let totalPolyCount = 0;
    const objectPolyCounts = [];
    
    for (const obj of objects) {
      const asset = assets.find(a => a.id === obj.assetId);
      if (!asset) continue;
      
      const scaleFactor = Math.pow(obj.scale.x * obj.scale.y * obj.scale.z, 0.5);
      const objPolyCount = Math.round(asset.polyCount * scaleFactor);
      
      totalPolyCount += objPolyCount;
      objectPolyCounts.push({
        id: obj.id,
        assetId: obj.assetId,
        name: asset.name,
        polyCount: objPolyCount,
        basePolyCount: asset.polyCount
      });
    }
    
    const passed = totalPolyCount <= maxPolyCount;
    
    if (!passed) {
      const overage = totalPolyCount - maxPolyCount;
      const sortedObjects = [...objectPolyCounts].sort((a, b) => b.polyCount - a.polyCount);
      const highPolyObjects = sortedObjects.filter(o => o.polyCount > 500).slice(0, 3);
      
      errors.push({
        type: 'polycount',
        severity: 'error',
        message: `模型面数超限: 当前 ${totalPolyCount.toLocaleString()} 三角面，上限 ${maxPolyCount.toLocaleString()}，超出 ${overage.toLocaleString()}`,
        objectIds: highPolyObjects.map(o => o.id),
        suggestion: `请减少高面数模型或降低缩放比例。高面数构件: ${highPolyObjects.map(o => `${o.name}(${o.polyCount.toLocaleString()}面)`).join(', ')}`
      });
    }
    
    return {
      passed,
      current: totalPolyCount,
      limit: maxPolyCount,
      objectPolyCounts,
      errors
    };
  }
}

class TestSceneGenerator {
  constructor(assets, levels) {
    this.assets = assets;
    this.levels = levels;
  }
  
  generate(levelId, testType) {
    const level = this.levels.find(l => l.id === levelId);
    if (!level) return null;
    
    const objects = [];
    const expectedErrors = [];
    let description = '';
    
    const createObject = (assetId, x, y, z, rotY = 0, scale = 1) => {
      return {
        id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        assetId,
        position: { x, y, z },
        rotation: { x: 0, y: rotY, z: 0 },
        scale: { x: scale, y: scale, z: scale },
        polyCount: 0
      };
    };
    
    const halfW = level.sceneSize.width / 2;
    const halfD = level.sceneSize.depth / 2;
    
    switch (testType) {
      case 'narrow_channel':
        description = '狭窄通道测试场景 - 展台刻意布置在通道两侧，造成通道宽度不足';
        
        objects.push(createObject('wall_straight', -halfW + 1, 1.25, 0, Math.PI / 2));
        objects.push(createObject('wall_straight', halfW - 1, 1.25, 0, Math.PI / 2));
        objects.push(createObject('wall_straight', 0, 1.25, -halfD + 1, 0));
        objects.push(createObject('wall_straight', 0, 1.25, halfD - 1, 0));
        
        objects.push(createObject('booth_rect_medium', -1.5, 0.45, -1));
        objects.push(createObject('booth_rect_medium', 1.5, 0.45, -1));
        objects.push(createObject('booth_rect_medium', -1.2, 0.45, 1));
        objects.push(createObject('booth_rect_medium', 1.2, 0.45, 1));
        
        objects.push(createObject('light_spot', 0, 3, -2));
        objects.push(createObject('light_spot', 0, 3, 2));
        
        expectedErrors.push('通道宽度不足');
        break;
        
      case 'high_polycount':
        description = '高面数测试场景 - 大量高精度装饰模型，造成总面数超限';
        
        objects.push(createObject('wall_straight', -halfW + 1, 1.25, 0, Math.PI / 2));
        objects.push(createObject('wall_straight', halfW - 1, 1.25, 0, Math.PI / 2));
        objects.push(createObject('wall_straight', 0, 1.25, -halfD + 1, 0));
        objects.push(createObject('wall_straight', 0, 1.25, halfD - 1, 0));
        
        for (let i = 0; i < 15; i++) {
          const x = (Math.random() - 0.5) * (level.sceneSize.width - 4);
          const z = (Math.random() - 0.5) * (level.sceneSize.depth - 4);
          objects.push(createObject('decoration_sculpture', x, 0.75, z, Math.random() * Math.PI, 1.5));
        }
        
        for (let i = 0; i < 10; i++) {
          const x = (Math.random() - 0.5) * (level.sceneSize.width - 4);
          const z = (Math.random() - 0.5) * (level.sceneSize.depth - 4);
          objects.push(createObject('decoration_plant', x, 0.6, z, Math.random() * Math.PI, 1.2));
        }
        
        objects.push(createObject('light_spot', 0, 3, -2));
        objects.push(createObject('light_spot', 0, 3, 2));
        
        expectedErrors.push('模型面数超限');
        break;
        
      case 'light_occlusion':
        description = '光源遮挡测试场景 - 展台刻意摆放在光源前方，造成光线遮挡';
        
        objects.push(createObject('wall_straight', -halfW + 1, 1.25, 0, Math.PI / 2));
        objects.push(createObject('wall_straight', halfW - 1, 1.25, 0, Math.PI / 2));
        objects.push(createObject('wall_straight', 0, 1.25, -halfD + 1, 0));
        objects.push(createObject('wall_straight', 0, 1.25, halfD - 1, 0));
        
        objects.push(createObject('light_spot', -2, 3, -2, Math.PI / 4));
        objects.push(createObject('light_spot', 2, 3, -2, -Math.PI / 4));
        objects.push(createObject('light_spot', 0, 3, 2, 0));
        
        objects.push(createObject('booth_rect_medium', -1.5, 0.45, -1.5));
        objects.push(createObject('booth_rect_medium', 1.5, 0.45, -1.5));
        objects.push(createObject('booth_square', 0, 0.45, 1.5));
        
        objects.push(createObject('booth_rect_medium', -2, 0.45, -2.5));
        objects.push(createObject('booth_rect_medium', 2, 0.45, -2.5));
        
        expectedErrors.push('光源被遮挡');
        break;
        
      case 'all':
        description = '综合违规测试场景 - 同时包含通道狭窄、面数超限、光源遮挡三种违规';
        
        objects.push(createObject('wall_straight', -halfW + 1, 1.25, 0, Math.PI / 2));
        objects.push(createObject('wall_straight', halfW - 1, 1.25, 0, Math.PI / 2));
        objects.push(createObject('wall_straight', 0, 1.25, -halfD + 1, 0));
        objects.push(createObject('wall_straight', 0, 1.25, halfD - 1, 0));
        
        objects.push(createObject('booth_rect_medium', -1.2, 0.45, 0));
        objects.push(createObject('booth_rect_medium', 1.2, 0.45, 0));
        objects.push(createObject('booth_rect_medium', -1, 0.45, 1.5));
        objects.push(createObject('booth_rect_medium', 1, 0.45, 1.5));
        
        objects.push(createObject('light_spot', -2, 3, -2, Math.PI / 4));
        objects.push(createObject('light_spot', 2, 3, -2, -Math.PI / 4));
        
        objects.push(createObject('booth_rect_medium', -2, 0.45, -2.5));
        objects.push(createObject('booth_rect_medium', 2, 0.45, -2.5));
        
        for (let i = 0; i < 10; i++) {
          const x = (Math.random() - 0.5) * (level.sceneSize.width - 4);
          const z = (Math.random() - 0.5) * (level.sceneSize.depth - 4);
          objects.push(createObject('decoration_sculpture', x, 0.75, z, Math.random() * Math.PI));
        }
        
        expectedErrors.push('通道宽度不足', '模型面数超限', '光源被遮挡');
        break;
    }
    
    for (const obj of objects) {
      const asset = this.assets.find(a => a.id === obj.assetId);
      if (asset) {
        obj.polyCount = asset.polyCount;
      }
    }
    
    return {
      objects,
      expectedErrors,
      description
    };
  }
}

class ValidationEngine {
  constructor() {
    this.levels = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'levels.json'), 'utf8'));
    this.assets = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'assets.json'), 'utf8'));
    this.completedLevels = new Set();
    this.unlockedAssets = new Set();
    
    this.channelValidator = new ChannelValidator();
    this.lightValidator = new LightOcclusionValidator();
    this.polyValidator = new PolyCountValidator();
    this.testGenerator = new TestSceneGenerator(this.assets, this.levels);
    
    this.levels.forEach((level, index) => {
      level.unlocked = index === 0;
      level.completed = false;
    });
  }
  
  getLevels() {
    return this.levels.map(level => ({
      ...level,
      unlocked: level.unlocked || this.completedLevels.has(level.id - 1),
      completed: this.completedLevels.has(level.id)
    }));
  }
  
  getAssets(levelId = null) {
    if (levelId) {
      const level = this.levels.find(l => l.id === levelId);
      if (level) {
        const availableIds = [...level.availableAssets];
        for (const completedId of this.completedLevels) {
          const completedLevel = this.levels.find(l => l.id === completedId);
          if (completedLevel && completedLevel.reward) {
            availableIds.push(...completedLevel.reward);
          }
        }
        return this.assets.filter(a => availableIds.includes(a.id));
      }
    }
    return this.assets;
  }
  
  validate(levelId, objects) {
    const level = this.levels.find(l => l.id === levelId);
    if (!level) {
      return {
        success: false,
        error: '关卡不存在'
      };
    }
    
    const channelResult = this.channelValidator.validate(objects, this.assets, level);
    const lightResult = this.lightValidator.validate(objects, this.assets, level);
    const polyResult = this.polyValidator.validate(objects, this.assets, level);
    
    const allErrors = [
      ...channelResult.errors,
      ...lightResult.errors,
      ...polyResult.errors
    ];
    
    const passed = channelResult.passed && lightResult.passed && polyResult.passed;
    const errors = allErrors.filter(e => e.severity === 'error');
    const warnings = allErrors.filter(e => e.severity === 'warning');
    
    let score = 0;
    let unlockedRewards = [];
    
    if (passed) {
      const channelScore = Math.max(0, Math.min(30, Math.floor((channelResult.minWidth / level.constraints.minChannelWidth) * 30)));
      const lightScore = lightResult.totalLights >= level.constraints.minLightCount ? 25 : 0;
      const occlusionScore = lightResult.occludedLights === 0 ? 20 : 0;
      const polyScore = Math.max(0, Math.min(25, Math.floor((1 - polyResult.current / polyResult.limit) * 25)));
      
      score = channelScore + lightScore + occlusionScore + polyScore;
      
      if (!this.completedLevels.has(levelId)) {
        this.completedLevels.add(levelId);
        unlockedRewards = level.reward || [];
        unlockedRewards.forEach(r => this.unlockedAssets.add(r));
        
        const nextLevel = this.levels.find(l => l.id === levelId + 1);
        if (nextLevel) {
          nextLevel.unlocked = true;
        }
      }
    }
    
    return {
      success: true,
      data: {
        passed,
        score,
        totalPolyCount: polyResult.current,
        errors,
        warnings,
        channelWidth: {
          minWidth: channelResult.minWidth,
          requiredWidth: channelResult.requiredWidth,
          passed: channelResult.passed
        },
        lightOcclusion: {
          totalLights: lightResult.totalLights,
          occludedLights: lightResult.occludedLights,
          passed: lightResult.passed,
          details: lightResult.details
        },
        polyCount: {
          current: polyResult.current,
          limit: polyResult.limit,
          passed: polyResult.passed
        },
        unlockedRewards: passed ? unlockedRewards : undefined
      }
    };
  }
  
  generateTestScene(levelId, testType) {
    const result = this.testGenerator.generate(levelId, testType);
    if (!result) {
      return {
        success: false,
        error: '生成测试场景失败'
      };
    }
    return {
      success: true,
      data: result
    };
  }
}

module.exports = ValidationEngine;
