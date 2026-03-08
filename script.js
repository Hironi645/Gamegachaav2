/**
 * TAP TAP WAR - Full Google Sheets Database Integration v2.0
 * Fixed: Persistent Login, Auto-Save, Admin Dashboard
 * 
 * Database Structure:
 * - Users: ID, Username, Password, Email, Score, Coin, VIP_Status, VIP_Expired, Registered_Date, Last_Login, Status, Monster_Level, Inventory
 * - Leaderboard: Rank, Username, Score, VIP_Status, Last_Updated
 * - Transactions: ID, Username, Item_Name, Price, Transaction_Date, Type, Status
 * - TopupRequests: ID, Username, Amount, Payment_Method, Status, Request_Date, Admin_Notes, Processed_Date
 * - ShopItems: ID, Item_Name, Icon, Description, Price, Type, Availability
 * - Chat: ID, Username, Message, Timestamp, Status
 */

// ============================================
// CONFIGURATION - UPDATE THIS WITH YOUR URL
// ============================================
const CONFIG = {
  // GANTI URL INI DENGAN URL GOOGLE APPS SCRIPT ANDA
  API_URL: 'https://script.google.com/macros/s/AKfycbw1a38Z3D5Xe0qjn_l3oMMk1CkE5kXBg3c3omNhDDq-ceNWreWZRVd_fCg5pot5Gj6-/exec',
  
  // Admin credentials
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'admin123',
  
  // Storage keys
  USER_KEY: 'ttw_user_data',
  SESSION_KEY: 'ttw_session_active',
  LAST_SYNC_KEY: 'ttw_last_sync',
  
  // Intervals (in milliseconds)
  AUTO_SAVE_INTERVAL: 3000,        // 3 seconds - lebih cepat
  LEADERBOARD_REFRESH_INTERVAL: 15000,  // 15 seconds
  CHAT_REFRESH_INTERVAL: 8000,     // 8 seconds
  
  // Retry settings
  MAX_RETRY_ATTEMPTS: 5,
  RETRY_DELAY: 1000,
  
  // Debug mode
  DEBUG: true
};

// ============================================
// GAME STATE - Realtime State Management
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
  isOnline: false,
  lastSync: null,
  apiAvailable: false,
  isLoading: false,
  autoSaveTimer: null,
  shopItems: []
};

// ============================================
// LOADING SCREEN MANAGEMENT
// ============================================
const LoadingManager = {
  show(message = 'Loading...', subMessage = '') {
    let loader = document.getElementById('global-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'global-loader';
      loader.innerHTML = `
        <div class="loader-overlay">
          <div class="loader-content">
            <div class="loader-spinner"></div>
            <div class="loader-message">${message}</div>
            <div class="loader-submessage">${subMessage}</div>
            <div class="loader-status" id="loader-status">Connecting...</div>
          </div>
        </div>
      `;
      document.body.appendChild(loader);
      
      if (!document.getElementById('loader-styles')) {
        const style = document.createElement('style');
        style.id = 'loader-styles';
        style.textContent = `
          #global-loader {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 999999;
          }
          .loader-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            display: flex;
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(10px);
          }
          .loader-content {
            text-align: center;
            padding: 40px;
          }
          .loader-spinner {
            width: 60px;
            height: 60px;
            border: 4px solid rgba(255, 45, 85, 0.2);
            border-top: 4px solid #FF2D55;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 20px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .loader-message {
            font-size: 24px;
            font-weight: 700;
            color: #fff;
            margin-bottom: 8px;
          }
          .loader-submessage {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 15px;
          }
          .loader-status {
            font-size: 12px;
            color: #FF2D55;
          }
          .loader-error { color: #FF3B30 !important; }
          .loader-success { color: #34C759 !important; }
          .loader-retry-btn {
            margin-top: 15px;
            padding: 10px 25px;
            background: linear-gradient(135deg, #FF2D55, #C41E3A);
            border: none;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            cursor: pointer;
          }
        `;
        document.head.appendChild(style);
      }
    } else {
      const msgEl = loader.querySelector('.loader-message');
      const subEl = loader.querySelector('.loader-submessage');
      if (msgEl) msgEl.textContent = message;
      if (subEl) subEl.textContent = subMessage;
      loader.style.display = 'block';
      loader.style.opacity = '1';
    }
    GameState.isLoading = true;
  },
  
  updateStatus(status, type = 'normal') {
    const statusEl = document.getElementById('loader-status');
    if (statusEl) {
      statusEl.textContent = status;
      statusEl.className = 'loader-status';
      if (type === 'error') statusEl.classList.add('loader-error');
      if (type === 'success') statusEl.classList.add('loader-success');
    }
  },
  
  hide() {
    const loader = document.getElementById('global-loader');
    if (loader) {
      loader.style.opacity = '0';
      loader.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        loader.style.display = 'none';
      }, 300);
    }
    GameState.isLoading = false;
  },
  
  showError(message, onRetry) {
    this.updateStatus(message, 'error');
    const content = document.querySelector('.loader-content');
    if (content && !document.getElementById('retry-btn')) {
      const retryBtn = document.createElement('button');
      retryBtn.id = 'retry-btn';
      retryBtn.className = 'loader-retry-btn';
      retryBtn.textContent = '🔄 Retry';
      retryBtn.onclick = () => {
        retryBtn.remove();
        if (onRetry) onRetry();
      };
      content.appendChild(retryBtn);
    }
  }
};

