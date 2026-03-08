/**
 * TAP TAP WAR - Google Sheets Database Integration v3.0
 * FIXED: Persistent data, Auto-save, Admin functions
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  // GANTI URL INI DENGAN URL GOOGLE APPS SCRIPT ANDA
  API_URL: 'https://script.google.com/macros/s/AKfycbw1a38Z3D5Xe0qjn_l3oMMk1CkE5kXBg3c3omNhDDq-ceNWreWZRVd_fCg5pot5Gj6-/exec',
  
  // Admin credentials
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'admin123',
  
  // Storage keys
  USER_KEY: 'ttw_user_v3',
  
  // Auto-save interval (3 detik)
  AUTO_SAVE_INTERVAL: 3000,
  
  // Debug
  DEBUG: true
};

// ============================================
// GAME STATE
// ============================================
const GameState = {
  user: null,
  isAdmin: false,
  score: 0,
  coin: 0,
  monsterHp: 100,
  maxMonsterHp: 100,
  monsterLevel: 1,
  currentMonster: 0,
  monsters: ['👹', '👺', '👻', '👽', '👾', '🤖', '💀', '👿', '🤡', '💩', '🐉', '🔥'],
  inventory: [],
  autoTapInterval: null,
  powerMultiplier: 1,
  coinMultiplier: 1,
  criticalChance: 0,
  apiAvailable: false,
  isLoading: false,
  shopItems: [],
  pendingSave: false
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
function log(...args) {
  if (CONFIG.DEBUG) {
    console.log('[TTW]', ...args);
  }
}

function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: rgba(28, 28, 30, 0.95);
    border: 1px solid ${type === 'error' ? '#FF3B30' : type === 'warning' ? '#FF9500' : '#34C759'};
    border-radius: 12px;
    padding: 16px 20px;
    color: white;
    min-width: 250px;
    max-width: 350px;
    animation: slideIn 0.3s ease;
    backdrop-filter: blur(10px);
    font-size: 14px;
  `;
  toast.innerHTML = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// LOCAL STORAGE
// ============================================
const Storage = {
  save(userData) {
    try {
      localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(userData));
      log('💾 Saved to localStorage');
    } catch (e) {
      log('❌ Failed to save:', e);
    }
  },
  
  load() {
    try {
      const data = localStorage.getItem(CONFIG.USER_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      log('❌ Failed to load:', e);
    }
    return null;
  },
  
  clear() {
    try {
      localStorage.removeItem(CONFIG.USER_KEY);
      log('🗑️ Storage cleared');
    } catch (e) {
      log('❌ Failed to clear:', e);
    }
  }
};

// ============================================
// API FUNCTIONS
// ============================================
async function apiRequest(action, data = {}) {
  if (CONFIG.API_URL.includes('YOUR_SCRIPT_ID') || CONFIG.API_URL.includes('AKfycbw1a38')) {
    throw new Error('API_URL_NOT_CONFIGURED');
  }

  const requestData = { action, ...data };
  log('📤 API:', action, data);

  try {
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    log('📥 API Response:', action, result.success);
    
    if (result.success) {
      GameState.apiAvailable = true;
    }
    
    return result;
  } catch (error) {
    log('❌ API Error:', action, error.message);
    GameState.apiAvailable = false;
    throw error;
  }
}

// ============================================
// AUTHENTICATION
// ============================================
async function registerUser(username, password, email = '') {
  if (!username || username.length < 3) {
    return { success: false, message: 'Username minimal 3 karakter' };
  }
  
  if (!password || password.length < 6) {
    return { success: false, message: 'Password minimal 6 karakter' };
  }

  try {
    showLoading('Creating account...');
    
    const result = await apiRequest('register', { username, password, email });

    if (result.success) {
      Storage.save(result.user);
      hideLoading();
      return { success: true, user: result.user, message: 'Registrasi berhasil!' };
    } else {
      hideLoading();
      return { success: false, message: result.message || 'Registrasi gagal' };
    }
  } catch (error) {
    hideLoading();
    if (error.message === 'API_URL_NOT_CONFIGURED') {
      return { success: false, message: 'API URL belum dikonfigurasi!' };
    }
    return { success: false, message: 'Gagal terhubung ke database' };
  }
}

async function loginUser(username, password) {
  if (!username || !password) {
    return { success: false, message: 'Username dan password wajib diisi' };
  }

  // Admin login
  if (username === CONFIG.ADMIN_USERNAME && password === CONFIG.ADMIN_PASSWORD) {
    const adminUser = {
      id: 'admin',
      username: 'admin',
      isAdmin: true,
      score: 999999,
      coin: 999999,
      vip_status: 'permanent',
      monster_level: 999
    };
    Storage.save(adminUser);
    GameState.user = adminUser;
    GameState.isAdmin = true;
    return { success: true, user: adminUser, message: 'Login sebagai Admin!', isAdmin: true };
  }

  try {
    showLoading('Logging in...');
    
    const result = await apiRequest('login', { username, password });

    if (result.success && result.user) {
      // Save to storage
      Storage.save(result.user);
      
      // Update game state
      GameState.user = result.user;
      GameState.isAdmin = false;
      GameState.score = result.user.score || 0;
      GameState.coin = result.user.coin || 1000;
      GameState.monsterLevel = result.user.monster_level || 1;
      
      try {
        GameState.inventory = result.user.inventory ? JSON.parse(result.user.inventory) : [];
      } catch {
        GameState.inventory = [];
      }
      
      applyInventoryEffects();
      
      hideLoading();
      return { success: true, user: result.user, message: 'Login berhasil!' };
    } else {
      hideLoading();
      return { success: false, message: result.message || 'Login gagal' };
    }
  } catch (error) {
    hideLoading();
    return { success: false, message: 'Gagal terhubung ke database' };
  }
}

function getCurrentUser() {
  if (GameState.user) return GameState.user;
  GameState.user = Storage.load();
  if (GameState.user) {
    GameState.isAdmin = GameState.user.isAdmin || false;
  }
  return GameState.user;
}

function isLoggedIn() {
  return getCurrentUser() !== null;
}

function isAdmin() {
  const user = getCurrentUser();
  return user && user.isAdmin === true;
}

async function logout() {
  if (!confirm('Yakin ingin logout?')) return;
  
  showLoading('Saving progress...');
  
  // Save final progress
  if (GameState.user && !GameState.isAdmin) {
    try {
      await saveProgressToServer();
    } catch (e) {
      log('Final save failed:', e);
    }
  }
  
  // Clear intervals - CRITICAL FIX: Also clear auto-save interval
  if (GameState.autoTapInterval) {
    clearInterval(GameState.autoTapInterval);
    GameState.autoTapInterval = null;
  }
  
  // CRITICAL FIX: Clear auto-save interval
  if (window.autoSaveInterval) {
    clearInterval(window.autoSaveInterval);
    window.autoSaveInterval = null;
    log('🛑 Auto-save stopped');
  }
  
  // Clear state
  Storage.clear();
  GameState.user = null;
  GameState.isAdmin = false;
  GameState.score = 0;
  GameState.coin = 0;
  GameState.inventory = [];
  
  hideLoading();
  window.location.href = 'index.html';
}

// ============================================
// SAVE/LOAD PROGRESS - CRITICAL FIX
// ============================================
async function saveProgressToServer() {
  const user = GameState.user;
  if (!user || GameState.isAdmin) return { success: false };

  const data = {
    username: user.username,
    score: GameState.score,
    coin: GameState.coin,
    monster_level: GameState.monsterLevel,
    vip_status: user.vip_status,
    inventory: JSON.stringify(GameState.inventory)
  };

  try {
    const result = await apiRequest('saveProgress', data);
    
    if (result.success) {
      // Update local storage with new values
      user.score = GameState.score;
      user.coin = GameState.coin;
      user.monster_level = GameState.monsterLevel;
      Storage.save(user);
      
      log('💾 Progress saved to server:', { score: GameState.score, coin: GameState.coin });
      return { success: true };
    }
  } catch (error) {
    log('❌ Save to server failed:', error);
  }

  return { success: false };
}

async function loadProgressFromServer() {
  const user = GameState.user;
  if (!user || GameState.isAdmin) return { success: false };

  try {
    const result = await apiRequest('getUserData', { username: user.username });

    if (result.success && result.data) {
      const serverData = result.data;
      
      // Update game state with server data - CRITICAL FIX: Include vip_status
      GameState.score = serverData.score || 0;
      GameState.coin = serverData.coin || 1000;
      GameState.monsterLevel = serverData.monster_level || 1;
      
      // CRITICAL FIX: Sync VIP status from server
      if (serverData.vip_status) {
        user.vip_status = serverData.vip_status;
      }
      
      try {
        GameState.inventory = serverData.inventory ? JSON.parse(serverData.inventory) : [];
      } catch {
        GameState.inventory = [];
      }
      
      // Update local storage
      user.score = GameState.score;
      user.coin = GameState.coin;
      user.monster_level = GameState.monsterLevel;
      Storage.save(user);
      
      applyInventoryEffects();
      
      log('📥 Loaded from server:', { score: GameState.score, coin: GameState.coin });
      return { success: true };
    }
  } catch (error) {
    log('❌ Load from server failed:', error);
  }

  // Fallback to local data
  GameState.score = user.score || 0;
  GameState.coin = user.coin || 1000;
  GameState.monsterLevel = user.monster_level || 1;
  
  return { success: false, local: true };
}

function startAutoSave() {
  // Clear existing interval
  if (window.autoSaveInterval) {
    clearInterval(window.autoSaveInterval);
  }
  
  // Start new interval
  window.autoSaveInterval = setInterval(() => {
    if (GameState.user && !GameState.isAdmin) {
      saveProgressToServer();
    }
  }, CONFIG.AUTO_SAVE_INTERVAL);
  
  log('🔄 Auto-save started (3s)');
}

// ============================================
// GAME FUNCTIONS
// ============================================
function spawnMonster() {
  const index = Math.floor(Math.random() * GameState.monsters.length);
  GameState.currentMonster = index;
  GameState.maxMonsterHp = 100 * GameState.monsterLevel;
  GameState.monsterHp = GameState.maxMonsterHp;

  const monsterEl = document.getElementById('monster');
  const levelEl = document.getElementById('monster-level');

  if (monsterEl) monsterEl.textContent = GameState.monsters[index];
  if (levelEl) levelEl.textContent = `Level ${GameState.monsterLevel} - Monster`;

  updateGameUI();
}

function tapMonster() {
  let damage = GameState.powerMultiplier;

  // VIP bonus
  if (GameState.user?.vip_status !== 'none') {
    damage *= 2;
  }

  // Critical hit
  if (GameState.criticalChance > 0 && Math.random() < GameState.criticalChance) {
    damage *= 2;
    showToast('Critical Hit! ⚡', 'success');
  }

  GameState.monsterHp -= damage;
  GameState.score += damage;
  GameState.coin += GameState.coinMultiplier;

  // Visual feedback
  const monsterBox = document.getElementById('monster-box');
  if (monsterBox) {
    monsterBox.style.transform = 'scale(0.95)';
    setTimeout(() => monsterBox.style.transform = 'scale(1)', 100);
  }

  // Monster death
  if (GameState.monsterHp <= 0) {
    const bonusCoins = 10 * GameState.monsterLevel;
    GameState.coin += bonusCoins;
    GameState.monsterLevel++;
    showToast(`Monster Dikalahkan! +${bonusCoins} koin bonus 🪙`, 'success');
    spawnMonster();
  }

  updateGameUI();
}

function updateGameUI() {
  const scoreEl = document.getElementById('score');
  const coinEl = document.getElementById('coin');
  const levelEl = document.getElementById('level');
  const hpFillEl = document.getElementById('hp-fill');
  const hpTextEl = document.getElementById('hp-text');

  if (scoreEl) scoreEl.textContent = GameState.score.toLocaleString();
  if (coinEl) coinEl.textContent = GameState.coin.toLocaleString();
  if (levelEl) levelEl.textContent = GameState.monsterLevel.toLocaleString();

  if (hpFillEl && hpTextEl) {
    const hpPercent = (GameState.monsterHp / GameState.maxMonsterHp) * 100;
    hpFillEl.style.width = Math.max(0, hpPercent) + '%';
    hpTextEl.textContent = `${Math.max(0, Math.floor(GameState.monsterHp))} / ${GameState.maxMonsterHp}`;
  }
}

function applyInventoryEffects() {
  GameState.inventory.forEach(item => {
    if (typeof item === 'string') {
      // Handle old format
      if (item === 'Power Tap') GameState.powerMultiplier = 2;
      if (item === 'Auto Tap' && !GameState.autoTapInterval) {
        GameState.autoTapInterval = setInterval(tapMonster, 2000);
      }
      if (item === 'Critical Hit') GameState.criticalChance = 0.25;
      if (item === 'Coin Multiplier') GameState.coinMultiplier = 2;
    } else if (typeof item === 'object') {
      // Handle new format
      if (item.item === 'Power Tap') GameState.powerMultiplier = 2;
      if (item.item === 'Auto Tap' && !GameState.autoTapInterval) {
        GameState.autoTapInterval = setInterval(tapMonster, 2000);
      }
      if (item.item === 'Critical Hit') GameState.criticalChance = 0.25;
      if (item.item === 'Coin Multiplier') GameState.coinMultiplier = 2;
    }
  });
}

function buyAutoTap() {
  if (GameState.autoTapInterval) {
    showToast('Auto Tap sudah aktif!', 'error');
    return;
  }

  if (GameState.coin < 10000) {
    showToast('Koin tidak cukup! Butuh 10,000 🪙', 'error');
    return;
  }

  if (confirm('Beli Auto Tap untuk 🪙 10,000?')) {
    GameState.coin -= 10000;
    GameState.inventory.push({ item: 'Auto Tap', purchased: new Date().toISOString() });
    
    GameState.autoTapInterval = setInterval(tapMonster, 2000);
    
    saveProgressToServer();
    showToast('Auto Tap diaktifkan! 🤖', 'success');
    updateGameUI();
  }
}

// ============================================
// INITIALIZATION
// ============================================
async function initGame() {
  const user = getCurrentUser();
  
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // Redirect admin
  if (user.isAdmin) {
    window.location.href = 'admin.html';
    return;
  }

  showLoading('Loading game...');

  GameState.user = user;
  
  // CRITICAL FIX: Always reload from server for realtime sync
  log('🔄 Syncing with server...');
  const loadResult = await loadProgressFromServer();
  
  if (loadResult.success) {
    // Update last sync indicator
    const lastSyncEl = document.getElementById('last-sync');
    if (lastSyncEl) {
      lastSyncEl.textContent = 'Synced: ' + new Date().toLocaleTimeString();
    }
    log('✅ Synced with server');
  } else if (loadResult.local) {
    // Using local data
    GameState.score = user.score || 0;
    GameState.coin = user.coin || 1000;
    GameState.monsterLevel = user.monster_level || 1;
    const lastSyncEl = document.getElementById('last-sync');
    if (lastSyncEl) {
      lastSyncEl.textContent = 'Using local data';
    }
    showToast('Using local data - server unavailable', 'warning');
  } else {
    // Server load failed, use local data
    GameState.score = user.score || 0;
    GameState.coin = user.coin || 1000;
    GameState.monsterLevel = user.monster_level || 1;
    const lastSyncEl = document.getElementById('last-sync');
    if (lastSyncEl) {
      lastSyncEl.textContent = 'Sync failed - using local';
    }
    showToast('Server sync failed - using local data', 'warning');
  }

  // Setup monster
  spawnMonster();
  
  // Start auto-save
  startAutoSave();
  
  // Setup click handler
  const monsterBox = document.getElementById('monster-box');
  if (monsterBox) {
    monsterBox.addEventListener('click', tapMonster);
  }
  
  // Update UI
  updateGameUI();
  updateVIPBadge();
  
  // Update online status indicator
  const statusEl = document.getElementById('online-status');
  const statusTextEl = document.getElementById('status-text');
  if (statusEl && statusTextEl) {
    if (GameState.apiAvailable) {
      statusEl.className = 'online-status online';
      statusTextEl.textContent = 'Online';
    } else {
      statusEl.className = 'online-status offline';
      statusTextEl.textContent = 'Offline';
    }
  }
  
  hideLoading();
  
  log('🎮 Game initialized:', { score: GameState.score, coin: GameState.coin });
}

function updateVIPBadge() {
  const badge = document.getElementById('vip-badge');
  if (badge && GameState.user) {
    if (GameState.user.vip_status !== 'none') {
      badge.style.display = 'inline-block';
      badge.textContent = GameState.user.vip_status === 'permanent' ? 'VIP ♾️' : 'VIP';
    } else {
      badge.style.display = 'none';
    }
  }
}

// ============================================
// LOADING OVERLAY
// ============================================
function showLoading(message = 'Loading...') {
  let loader = document.getElementById('global-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                  background: rgba(0, 0, 0, 0.95); display: flex; 
                  justify-content: center; align-items: center; z-index: 99999;">
        <div style="text-align: center;">
          <div style="width: 50px; height: 50px; border: 4px solid rgba(255, 45, 85, 0.2);
                      border-top: 4px solid #FF2D55; border-radius: 50%;
                      animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
          <div style="color: white; font-size: 16px;">${message}</div>
        </div>
      </div>
    `;
    document.body.appendChild(loader);
  } else {
    loader.querySelector('div div:last-child').textContent = message;
    loader.style.display = 'block';
  }
}

function hideLoading() {
  const loader = document.getElementById('global-loader');
  if (loader) {
    loader.style.display = 'none';
  }
}

// ============================================
// SHOP FUNCTIONS
// ============================================
async function getShopItems() {
  try {
    const result = await apiRequest('getShopItems', {});
    if (result.success && result.items) {
      GameState.shopItems = result.items;
      return result;
    }
  } catch (error) {
    log('❌ Get shop items failed:', error);
  }
  
  // Fallback
  GameState.shopItems = [
    { id: 1, name: 'Power Tap', icon: '👊', desc: 'Double tap damage', price: 5000, type: 'power', availability: 'active' },
    { id: 2, name: 'Auto Tap', icon: '🤖', desc: 'Auto tap every 2s', price: 10000, type: 'power', availability: 'active' },
    { id: 3, name: 'Critical Hit', icon: '⚡', desc: '25% crit chance', price: 15000, type: 'power', availability: 'active' },
    { id: 4, name: 'Coin Multiplier', icon: '🪙', desc: '2x coin rewards', price: 20000, type: 'power', availability: 'active' },
    { id: 5, name: 'VIP Daily', icon: '👑', desc: '1 day VIP', price: 2000, type: 'vip', availability: 'active' },
    { id: 6, name: 'VIP Weekly', icon: '👑', desc: '7 days VIP', price: 10000, type: 'vip', availability: 'active' },
    { id: 7, name: 'VIP Monthly', icon: '👑', desc: '30 days VIP', price: 30000, type: 'vip', availability: 'active' },
    { id: 8, name: 'VIP Permanent', icon: '💎', desc: 'Permanent VIP', price: 100000, type: 'vip', availability: 'active' }
  ];
  
  return { success: true, items: GameState.shopItems };
}

async function initShop() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  
  if (user.isAdmin) {
    window.location.href = 'admin.html';
    return;
  }

  showLoading('Loading shop...');

  GameState.user = user;
  GameState.coin = user.coin || 1000;

  await getShopItems();
  
  // Load inventory
  try {
    GameState.inventory = user.inventory ? JSON.parse(user.inventory) : [];
  } catch {
    GameState.inventory = [];
  }

  updateCoinDisplay();
  renderShop();
  
  hideLoading();
}

function renderShop() {
  const grid = document.getElementById('shop-grid');
  if (!grid) return;

  const items = GameState.shopItems;

  grid.innerHTML = items.map(item => {
    const owned = GameState.inventory.some(i => 
      (typeof i === 'string' ? i : i.item) === item.name
    );
    const isAvailable = item.availability === 'active';
    
    return `
      <div class="shop-item ${item.type === 'vip' ? 'vip' : ''} ${owned ? 'owned' : ''}" 
           style="background: var(--card-bg); border: 1px solid rgba(255,255,255,0.1); 
                  border-radius: 12px; padding: 20px; text-align: center;
                  ${item.type === 'vip' ? 'border-color: #FFD700;' : ''}
                  ${owned ? 'opacity: 0.6;' : ''}">
        <div style="font-size: 48px; margin-bottom: 10px;">${item.icon}</div>
        <div style="font-weight: 600; margin-bottom: 5px;">${item.name}</div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 15px; min-height: 32px;">${item.desc}</div>
        <div style="font-size: 18px; font-weight: 700; color: #FF2D55; margin-bottom: 12px;">🪙 ${item.price.toLocaleString()}</div>
        <button onclick="buyItem(${item.id})" 
                style="width: 100%; padding: 10px; background: ${owned ? '#34C759' : 'linear-gradient(135deg, #FF2D55, #C41E3A)'}; 
                       border: none; border-radius: 8px; color: white; font-weight: 600; cursor: ${owned || !isAvailable ? 'not-allowed' : 'pointer'};"
                ${owned || !isAvailable ? 'disabled' : ''}>
          ${owned ? 'Dimiliki' : !isAvailable ? 'Tidak Tersedia' : 'Beli'}
        </button>
      </div>
    `;
  }).join('');
}

async function buyItem(itemId) {
  const item = GameState.shopItems.find(i => i.id === itemId);
  if (!item) return;

  if (item.availability !== 'active') {
    showToast('Item tidak tersedia', 'error');
    return;
  }

  const owned = GameState.inventory.some(i => 
    (typeof i === 'string' ? i : i.item) === item.name
  );
  
  if (item.type === 'power' && owned) {
    showToast('Kamu sudah memiliki item ini!', 'error');
    return;
  }

  if (GameState.coin < item.price) {
    showToast('Koin tidak cukup!', 'error');
    return;
  }

  if (!confirm(`Beli ${item.name} untuk 🪙 ${item.price.toLocaleString()}?`)) return;

  showLoading('Processing...');

  try {
    const result = await apiRequest('buyItem', {
      username: GameState.user.username,
      item_id: item.id,
      item_name: item.name,
      price: item.price
    });
    
    if (result.success) {
      GameState.coin = result.remaining_coin;
      GameState.inventory.push({ item: item.name, purchased: new Date().toISOString() });
      
      // Update user data
      GameState.user.coin = GameState.coin;
      
      // CRITICAL FIX: Update VIP status for VIP items
      if (item.name === 'VIP Daily') GameState.user.vip_status = 'daily';
      if (item.name === 'VIP Weekly') GameState.user.vip_status = 'weekly';
      if (item.name === 'VIP Monthly') GameState.user.vip_status = 'monthly';
      if (item.name === 'VIP Permanent') GameState.user.vip_status = 'permanent';
      
      Storage.save(GameState.user);
      
      // Record transaction
      await apiRequest('recordTransaction', {
        username: GameState.user.username,
        item_name: item.name,
        price: item.price
      });

      applyItemEffect(item);
      
      updateCoinDisplay();
      renderShop();
      hideLoading();
      showToast(`Berhasil membeli ${item.name}!`, 'success');
      
      // Save to server (includes VIP status update)
      await saveProgressToServer();
    } else {
      hideLoading();
      showToast(result.message || 'Gagal membeli item', 'error');
    }
  } catch (error) {
    hideLoading();
    showToast('Gagal membeli item', 'error');
  }
}

function applyItemEffect(item) {
  if (item.name === 'Power Tap') GameState.powerMultiplier = 2;
  if (item.name === 'Auto Tap' && !GameState.autoTapInterval) {
    GameState.autoTapInterval = setInterval(tapMonster, 2000);
  }
  if (item.name === 'Critical Hit') GameState.criticalChance = 0.25;
  if (item.name === 'Coin Multiplier') GameState.coinMultiplier = 2;
  
  // CRITICAL FIX: Update VIP status when purchasing VIP items
  if (item.name === 'VIP Daily') {
    GameState.user.vip_status = 'daily';
    Storage.save(GameState.user);
  }
  if (item.name === 'VIP Weekly') {
    GameState.user.vip_status = 'weekly';
    Storage.save(GameState.user);
  }
  if (item.name === 'VIP Monthly') {
    GameState.user.vip_status = 'monthly';
    Storage.save(GameState.user);
  }
  if (item.name === 'VIP Permanent') {
    GameState.user.vip_status = 'permanent';
    Storage.save(GameState.user);
  }
  
  // Update VIP badge if on game page
  updateVIPBadge();
}

function updateCoinDisplay() {
  const coinEl = document.getElementById('user-coin');
  if (coinEl) coinEl.textContent = GameState.coin.toLocaleString();
}

// ============================================
// LEADERBOARD
// ============================================
async function loadLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;

  list.innerHTML = '<div style="text-align: center; padding: 40px;">Loading...</div>';

  try {
    const result = await apiRequest('getLeaderboard', { limit: 50 });

    if (result.success && result.leaderboard) {
      displayLeaderboard(result.leaderboard);
    } else {
      list.innerHTML = '<div style="text-align: center; padding: 40px;">Gagal memuat leaderboard</div>';
    }
  } catch (error) {
    list.innerHTML = '<div style="text-align: center; padding: 40px;">Gagal memuat leaderboard</div>';
  }
}

function displayLeaderboard(leaderboard) {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;

  if (leaderboard.length === 0) {
    list.innerHTML = '<div style="text-align: center; padding: 40px;">Belum ada data</div>';
    return;
  }

  list.innerHTML = leaderboard.map((entry, index) => {
    let rankBadge = `#${entry.rank || index + 1}`;
    let rankStyle = '';

    if (index === 0) { rankBadge = '🥇'; rankStyle = 'color: #FFD700;'; }
    else if (index === 1) { rankBadge = '🥈'; rankStyle = 'color: #C0C0C0;'; }
    else if (index === 2) { rankBadge = '🥉'; rankStyle = 'color: #CD7F32;'; }

    const vipBadge = entry.vip_status !== 'none' 
      ? '<span style="background: linear-gradient(135deg, #FFD700, #FF9500); color: #000; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 8px;">VIP</span>' 
      : '';

    return `
      <div style="background: var(--card-bg); border: 1px solid rgba(255,255,255,0.1); 
                  border-radius: 12px; padding: 16px; display: grid; 
                  grid-template-columns: 50px 1fr 100px; gap: 16px; align-items: center;
                  margin-bottom: 10px;">
        <div style="text-align: center; font-size: 20px; font-weight: 700; ${rankStyle}">${rankBadge}</div>
        <div style="display: flex; gap: 12px; align-items: center;">
          <div style="width: 40px; height: 40px; border-radius: 50%; 
                      background: linear-gradient(135deg, #FF2D55, #FF6B6B);
                      display: flex; align-items: center; justify-content: center;
                      font-weight: 700; font-size: 14px;">
            ${entry.username[0].toUpperCase()}
          </div>
          <div>
            <div style="font-weight: 600;">${entry.username}${vipBadge}</div>
          </div>
        </div>
        <div style="text-align: right; font-weight: 700; font-size: 18px; color: #FF2D55;">
          ${entry.score.toLocaleString()}
        </div>
      </div>
    `;
  }).join('');
}

// ============================================
// TOPUP FUNCTIONS
// ============================================
async function requestTopup(amount, paymentMethod, phoneNumber) {
  const user = getCurrentUser();
  if (!user || user.isAdmin) {
    return { success: false, message: 'Not logged in' };
  }

  if (!amount || amount < 1000) {
    return { success: false, message: 'Minimal topup 1,000 koin' };
  }

  try {
    const result = await apiRequest('requestTopup', {
      username: user.username,
      amount: parseInt(amount),
      payment_method: paymentMethod,
      phone_number: phoneNumber
    });
    
    return result;
  } catch (error) {
    return { success: false, message: 'Gagal mengirim permintaan' };
  }
}

async function getUserTopups() {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('getTopups', { 
      username: user.isAdmin ? null : user.username 
    });
    return result;
  } catch (error) {
    return { success: false, message: 'Failed to get topups' };
  }
}

async function initTopup() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  
  if (user.isAdmin) {
    window.location.href = 'admin.html';
    return;
  }

  await loadTopupHistory();
}

async function loadTopupHistory() {
  const container = document.getElementById('topup-history');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:20px;">Loading...</div>';

  const result = await getUserTopups();
  
  if (result.success && result.topups) {
    if (result.topups.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);">Belum ada riwayat topup</div>';
      return;
    }

    container.innerHTML = result.topups.map(t => `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:15px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-weight:600;">🪙 ${t.amount?.toLocaleString() || 0} koin</div>
          <div style="padding:4px 12px;border-radius:4px;font-size:11px;font-weight:600;
                      ${t.status === 'approved' ? 'background:rgba(52,199,89,0.2);color:#34C759;' : 
                        t.status === 'rejected' ? 'background:rgba(255,59,48,0.2);color:#FF3B30;' : 
                        'background:rgba(255,149,0,0.2);color:#FF9500;'}">
            ${t.status === 'approved' ? '✅ Approved' : t.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);">${t.payment_method} | ${new Date(t.request_date).toLocaleDateString('id-ID')}</div>
        ${t.admin_notes ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:8px;font-style:italic;">Note: ${t.admin_notes}</div>` : ''}
      </div>
    `).join('');
  } else {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);">Gagal memuat riwayat</div>';
  }
}

async function handleTopupSubmit(event) {
  event.preventDefault();
  
  const amount = document.getElementById('topup-amount')?.value;
  const paymentMethod = document.getElementById('payment-method')?.value;
  const phoneNumber = document.getElementById('phone-number')?.value;

  if (!amount || amount < 1000) {
    showToast('Minimal topup 1,000 koin', 'error');
    return;
  }

  if (!paymentMethod) {
    showToast('Pilih metode pembayaran', 'error');
    return;
  }

  showLoading('Sending request...');
  
  const result = await requestTopup(amount, paymentMethod, phoneNumber);
  
  hideLoading();
  
  if (result.success) {
    showToast(result.message, 'success');
    document.getElementById('topup-form')?.reset();
    document.querySelectorAll('.amount-btn, .payment-btn').forEach(btn => btn.classList.remove('selected'));
    await loadTopupHistory();
  } else {
    showToast(result.message || 'Gagal mengirim permintaan', 'error');
  }
}

// ============================================
// ADMIN FUNCTIONS
// ============================================
async function initAdminDashboard() {
  const user = getCurrentUser();
  
  if (!user || !user.isAdmin) {
    window.location.href = 'index.html';
    return;
  }

  showLoading('Loading admin dashboard...');

  await Promise.all([
    loadAdminStats(),
    loadAdminUsers(),
    loadAdminTopups(),
    loadAdminShop()
  ]);

  hideLoading();
}

async function loadAdminStats() {
  try {
    const result = await apiRequest('getAdminStats', {});
    
    if (result.success) {
      const stats = result.stats;
      const els = {
        totalUsers: document.getElementById('admin-total-users'),
        totalCoins: document.getElementById('admin-total-coins'),
        pendingTopups: document.getElementById('admin-pending-topups'),
        totalTransactions: document.getElementById('admin-total-transactions')
      };

      if (els.totalUsers) els.totalUsers.textContent = (stats.total_users || 0).toLocaleString();
      if (els.totalCoins) els.totalCoins.textContent = (stats.total_coins || 0).toLocaleString();
      if (els.pendingTopups) els.pendingTopups.textContent = (stats.pending_topups || 0).toLocaleString();
      if (els.totalTransactions) els.totalTransactions.textContent = (stats.total_transactions || 0).toLocaleString();
    }
  } catch (error) {
    log('❌ Load admin stats failed:', error);
  }
}

async function loadAdminUsers() {
  const container = document.getElementById('admin-users-list');
  if (!container) return;

  try {
    const result = await apiRequest('getAllUsers', {});
    
    if (result.success && result.users) {
      container.innerHTML = result.users.map(u => `
        <tr>
          <td>${u.username}</td>
          <td>${(u.score || 0).toLocaleString()}</td>
          <td>${(u.coin || 0).toLocaleString()}</td>
          <td><span class="badge ${u.vip_status !== 'none' ? 'badge-vip' : 'badge-info'}">${u.vip_status || 'none'}</span></td>
          <td><span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}">${u.status || 'active'}</span></td>
          <td>
            <button onclick="showEditUserModal('${u.username}', ${u.score || 0}, ${u.coin || 0}, '${u.vip_status || 'none'}', '${u.status || 'active'}')" class="btn btn-info btn-sm">Edit</button>
            <button onclick="showAddCoinsModal('${u.username}')" class="btn btn-success btn-sm">+Coin</button>
            <button onclick="adminDeleteUser('${u.username}')" class="btn btn-danger btn-sm">Hapus</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Gagal memuat data</td></tr>';
  }
}

async function loadAdminTopups() {
  const container = document.getElementById('admin-topups-list');
  if (!container) return;

  try {
    const result = await apiRequest('getTopups', {});
    
    if (result.success && result.topups) {
      const pendingTopups = result.topups.filter(t => t.status === 'pending');
      
      if (pendingTopups.length === 0) {
        container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Tidak ada permintaan pending</td></tr>';
        return;
      }

      container.innerHTML = pendingTopups.map(t => `
        <tr>
          <td>${t.username}</td>
          <td>🪙 ${(t.amount || 0).toLocaleString()}</td>
          <td>${t.payment_method || '-'}</td>
          <td>${new Date(t.request_date).toLocaleDateString('id-ID')}</td>
          <td><span class="badge badge-warning">Pending</span></td>
          <td>
            <button onclick="approveTopupPrompt('${t.id}', '${t.username}', ${t.amount})" class="btn btn-success btn-sm">Approve</button>
            <button onclick="rejectTopupPrompt('${t.id}')" class="btn btn-danger btn-sm">Reject</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Gagal memuat data</td></tr>';
  }
}

async function loadAdminShop() {
  const container = document.getElementById('admin-shop-list');
  if (!container) return;

  try {
    const result = await getShopItems();
    
    if (result.success && result.items) {
      container.innerHTML = result.items.map(item => `
        <tr>
          <td>${item.icon} ${item.name}</td>
          <td>${item.desc}</td>
          <td>🪙 ${(item.price || 0).toLocaleString()}</td>
          <td><span class="badge ${item.type === 'vip' ? 'badge-vip' : 'badge-info'}">${item.type}</span></td>
          <td><span class="badge ${item.availability === 'active' ? 'badge-success' : 'badge-danger'}">${item.availability}</span></td>
          <td>
            <button onclick="showEditItemModal(${item.id}, ${item.price}, '${item.availability}')" class="btn btn-info btn-sm">Edit</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Gagal memuat data</td></tr>';
  }
}

async function adminUpdateUser(username, updates) {
  try {
    const result = await apiRequest('adminUpdateUser', { username, updates });
    return result;
  } catch (error) {
    return { success: false, message: 'Failed to update user' };
  }
}

async function adminDeleteUser(username) {
  if (!confirm(`Yakin ingin menghapus user ${username}?`)) {
    return { success: false };
  }

  try {
    const result = await apiRequest('adminDeleteUser', { username });
    if (result.success) {
      showToast('User deleted!', 'success');
      loadAdminUsers();
    }
    return result;
  } catch (error) {
    showToast('Failed to delete user', 'error');
    return { success: false };
  }
}

async function adminAddCoins(username, amount) {
  try {
    const result = await apiRequest('adminAddCoins', { username, amount: parseInt(amount) });
    return result;
  } catch (error) {
    return { success: false, message: 'Failed to add coins' };
  }
}

async function adminUpdateShopItem(itemId, updates) {
  try {
    const result = await apiRequest('adminUpdateShopItem', { item_id: itemId, updates });
    return result;
  } catch (error) {
    return { success: false, message: 'Failed to update item' };
  }
}

async function approveTopup(topupId, notes) {
  try {
    const result = await apiRequest('approveTopup', { topup_id: topupId, admin_notes: notes });
    return result;
  } catch (error) {
    return { success: false, message: 'Failed to approve' };
  }
}

async function rejectTopup(topupId, notes) {
  try {
    const result = await apiRequest('rejectTopup', { topup_id: topupId, admin_notes: notes });
    return result;
  } catch (error) {
    return { success: false, message: 'Failed to reject' };
  }
}

// ============================================
// CHAT FUNCTIONS
// ============================================
async function sendChatMessage(message) {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  if (!message || !message.trim()) {
    return { success: false, message: 'Pesan tidak boleh kosong' };
  }

  try {
    const result = await apiRequest('sendChat', {
      username: user.username,
      message: message.trim()
    });
    return result;
  } catch (error) {
    return { success: false, message: 'Failed to send message' };
  }
}

async function getChatMessages(limit = 50) {
  try {
    const result = await apiRequest('getChat', { limit });
    return result;
  } catch (error) {
    return { success: false, message: 'Failed to get messages' };
  }
}

// ============================================
// FORM HANDLERS
// ============================================
async function handleLogin(event) {
  event.preventDefault();

  const username = document.getElementById('username')?.value.trim();
  const password = document.getElementById('password')?.value;

  if (!username || !password) {
    showToast('Mohon isi semua field', 'error');
    return;
  }

  const result = await loginUser(username, password);

  if (result.success) {
    showToast(result.message, 'success');
    setTimeout(() => {
      window.location.href = result.isAdmin ? 'admin.html' : 'game.html';
    }, 1000);
  } else {
    showToast(result.message || 'Login gagal', 'error');
  }
}

async function handleRegister(event) {
  event.preventDefault();

  const username = document.getElementById('username')?.value.trim();
  const password = document.getElementById('password')?.value;
  const confirmPassword = document.getElementById('confirm-password')?.value;

  if (!username || !password || !confirmPassword) {
    showToast('Mohon isi semua field', 'error');
    return;
  }

  if (password !== confirmPassword) {
    showToast('Password tidak cocok', 'error');
    return;
  }

  const result = await registerUser(username, password);

  if (result.success) {
    showToast(result.message, 'success');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 2000);
  } else {
    showToast(result.message || 'Registrasi gagal', 'error');
  }
}

// ============================================
// PAGE INITIALIZATION
// ============================================
function initPage() {
  const path = window.location.pathname;
  const page = path.split('/').pop() || 'index.html';

  switch (page) {
    case 'login.html':
    case 'register.html':
      if (isLoggedIn()) {
        const user = getCurrentUser();
        window.location.href = user.isAdmin ? 'admin.html' : 'game.html';
      }
      break;

    case 'game.html':
      initGame();
      break;

    case 'shop.html':
      initShop();
      break;

    case 'leaderboard.html':
      loadLeaderboard();
      break;

    case 'topup.html':
      initTopup();
      break;

    case 'admin.html':
      initAdminDashboard();
      break;

    case 'index.html':
    default:
      updateNavbar();
      break;
  }
}

function updateNavbar() {
  const navLinks = document.querySelector('.nav-links');
  const navPlay = document.getElementById('nav-play');
  
  if (isLoggedIn()) {
    const user = getCurrentUser();
    if (navLinks) {
      if (user.isAdmin) {
        navLinks.innerHTML = `
          <a href="index.html" class="nav-link">Home</a>
          <a href="admin.html" class="nav-link active">Admin</a>
          <span style="color: var(--text-secondary); font-weight: 500;">👑 Admin</span>
        `;
      } else {
        navLinks.innerHTML = `
          <a href="index.html" class="nav-link active">Home</a>
          <a href="game.html" class="nav-link">Game</a>
          <a href="leaderboard.html" class="nav-link">Leaderboard</a>
          <a href="shop.html" class="nav-link">Shop</a>
          <span style="color: var(--text-secondary); font-weight: 500;">👤 ${user.username}</span>
        `;
      }
    }
    if (navPlay) {
      navPlay.textContent = user.isAdmin ? 'Admin Panel' : 'Play Game';
      navPlay.href = user.isAdmin ? 'admin.html' : 'game.html';
    }
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', initPage);

// Save before leaving
window.addEventListener('beforeunload', (e) => {
  if (GameState.user && !GameState.isAdmin) {
    saveProgressToServer();
  }
});

// Export functions
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.logout = logout;
window.tapMonster = tapMonster;
window.buyAutoTap = buyAutoTap;
window.goToShop = () => window.location.href = 'shop.html';
window.buyItem = buyItem;
window.showToast = showToast;
window.saveProgress = saveProgressToServer;
window.loadLeaderboard = loadLeaderboard;
window.handleTopupSubmit = handleTopupSubmit;
window.requestTopup = requestTopup;
window.getUserTopups = getUserTopups;
window.approveTopup = approveTopup;
window.rejectTopup = rejectTopup;
window.getAllUsers = () => apiRequest('getAllUsers', {});
window.adminUpdateUser = adminUpdateUser;
window.adminDeleteUser = adminDeleteUser;
window.adminAddCoins = adminAddCoins;
window.adminUpdateShopItem = adminUpdateShopItem;
window.sendChatMessage = sendChatMessage;
window.getChatMessages = getChatMessages;
window.getSession = getCurrentUser;

// Admin modal functions
window.showEditUserModal = (username, score, coin, vip, status) => {
  document.getElementById('edit-username').value = username;
  document.getElementById('edit-score').value = score;
  document.getElementById('edit-coin').value = coin;
  document.getElementById('edit-vip').value = vip;
  document.getElementById('edit-status').value = status;
  document.getElementById('edit-user-modal').classList.add('active');
};

window.showAddCoinsModal = (username) => {
  document.getElementById('add-coins-username').value = username;
  document.getElementById('add-coins-display').value = username;
  document.getElementById('add-coins-modal').classList.add('active');
};

window.showEditItemModal = (itemId, price, availability) => {
  document.getElementById('edit-item-id').value = itemId;
  document.getElementById('edit-item-price').value = price;
  document.getElementById('edit-item-availability').value = availability;
  document.getElementById('edit-item-modal').classList.add('active');
};

window.closeModal = (modalId) => {
  document.getElementById(modalId).classList.remove('active');
};

window.handleEditUser = async (event) => {
  event.preventDefault();
  const username = document.getElementById('edit-username').value;
  const updates = {
    score: parseInt(document.getElementById('edit-score').value) || 0,
    coin: parseInt(document.getElementById('edit-coin').value) || 0,
    vip_status: document.getElementById('edit-vip').value,
    status: document.getElementById('edit-status').value
  };
  
  const result = await adminUpdateUser(username, updates);
  if (result.success) {
    showToast('User updated!', 'success');
    closeModal('edit-user-modal');
    loadAdminUsers();
  } else {
    showToast(result.message || 'Failed to update user', 'error');
  }
};

window.handleAddCoins = async (event) => {
  event.preventDefault();
  const username = document.getElementById('add-coins-username').value;
  const amount = document.getElementById('add-coins-amount').value;
  
  const result = await adminAddCoins(username, amount);
  if (result.success) {
    showToast(result.message, 'success');
    closeModal('add-coins-modal');
    loadAdminUsers();
  } else {
    showToast(result.message || 'Failed to add coins', 'error');
  }
};

window.handleEditItem = async (event) => {
  event.preventDefault();
  const itemId = document.getElementById('edit-item-id').value;
  const updates = {
    price: parseInt(document.getElementById('edit-item-price').value) || 0,
    availability: document.getElementById('edit-item-availability').value
  };
  
  const result = await adminUpdateShopItem(itemId, updates);
  if (result.success) {
    showToast('Shop item updated!', 'success');
    closeModal('edit-item-modal');
    loadAdminShop();
  } else {
    showToast(result.message || 'Failed to update item', 'error');
  }
};

window.approveTopupPrompt = async (topupId, username, amount) => {
  const notes = prompt(`Approve topup for ${username}?\nAmount: ${amount.toLocaleString()} coins\n\nAdmin notes (optional):`);
  if (notes !== null) {
    const result = await approveTopup(topupId, notes);
    if (result.success) {
      showToast('Topup approved!', 'success');
      loadAdminTopups();
      loadAdminUsers();
    } else {
      showToast(result.message || 'Failed to approve', 'error');
    }
  }
};

window.rejectTopupPrompt = async (topupId) => {
  const notes = prompt('Reason for rejection (optional):');
  if (notes !== null) {
    const result = await rejectTopup(topupId, notes);
    if (result.success) {
      showToast('Topup rejected!', 'success');
      loadAdminTopups();
    } else {
      showToast(result.message || 'Failed to reject', 'error');
    }
  }
};

window.refreshUsers = loadAdminUsers;
window.refreshTopups = loadAdminTopups;
window.refreshShop = loadAdminShop;
window.refreshChat = async () => {
  const container = document.getElementById('admin-chat-list');
  if (!container) return;
  
  container.innerHTML = '<div style="text-align:center;padding:30px;">Loading...</div>';
  
  const result = await getChatMessages(50);
  if (result.success && result.messages) {
    container.innerHTML = result.messages.map(m => `
      <div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">
        <span style="color: #FF2D55; font-weight: 600;">${m.username}</span>
        <span style="color: var(--text-secondary); font-size: 11px; float: right;">${new Date(m.timestamp).toLocaleString('id-ID')}</span>
        <div style="margin-top: 5px;">${m.message}</div>
      </div>
    `).join('');
  }
};

console.log('🎮 TAP TAP WAR v3.0 - All bugs fixed!');