// ============================================
// LOCAL STORAGE - Persistent Session
// ============================================
const Storage = {
  saveUser(user) {
    try {
      const data = {
        user: user,
        timestamp: Date.now(),
        isActive: true
      };
      localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data));
      localStorage.setItem(CONFIG.SESSION_KEY, 'true');
      log('💾 User saved to localStorage');
    } catch (e) {
      log('❌ Failed to save user:', e);
    }
  },
  
  getUser() {
    try {
      const data = localStorage.getItem(CONFIG.USER_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // Check if session is still valid (7 days)
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        if (Date.now() - parsed.timestamp < maxAge) {
          return parsed.user;
        } else {
          this.clear();
        }
      }
    } catch (e) {
      log('❌ Failed to get user:', e);
    }
    return null;
  },
  
  isSessionActive() {
    return localStorage.getItem(CONFIG.SESSION_KEY) === 'true';
  },
  
  clear() {
    try {
      localStorage.removeItem(CONFIG.USER_KEY);
      localStorage.removeItem(CONFIG.SESSION_KEY);
      localStorage.removeItem(CONFIG.LAST_SYNC_KEY);
      log('🗑️ Storage cleared');
    } catch (e) {
      log('❌ Failed to clear storage:', e);
    }
  },
  
  updateUserField(field, value) {
    try {
      const user = this.getUser();
      if (user) {
        user[field] = value;
        user.last_updated = Date.now();
        this.saveUser(user);
      }
    } catch (e) {
      log('❌ Failed to update field:', e);
    }
  }
};

// ============================================
// API FUNCTIONS - Google Sheets Integration
// ============================================
async function apiRequest(action, data = {}, retryCount = 0) {
  if (CONFIG.API_URL.includes('YOUR_SCRIPT_ID') || CONFIG.API_URL.includes('AKfycbw1a38')) {
    throw new Error('API_URL_NOT_CONFIGURED');
  }

  try {
    const requestData = {
      action: action,
      timestamp: new Date().toISOString(),
      ...data
    };

    log('📤 API Request:', action);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(requestData),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    log('📥 API Response:', action, result.success);
    
    return result;
    
  } catch (error) {
    if (error.name === 'AbortError') {
      log('⏱️ Request timeout');
    }
    
    if (retryCount < CONFIG.MAX_RETRY_ATTEMPTS) {
      log(`🔄 Retry ${retryCount + 1}/${CONFIG.MAX_RETRY_ATTEMPTS}`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
      return apiRequest(action, data, retryCount + 1);
    }
    
    throw error;
  }
}

async function checkApiConnection() {
  try {
    const result = await apiRequest('ping', {});
    GameState.apiAvailable = result.success;
    GameState.isOnline = result.success;
    return result.success;
  } catch (error) {
    GameState.apiAvailable = false;
    GameState.isOnline = false;
    return false;
  }
}

// ============================================
// USER AUTHENTICATION
// ============================================
async function registerUser(username, password, email = '') {
  if (!username || username.length < 3) {
    return { success: false, message: 'Username minimal 3 karakter' };
  }
  
  if (!password || password.length < 6) {
    return { success: false, message: 'Password minimal 6 karakter' };
  }

  try {
    LoadingManager.show('Creating Account...', 'Please wait');
    
    const result = await apiRequest('register', { username, password, email });

    if (result.success) {
      Storage.saveUser(result.user);
      GameState.user = result.user;
      GameState.score = result.user.score || 0;
      GameState.coin = result.user.coin || 1000;
      GameState.apiAvailable = true;
      
      LoadingManager.hide();
      return { success: true, user: result.user, message: 'Registrasi berhasil!' };
    } else {
      LoadingManager.hide();
      return { success: false, message: result.message || 'Registrasi gagal' };
    }
  } catch (error) {
    LoadingManager.hide();
    log('❌ Registration error:', error);
    
    if (error.message === 'API_URL_NOT_CONFIGURED') {
      return { success: false, message: 'API URL belum dikonfigurasi. Silakan setup Google Sheets terlebih dahulu.' };
    }
    
    return { success: false, message: 'Gagal terhubung ke database. Periksa koneksi internet.' };
  }
}

async function loginUser(username, password) {
  if (!username || !password) {
    return { success: false, message: 'Username dan password wajib diisi' };
  }

  // Check admin login
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
    Storage.saveUser(adminUser);
    GameState.user = adminUser;
    GameState.isAdmin = true;
    return { success: true, user: adminUser, message: 'Login sebagai Admin!', isAdmin: true };
  }

  try {
    LoadingManager.show('Logging In...', 'Verifying credentials');
    
    const result = await apiRequest('login', { username, password });

    if (result.success && result.user) {
      Storage.saveUser(result.user);
      GameState.user = result.user;
      GameState.isAdmin = false;
      GameState.score = result.user.score || 0;
      GameState.coin = result.user.coin || 1000;
      GameState.monsterLevel = result.user.monster_level || 1;
      GameState.inventory = result.user.inventory ? JSON.parse(result.user.inventory) : [];
      GameState.apiAvailable = true;
      GameState.isOnline = true;
      
      applyInventoryEffects();
      
      LoadingManager.hide();
      return { success: true, user: result.user, message: 'Login berhasil!' };
    } else {
      LoadingManager.hide();
      return { success: false, message: result.message || 'Login gagal' };
    }
  } catch (error) {
    LoadingManager.hide();
    log('❌ Login error:', error);
    
    if (error.message === 'API_URL_NOT_CONFIGURED') {
      return { success: false, message: 'API URL belum dikonfigurasi.' };
    }
    
    return { success: false, message: 'Gagal terhubung ke database.' };
  }
}

async function logout() {
  if (confirm('Yakin ingin logout?')) {
    // Final save
    if (GameState.user && !GameState.isAdmin) {
      try {
        await saveProgress(true);
      } catch (e) {
        log('Final save failed:', e);
      }
    }
    
    // Stop auto-tap
    if (GameState.autoTapInterval) {
      clearInterval(GameState.autoTapInterval);
      GameState.autoTapInterval = null;
    }
    
    // Clear auto-save
    if (GameState.autoSaveTimer) {
      clearInterval(GameState.autoSaveTimer);
    }
    
    // Clear storage
    Storage.clear();
    
    // Reset state
    GameState.user = null;
    GameState.isAdmin = false;
    GameState.score = 0;
    GameState.coin = 0;
    GameState.inventory = [];
    
    window.location.href = 'index.html';
  }
}

function getCurrentUser() {
  if (GameState.user) return GameState.user;
  GameState.user = Storage.getUser();
  if (GameState.user) {
    GameState.isAdmin = GameState.user.isAdmin || false;
  }
  return GameState.user;
}

function isLoggedIn() {
  return getCurrentUser() !== null && Storage.isSessionActive();
}

function isAdmin() {
  const user = getCurrentUser();
  return user && user.isAdmin === true;
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function requireAdmin() {
  if (!isLoggedIn() || !isAdmin()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

// ============================================
// GAME PROGRESS - Auto Save
// ============================================
async function saveProgress(immediate = false) {
  const user = getCurrentUser();
  if (!user || GameState.isAdmin) return { success: false, message: 'Not logged in' };

  const data = {
    username: user.username,
    score: GameState.score,
    coin: GameState.coin,
    monster_level: GameState.monsterLevel,
    vip_status: user.vip_status,
    inventory: JSON.stringify(GameState.inventory)
  };

  // Update local storage immediately
  user.score = GameState.score;
  user.coin = GameState.coin;
  user.monster_level = GameState.monsterLevel;
  Storage.saveUser(user);

  // Try to save to API
  try {
    const result = await apiRequest('saveProgress', data);
    
    if (result.success) {
      GameState.apiAvailable = true;
      GameState.lastSync = new Date().toISOString();
      localStorage.setItem(CONFIG.LAST_SYNC_KEY, GameState.lastSync);
      log('💾 Progress saved to cloud');
      return { success: true, message: 'Progress saved!' };
    }
  } catch (error) {
    log('❌ Cloud save failed:', error);
  }

  return { success: true, local: true, message: 'Progress saved locally' };
}

async function loadProgress() {
  const user = getCurrentUser();
  if (!user || GameState.isAdmin) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('getUserData', { username: user.username });

    if (result.success && result.data) {
      const serverData = result.data;
      
      // Use server data (it's the source of truth)
      GameState.score = serverData.score || 0;
      GameState.coin = serverData.coin || 1000;
      GameState.monsterLevel = serverData.monster_level || 1;
      GameState.inventory = serverData.inventory ? JSON.parse(serverData.inventory) : [];
      GameState.apiAvailable = true;
      GameState.lastSync = new Date().toISOString();
      
      // Update local storage
      user.score = GameState.score;
      user.coin = GameState.coin;
      user.monster_level = GameState.monsterLevel;
      Storage.saveUser(user);
      
      applyInventoryEffects();
      
      log('📥 Data loaded from server');
      return { success: true, data: serverData };
    }
  } catch (error) {
    log('❌ Load progress error:', error);
  }

  // Fallback to local data
  GameState.score = user.score || 0;
  GameState.coin = user.coin || 1000;
  GameState.monsterLevel = user.monster_level || 1;
  
  return { success: true, local: true, data: user };
}

function startAutoSave() {
  // Clear existing timer
  if (GameState.autoSaveTimer) {
    clearInterval(GameState.autoSaveTimer);
  }
  
  // Start new auto-save
  GameState.autoSaveTimer = setInterval(() => {
    if (GameState.user && !GameState.isAdmin) {
      saveProgress();
    }
  }, CONFIG.AUTO_SAVE_INTERVAL);
  
  log('🔄 Auto-save started');
}

// ============================================
// LEADERBOARD
// ============================================
async function getLeaderboard(limit = 50) {
  try {
    const result = await apiRequest('getLeaderboard', { limit });

    if (result.success && result.leaderboard) {
      GameState.apiAvailable = true;
      return { 
        success: true, 
        leaderboard: result.leaderboard,
        lastUpdated: result.lastUpdated 
      };
    }
  } catch (error) {
    log('❌ Get leaderboard error:', error);
  }

  return { success: false, message: 'Failed to load leaderboard' };
}

async function updateLeaderboard() {
  const user = getCurrentUser();
  if (!user || GameState.isAdmin) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('updateLeaderboard', {
      username: user.username,
      score: GameState.score,
      vip_status: user.vip_status
    });

    if (result.success) {
      GameState.apiAvailable = true;
      return result;
    }
  } catch (error) {
    log('❌ Update leaderboard error:', error);
  }

  return { success: false, message: 'Failed to update leaderboard' };
}

// ============================================
// SHOP & TRANSACTIONS
// ============================================
async function getShopItems() {
  try {
    const result = await apiRequest('getShopItems', {});
    if (result.success && result.items) {
      GameState.shopItems = result.items;
      return { success: true, items: result.items };
    }
  } catch (error) {
    log('❌ Get shop items error:', error);
  }
  
  // Fallback default items
  const defaultItems = [
    { id: 1, name: 'Power Tap', icon: '👊', desc: 'Double tap damage', price: 5000, type: 'power', availability: 'active' },
    { id: 2, name: 'Auto Tap', icon: '🤖', desc: 'Auto tap every 2s', price: 10000, type: 'power', availability: 'active' },
    { id: 3, name: 'Critical Hit', icon: '⚡', desc: '25% crit chance', price: 15000, type: 'power', availability: 'active' },
    { id: 4, name: 'Coin Multiplier', icon: '🪙', desc: '2x coin rewards', price: 20000, type: 'power', availability: 'active' },
    { id: 5, name: 'VIP Daily', icon: '👑', desc: '1 day VIP', price: 2000, type: 'vip', availability: 'active' },
    { id: 6, name: 'VIP Weekly', icon: '👑', desc: '7 days VIP', price: 10000, type: 'vip', availability: 'active' },
    { id: 7, name: 'VIP Monthly', icon: '👑', desc: '30 days VIP', price: 30000, type: 'vip', availability: 'active' },
    { id: 8, name: 'VIP Permanent', icon: '💎', desc: 'Permanent VIP', price: 100000, type: 'vip', availability: 'active' }
  ];
  GameState.shopItems = defaultItems;
  return { success: true, items: defaultItems };
}

async function recordTransaction(item) {
  const user = getCurrentUser();
  if (!user || GameState.isAdmin) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('recordTransaction', {
      username: user.username,
      item_name: item.name,
      price: item.price,
      type: 'purchase'
    });
    
    if (result.success) {
      return result;
    }
  } catch (error) {
    log('❌ Record transaction error:', error);
  }

  return { success: false, message: 'Failed to record transaction' };
}

async function buyItemFromServer(itemId, itemName, price) {
  const user = getCurrentUser();
  if (!user || GameState.isAdmin) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('buyItem', {
      username: user.username,
      item_id: itemId,
      item_name: itemName,
      price: price
    });
    
    if (result.success) {
      GameState.coin = result.remaining_coin;
      return result;
    }
  } catch (error) {
    log('❌ Buy item error:', error);
  }

  return { success: false, message: 'Failed to buy item' };
}

// ============================================
// TOPUP SYSTEM
// ============================================
async function requestTopup(amount, paymentMethod, phoneNumber = '') {
  const user = getCurrentUser();
  if (!user || GameState.isAdmin) return { success: false, message: 'Not logged in' };

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
    
    if (result.success) {
      return { success: true, message: 'Permintaan topup dikirim! Tunggu approval admin.', topupId: result.topupId };
    }
  } catch (error) {
    log('❌ Request topup error:', error);
  }

  return { success: false, message: 'Gagal mengirim permintaan topup' };
}

async function getUserTopups() {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('getTopups', { 
      username: GameState.isAdmin ? null : user.username 
    });
    if (result.success) {
      return result;
    }
  } catch (error) {
    log('❌ Get topups error:', error);
  }

  return { success: false, message: 'Failed to get topups' };
}

async function approveTopup(topupId, notes = '') {
  if (!isAdmin()) return { success: false, message: 'Unauthorized' };

  try {
    const result = await apiRequest('approveTopup', {
      topup_id: topupId,
      admin_notes: notes
    });
    
    if (result.success) {
      return { success: true, message: 'Topup approved!' };
    }
  } catch (error) {
    log('❌ Approve topup error:', error);
  }

  return { success: false, message: 'Failed to approve topup' };
}

async function rejectTopup(topupId, notes = '') {
  if (!isAdmin()) return { success: false, message: 'Unauthorized' };

  try {
    const result = await apiRequest('rejectTopup', {
      topup_id: topupId,
      admin_notes: notes
    });
    
    if (result.success) {
      return { success: true, message: 'Topup rejected!' };
    }
  } catch (error) {
    log('❌ Reject topup error:', error);
  }

  return { success: false, message: 'Failed to reject topup' };
}

// ============================================
// ADMIN FUNCTIONS
// ============================================
async function getAllUsers() {
  if (!isAdmin()) return { success: false, message: 'Unauthorized' };

  try {
    const result = await apiRequest('getAllUsers', {});
    if (result.success) {
      return result;
    }
  } catch (error) {
    log('❌ Get all users error:', error);
  }

  return { success: false, message: 'Failed to get users' };
}

async function adminUpdateUser(username, updates) {
  if (!isAdmin()) return { success: false, message: 'Unauthorized' };

  try {
    const result = await apiRequest('adminUpdateUser', {
      username: username,
      updates: updates
    });
    
    if (result.success) {
      return { success: true, message: 'User updated!' };
    }
  } catch (error) {
    log('❌ Admin update user error:', error);
  }

  return { success: false, message: 'Failed to update user' };
}

async function adminDeleteUser(username) {
  if (!isAdmin()) return { success: false, message: 'Unauthorized' };

  if (!confirm(`Yakin ingin menghapus user ${username}?`)) {
    return { success: false, message: 'Cancelled' };
  }

  try {
    const result = await apiRequest('adminDeleteUser', { username });
    
    if (result.success) {
      return { success: true, message: 'User deleted!' };
    }
  } catch (error) {
    log('❌ Admin delete user error:', error);
  }

  return { success: false, message: 'Failed to delete user' };
}

async function adminAddCoins(username, amount) {
  if (!isAdmin()) return { success: false, message: 'Unauthorized' };

  try {
    const result = await apiRequest('adminAddCoins', {
      username: username,
      amount: parseInt(amount)
    });
    
    if (result.success) {
      return { success: true, message: `Added ${amount} coins to ${username}!` };
    }
  } catch (error) {
    log('❌ Admin add coins error:', error);
  }

  return { success: false, message: 'Failed to add coins' };
}

async function adminUpdateShopItem(itemId, updates) {
  if (!isAdmin()) return { success: false, message: 'Unauthorized' };

  try {
    const result = await apiRequest('adminUpdateShopItem', {
      item_id: itemId,
      updates: updates
    });
    
    if (result.success) {
      return { success: true, message: 'Shop item updated!' };
    }
  } catch (error) {
    log('❌ Admin update shop item error:', error);
  }

  return { success: false, message: 'Failed to update shop item' };
}

// ============================================
// CHAT SYSTEM
// ============================================
async function sendChatMessage(message) {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  if (!message || message.trim().length === 0) {
    return { success: false, message: 'Pesan tidak boleh kosong' };
  }

  try {
    const result = await apiRequest('sendChat', {
      username: user.username,
      message: message.trim()
    });
    
    if (result.success) {
      return result;
    }
  } catch (error) {
    log('❌ Send chat error:', error);
  }

  return { success: false, message: 'Failed to send message' };
}

async function getChatMessages(limit = 50) {
  try {
    const result = await apiRequest('getChat', { limit });
    if (result.success && result.messages) {
      return result;
    }
  } catch (error) {
    log('❌ Get chat error:', error);
  }

  return { success: false, message: 'Failed to get messages' };
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
      if (result.isAdmin) {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'game.html';
      }
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

  if (password.length < 6) {
    showToast('Password minimal 6 karakter', 'error');
    return;
  }

  if (username.length < 3) {
    showToast('Username minimal 3 karakter', 'error');
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
// GAME FUNCTIONS
// ============================================
async function initGame() {
  if (!requireAuth()) return;

  const user = getCurrentUser();
  
  // Redirect admin to admin panel
  if (user.isAdmin) {
    window.location.href = 'admin.html';
    return;
  }

  LoadingManager.show('Loading Game...', 'Fetching your data');

  // Check API connection
  const isConnected = await checkApiConnection();
  
  if (!isConnected) {
    // Use local data if offline
    GameState.score = user.score || 0;
    GameState.coin = user.coin || 1000;
    GameState.monsterLevel = user.monster_level || 1;
    showToast('Offline mode - using local data', 'error');
  } else {
    // Load from server
    const loadResult = await loadProgress();
    if (!loadResult.success) {
      GameState.score = user.score || 0;
      GameState.coin = user.coin || 1000;
      GameState.monsterLevel = user.monster_level || 1;
    }
  }

  GameState.user = user;
  
  // Setup monster
  spawnMonster();
  
  // Start auto-save
  startAutoSave();
  
  // Setup monster click
  const monsterBox = document.getElementById('monster-box');
  if (monsterBox) {
    monsterBox.addEventListener('click', tapMonster);
  }
  
  // Update UI
  updateGameUI();
  updateOnlineStatus();
  updateVIPBadge();
  
  // Hide loading
  LoadingManager.hide();
  
  // Start online status updates
  setInterval(updateOnlineStatus, 5000);
  
  log('🎮 Game initialized');
}

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
    setTimeout(() => {
      monsterBox.style.transform = 'scale(1)';
    }, 100);
  }

  // Check monster death
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
    saveProgress();

    GameState.autoTapInterval = setInterval(() => {
      tapMonster();
    }, 2000);

    showToast('Auto Tap diaktifkan! 🤖', 'success');
    updateGameUI();
  }
}

function goToShop() {
  window.location.href = 'shop.html';
}

function applyInventoryEffects() {
  GameState.inventory.forEach(item => {
    if (item.item === 'Power Tap') {
      GameState.powerMultiplier = 2;
    } else if (item.item === 'Auto Tap' && !GameState.autoTapInterval) {
      GameState.autoTapInterval = setInterval(() => {
        tapMonster();
      }, 2000);
    } else if (item.item === 'Critical Hit') {
      GameState.criticalChance = 0.25;
    } else if (item.item === 'Coin Multiplier') {
      GameState.coinMultiplier = 2;
    }
  });
}

function updateOnlineStatus() {
  const indicator = document.getElementById('online-status');
  const statusText = document.getElementById('status-text');
  const lastSync = document.getElementById('last-sync');
  
  if (indicator && statusText) {
    if (GameState.apiAvailable) {
      indicator.className = 'online-status online';
      statusText.textContent = '🟢 Online';
    } else {
      indicator.className = 'online-status offline';
      statusText.textContent = '🔴 Offline';
    }
  }
  
  if (lastSync && GameState.lastSync) {
    const syncTime = new Date(GameState.lastSync);
    lastSync.textContent = 'Sync: ' + syncTime.toLocaleTimeString('id-ID');
  }
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
// SHOP FUNCTIONS
// ============================================
let currentFilter = 'all';

async function initShop() {
  if (!requireAuth()) return;

  const user = getCurrentUser();
  if (user.isAdmin) {
    window.location.href = 'admin.html';
    return;
  }

  LoadingManager.show('Loading Shop...', 'Fetching items');

  GameState.user = user;
  GameState.coin = user.coin || 1000;

  // Load shop items
  const result = await getShopItems();
  if (result.success) {
    GameState.shopItems = result.items;
  }

  // Load inventory
  const progressResult = await loadProgress();
  if (progressResult.success) {
    GameState.inventory = progressResult.data.inventory ? JSON.parse(progressResult.data.inventory) : [];
  }

  updateCoinDisplay();
  renderShop();
  
  LoadingManager.hide();
}

function renderShop() {
  const grid = document.getElementById('shop-grid');
  if (!grid) return;

  const items = currentFilter === 'all'
    ? GameState.shopItems
    : GameState.shopItems.filter(item => item.type === currentFilter);

  grid.innerHTML = items.map(item => {
    const owned = GameState.inventory.some(i => i.item === item.name);
    const isAvailable = item.availability === 'active';
    return `
      <div class="shop-item ${item.type === 'vip' ? 'vip' : ''} ${owned ? 'owned' : ''}">
        <div class="item-icon">${item.icon}</div>
        <div class="item-name">${item.name}</div>
        <div class="item-desc">${item.desc}</div>
        <div class="item-price">🪙 ${item.price.toLocaleString()}</div>
        <button class="buy-btn" onclick="buyItem(${item.id})" ${owned || !isAvailable ? 'disabled' : ''}>
          ${owned ? 'Dimiliki' : !isAvailable ? 'Tidak Tersedia' : 'Beli'}
        </button>
      </div>
    `;
  }).join('');
}

function filterItems(type) {
  currentFilter = type;

  document.querySelectorAll('.shop-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  event.target.classList.add('active');

  renderShop();
}

async function buyItem(itemId) {
  const item = GameState.shopItems.find(i => i.id === itemId);
  if (!item) return;

  if (item.availability !== 'active') {
    showToast('Item tidak tersedia', 'error');
    return;
  }

  if (item.type === 'power' && GameState.inventory.some(i => i.item === item.name)) {
    showToast('Kamu sudah memiliki item ini!', 'error');
    return;
  }

  if (GameState.coin < item.price) {
    showToast('Koin tidak cukup!', 'error');
    return;
  }

  if (confirm(`Beli ${item.name} untuk 🪙 ${item.price.toLocaleString()}?`)) {
    LoadingManager.show('Processing...', 'Completing purchase');
    
    const result = await buyItemFromServer(item.id, item.name, item.price);
    
    if (result.success) {
      GameState.inventory.push({
        item: item.name,
        purchased: new Date().toISOString()
      });

      applyItemEffect(item);

      GameState.user.coin = GameState.coin;
      Storage.saveUser(GameState.user);

      await recordTransaction(item);

      updateCoinDisplay();
      renderShop();
      LoadingManager.hide();
      showToast(`Berhasil membeli ${item.name}!`, 'success');

      saveProgress(true);
    } else {
      LoadingManager.hide();
      showToast(result.message || 'Gagal membeli item', 'error');
    }
  }
}

function applyItemEffect(item) {
  switch (item.effect || item.type) {
    case 'power':
      GameState.powerMultiplier = 2;
      break;
    case 'autotap':
      if (!GameState.autoTapInterval) {
        GameState.autoTapInterval = setInterval(() => {
          tapMonster();
        }, 2000);
      }
      break;
    case 'critical':
      GameState.criticalChance = 0.25;
      break;
    case 'coin':
      GameState.coinMultiplier = 2;
      break;
    case 'vip':
      GameState.user.vip_status = item.value >= 9999 ? 'permanent' : 'active';
      break;
  }
}

function updateCoinDisplay() {
  const coinEl = document.getElementById('user-coin');
  if (coinEl) {
    coinEl.textContent = GameState.coin.toLocaleString();
  }
}

// ============================================
// LEADERBOARD FUNCTIONS
// ============================================
async function loadLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;

  list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);"><div class="loading-spinner" style="width:30px;height:30px;border:3px solid rgba(255,45,85,0.2);border-top:3px solid #FF2D55;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 10px;"></div>Loading...</div>';

  const result = await getLeaderboard();

  if (result.success && result.leaderboard) {
    displayLeaderboard(result.leaderboard);
  } else {
    list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">Gagal memuat leaderboard</div>';
  }
}

function displayLeaderboard(leaderboard) {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;

  if (leaderboard.length === 0) {
    list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">Belum ada data leaderboard</div>';
    return;
  }

  list.innerHTML = leaderboard.map((entry, index) => {
    let rankBadge = `#${entry.rank || index + 1}`;
    let rankClass = 'normal';

    if (index === 0) {
      rankBadge = '🥇';
      rankClass = 'gold';
    } else if (index === 1) {
      rankBadge = '🥈';
      rankClass = 'silver';
    } else if (index === 2) {
      rankBadge = '🥉';
      rankClass = 'bronze';
    }

    const vipBadge = entry.vip || entry.vip_status !== 'none' 
      ? '<span class="vip-badge">VIP</span>' 
      : '';

    return `
      <div class="leaderboard-item">
        <div class="rank-badge ${rankClass}">${rankBadge}</div>
        <div class="player-info">
          <div class="player-avatar">${entry.username[0].toUpperCase()}</div>
          <div class="player-details">
            <h4>${entry.username}${vipBadge}</h4>
          </div>
        </div>
        <div class="player-score">${entry.score.toLocaleString()}</div>
      </div>
    `;
  }).join('');
}

// ============================================
// TOPUP FUNCTIONS
// ============================================
async function initTopup() {
  if (!requireAuth()) return;
  
  const user = getCurrentUser();
  if (user.isAdmin) {
    window.location.href = 'admin.html';
    return;
  }

  // Load user's topup history
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
      <div style="background:var(--card-bg);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:15px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:600;">🪙 ${t.amount.toLocaleString()} koin</div>
            <div style="font-size:12px;color:var(--text-secondary);">${t.payment_method} | ${new Date(t.request_date).toLocaleDateString('id-ID')}</div>
          </div>
          <div style="padding:4px 12px;border-radius:4px;font-size:12px;font-weight:600;${t.status === 'approved' ? 'background:rgba(52,199,89,0.2);color:#34C759;' : t.status === 'rejected' ? 'background:rgba(255,59,48,0.2);color:#FF3B30;' : 'background:rgba(255,149,0,0.2);color:#FF9500;'}">
            ${t.status === 'approved' ? '✅ Approved' : t.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}
          </div>
        </div>
        ${t.admin_notes ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:8px;">Note: ${t.admin_notes}</div>` : ''}
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

  const result = await requestTopup(amount, paymentMethod, phoneNumber);
  
  if (result.success) {
    showToast(result.message, 'success');
    document.getElementById('topup-form')?.reset();
    await loadTopupHistory();
  } else {
    showToast(result.message || 'Gagal mengirim permintaan', 'error');
  }
}

// ============================================
// ADMIN DASHBOARD FUNCTIONS
// ============================================
async function initAdminDashboard() {
  if (!requireAdmin()) return;

  LoadingManager.show('Loading Admin Dashboard...', 'Fetching data');

  // Load all data
  await Promise.all([
    loadAdminStats(),
    loadAdminUsers(),
    loadAdminTopups(),
    loadAdminShop()
  ]);

  LoadingManager.hide();
}

async function loadAdminStats() {
  const result = await apiRequest('getAdminStats', {});
  
  if (result.success) {
    const stats = result.stats;
    const totalUsersEl = document.getElementById('admin-total-users');
    const totalCoinsEl = document.getElementById('admin-total-coins');
    const pendingTopupsEl = document.getElementById('admin-pending-topups');
    const totalTransactionsEl = document.getElementById('admin-total-transactions');

    if (totalUsersEl) totalUsersEl.textContent = stats.total_users?.toLocaleString() || '0';
    if (totalCoinsEl) totalCoinsEl.textContent = stats.total_coins?.toLocaleString() || '0';
    if (pendingTopupsEl) pendingTopupsEl.textContent = stats.pending_topups?.toLocaleString() || '0';
    if (totalTransactionsEl) totalTransactionsEl.textContent = stats.total_transactions?.toLocaleString() || '0';
  }
}

async function loadAdminUsers() {
  const container = document.getElementById('admin-users-list');
  if (!container) return;

  const result = await getAllUsers();
  
  if (result.success && result.users) {
    container.innerHTML = result.users.map(u => `
      <tr>
        <td>${u.username}</td>
        <td>${u.score?.toLocaleString() || 0}</td>
        <td>${u.coin?.toLocaleString() || 0}</td>
        <td><span class="vip-badge ${u.vip_status !== 'none' ? 'active' : ''}">${u.vip_status || 'none'}</span></td>
        <td>${u.status || 'active'}</td>
        <td>
          <button onclick="showEditUserModal('${u.username}')" class="admin-btn edit">Edit</button>
          <button onclick="showAddCoinsModal('${u.username}')" class="admin-btn success">+Coin</button>
          <button onclick="adminDeleteUser('${u.username}')" class="admin-btn danger">Hapus</button>
        </td>
      </tr>
    `).join('');
  }
}

async function loadAdminTopups() {
  const container = document.getElementById('admin-topups-list');
  if (!container) return;

  const result = await getUserTopups();
  
  if (result.success && result.topups) {
    const pendingTopups = result.topups.filter(t => t.status === 'pending');
    
    if (pendingTopups.length === 0) {
      container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Tidak ada permintaan pending</td></tr>';
      return;
    }

    container.innerHTML = pendingTopups.map(t => `
      <tr>
        <td>${t.username}</td>
        <td>🪙 ${t.amount?.toLocaleString() || 0}</td>
        <td>${t.payment_method || '-'}</td>
        <td>${new Date(t.request_date).toLocaleDateString('id-ID')}</td>
        <td><span class="status-badge pending">Pending</span></td>
        <td>
          <button onclick="approveTopupPrompt('${t.id}', '${t.username}', ${t.amount})" class="admin-btn success">Approve</button>
          <button onclick="rejectTopupPrompt('${t.id}')" class="admin-btn danger">Reject</button>
        </td>
      </tr>
    `).join('');
  }
}

async function loadAdminShop() {
  const container = document.getElementById('admin-shop-list');
  if (!container) return;

  const result = await getShopItems();
  
  if (result.success && result.items) {
    container.innerHTML = result.items.map(item => `
      <tr>
        <td>${item.icon} ${item.name}</td>
        <td>${item.desc}</td>
        <td>🪙 ${item.price?.toLocaleString() || 0}</td>
        <td><span class="type-badge ${item.type}">${item.type}</span></td>
        <td><span class="status-badge ${item.availability}">${item.availability}</span></td>
        <td>
          <button onclick="showEditItemModal(${item.id})" class="admin-btn edit">Edit</button>
        </td>
      </tr>
    `).join('');
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
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
  toast.className = `toast ${type}`;
  toast.style.cssText = `
    background: rgba(28, 28, 30, 0.95);
    border: 1px solid ${type === 'error' ? '#FF3B30' : '#34C759'};
    border-radius: 12px;
    padding: 16px 20px;
    color: white;
    min-width: 250px;
    animation: slideIn 0.3s ease;
    backdrop-filter: blur(10px);
  `;
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function checkPasswordStrength(password) {
  let strength = 0;
  if (password.length >= 6) strength += 25;
  if (password.length >= 8) strength += 25;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 25;
  if (/[0-9]/.test(password)) strength += 25;
  return strength;
}

function updateStrengthBar(password) {
  const bar = document.getElementById('strength-bar');
  if (!bar) return;

  const strength = checkPasswordStrength(password);
  bar.style.width = strength + '%';

  const colors = { 25: '#FF3B30', 50: '#FF9500', 75: '#FFD700', 100: '#34C759' };
  for (const threshold of [100, 75, 50, 25]) {
    if (strength <= threshold) {
      bar.style.background = colors[threshold];
      break;
    }
  }
}

function log(...args) {
  if (CONFIG.DEBUG) {
    console.log('[TTW]', ...args);
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
      if (isLoggedIn()) {
        const user = getCurrentUser();
        window.location.href = user.isAdmin ? 'admin.html' : 'game.html';
        return;
      }
      break;

    case 'register.html':
      if (isLoggedIn()) {
        const user = getCurrentUser();
        window.location.href = user.isAdmin ? 'admin.html' : 'game.html';
        return;
      }
      
      const passwordInput = document.getElementById('password');
      if (passwordInput) {
        passwordInput.addEventListener('input', (e) => {
          updateStrengthBar(e.target.value);
        });
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
      setInterval(loadLeaderboard, CONFIG.LEADERBOARD_REFRESH_INTERVAL);
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

window.addEventListener('beforeunload', () => {
  if (GameState.user && !GameState.isAdmin) {
    saveProgress(true);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && GameState.user && !GameState.isAdmin) {
    saveProgress();
  }
});

// ============================================
// CSS INJECTION
// ============================================
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .shop-item.owned { opacity: 0.6; }
  .shop-item.owned .buy-btn { background: #34C759 !important; cursor: not-allowed; }
  .shop-item.unavailable { opacity: 0.4; }

  .vip-badge {
    display: inline-block;
    background: linear-gradient(135deg, #FFD700, #FF9500);
    color: #000;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    margin-left: 8px;
  }
  .vip-badge.active { background: linear-gradient(135deg, #FFD700, #FF9500); }

  .online-status {
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .online-status.online { background: rgba(52, 199, 89, 0.2); color: #34C759; border: 1px solid #34C759; }
  .online-status.offline { background: rgba(255, 59, 48, 0.2); color: #FF3B30; border: 1px solid #FF3B30; }

  .status-dot { width: 8px; height: 8px; border-radius: 50%; animation: pulse 2s infinite; }
  .online .status-dot { background: #34C759; }
  .offline .status-dot { background: #FF3B30; }

  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  .chat-message { padding: 8px 12px; margin-bottom: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; }
  .chat-username { font-weight: 600; color: #FF2D55; }
  .chat-text { margin-left: 8px; }
  .chat-time { float: right; font-size: 11px; color: rgba(255, 255, 255, 0.5); }

  /* Admin styles */
  .admin-table { width: 100%; border-collapse: collapse; }
  .admin-table th, .admin-table td { padding: 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); }
  .admin-table th { color: var(--text-secondary); font-weight: 500; }
  .admin-btn { padding: 6px 12px; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; margin-right: 5px; }
  .admin-btn.edit { background: #007AFF; color: white; }
  .admin-btn.success { background: #34C759; color: white; }
  .admin-btn.danger { background: #FF3B30; color: white; }
  .status-badge { padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .status-badge.pending { background: rgba(255, 149, 0, 0.2); color: #FF9500; }
  .status-badge.approved, .status-badge.active { background: rgba(52, 199, 89, 0.2); color: #34C759; }
  .status-badge.rejected, .status-badge.inactive { background: rgba(255, 59, 48, 0.2); color: #FF3B30; }
  .type-badge { padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .type-badge.power { background: rgba(0, 122, 255, 0.2); color: #007AFF; }
  .type-badge.vip { background: rgba(255, 215, 0, 0.2); color: #FFD700; }
`;
document.head.appendChild(style);

// Export functions
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.logout = logout;
window.tapMonster = tapMonster;
window.buyAutoTap = buyAutoTap;
window.goToShop = goToShop;
window.filterItems = filterItems;
window.buyItem = buyItem;
window.showToast = showToast;
window.checkPasswordStrength = checkPasswordStrength;
window.updateStrengthBar = updateStrengthBar;
window.saveProgress = saveProgress;
window.loadLeaderboard = loadLeaderboard;
window.handleTopupSubmit = handleTopupSubmit;
window.requestTopup = requestTopup;
window.getUserTopups = getUserTopups;
window.approveTopup = approveTopup;
window.rejectTopup = rejectTopup;
window.getAllUsers = getAllUsers;
window.adminUpdateUser = adminUpdateUser;
window.adminDeleteUser = adminDeleteUser;
window.adminAddCoins = adminAddCoins;
window.adminUpdateShopItem = adminUpdateShopItem;
window.getSession = () => getCurrentUser();

console.log('🎮 TAP TAP WAR v2.0 - Ready!');
console.log('✅ Persistent Login: Enabled');
console.log('✅ Auto-Save: Enabled (3s)');
console.log('✅ Admin Dashboard: Enabled');
