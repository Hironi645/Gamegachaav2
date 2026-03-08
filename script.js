/**
 * TAP TAP WAR - Full Google Sheets Database Integration
 * No Local Storage - Pure Cloud Database
 * 
 * Database Structure:
 * - Users: ID, Username, Password, Email, Score, Coin, VIP_Status, VIP_Expired, Registered_Date, Last_Login, Status, Monster_Level, Inventory
 * - Leaderboard: Rank, Username, Score, VIP_Status, Last_Updated
 * - Transactions: ID, Username, Item_Name, Price, Transaction_Date, Type, Status
 * - TopupRequests: ID, Username, Amount, Payment_Method, Status, Request_Date, Admin_Notes
 * - ShopItems: ID, Item_Name, Icon, Description, Price, Type, Availability
 * - Chat: ID, Username, Message, Timestamp, Status
 */

// ============================================
// CONFIGURATION - UPDATE THIS WITH YOUR URL
// ============================================
const CONFIG = {
  // GANTI URL INI DENGAN URL GOOGLE APPS SCRIPT ANDA
  API_URL: 'https://script.google.com/macros/s/AKfycbzBRsDbnf7XEfkgmQY5iNRFyzetvx-QM1z9H_Al6tL8TMW0q1-dsQaq3EOeC3NUIBCw/exec',
  
  // Cache keys (for session only, not persistent storage)
  CACHE_KEY: 'ttw_cache_',
  SESSION_KEY: 'ttw_session',
  
  // Intervals (in milliseconds)
  AUTO_SAVE_INTERVAL: 5000,        // 5 seconds
  LEADERBOARD_REFRESH_INTERVAL: 10000,  // 10 seconds
  CHAT_REFRESH_INTERVAL: 5000,     // 5 seconds
  SYNC_INTERVAL: 5000,             // 5 seconds
  
  // Retry settings
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000,
  
  // Debug mode
  DEBUG: true
};

// ============================================
// GAME STATE - Realtime State Management
// ============================================
const GameState = {
  user: null,
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
  pendingUpdates: [],
  sessionId: null,
  apiAvailable: false,
  isLoading: true
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
            <div class="loader-status" id="loader-status">Connecting to database...</div>
          </div>
        </div>
      `;
      document.body.appendChild(loader);
      
      // Add styles
      const style = document.createElement('style');
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
          width: 80px;
          height: 80px;
          border: 4px solid rgba(255, 45, 85, 0.2);
          border-top: 4px solid #FF2D55;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 30px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .loader-message {
          font-size: 28px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 10px;
        }
        .loader-submessage {
          font-size: 16px;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 20px;
        }
        .loader-status {
          font-size: 14px;
          color: #FF2D55;
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .loader-error {
          color: #FF3B30 !important;
        }
        .loader-success {
          color: #34C759 !important;
        }
        .loader-retry-btn {
          margin-top: 20px;
          padding: 12px 30px;
          background: linear-gradient(135deg, #FF2D55, #C41E3A);
          border: none;
          border-radius: 10px;
          color: white;
          font-weight: 600;
          cursor: pointer;
          font-size: 16px;
        }
        .loader-retry-btn:hover {
          transform: scale(1.05);
        }
      `;
      document.head.appendChild(style);
    } else {
      loader.querySelector('.loader-message').textContent = message;
      loader.querySelector('.loader-submessage').textContent = subMessage;
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
      loader.style.transition = 'opacity 0.5s ease';
      setTimeout(() => {
        loader.remove();
      }, 500);
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
      retryBtn.textContent = '🔄 Coba Lagi';
      retryBtn.onclick = () => {
        if (onRetry) onRetry();
      };
      content.appendChild(retryBtn);
    }
  }
};

// ============================================
// API FUNCTIONS - Google Sheets Integration
// ============================================
async function apiRequest(action, data = {}, retryCount = 0) {
  // Check if using default URL
  if (CONFIG.API_URL.includes('YOUR_SCRIPT_ID') || CONFIG.API_URL.includes('AKfycbw1a38')) {
    throw new Error('API_URL_NOT_CONFIGURED');
  }

  try {
    const requestData = {
      action: action,
      timestamp: new Date().toISOString(),
      sessionId: GameState.sessionId,
      ...data
    };

    log('API Request:', action, requestData);

    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    log('API Response:', result);
    
    if (result.sessionId) {
      GameState.sessionId = result.sessionId;
    }
    
    return result;
    
  } catch (error) {
    log(`API Error (attempt ${retryCount + 1}):`, error);
    
    if (retryCount < CONFIG.MAX_RETRY_ATTEMPTS) {
      LoadingManager.updateStatus(`Retrying... (${retryCount + 1}/${CONFIG.MAX_RETRY_ATTEMPTS})`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
      return apiRequest(action, data, retryCount + 1);
    }
    
    throw error;
  }
}

async function checkApiConnection() {
  try {
    LoadingManager.updateStatus('Checking database connection...');
    const result = await apiRequest('ping', {});
    
    if (result.success) {
      GameState.apiAvailable = true;
      GameState.isOnline = true;
      LoadingManager.updateStatus('Connected to database!', 'success');
      return true;
    }
  } catch (error) {
    log('API connection failed:', error);
    GameState.apiAvailable = false;
    GameState.isOnline = false;
  }
  return false;
}

// ============================================
// SESSION STORAGE (Temporary, not persistent)
// ============================================
function saveSession(user) {
  try {
    sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(user));
  } catch (e) {
    log('Session storage not available');
  }
}

function getSession() {
  try {
    const data = sessionStorage.getItem(CONFIG.SESSION_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
  } catch (e) {
    log('Session storage not available');
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
    LoadingManager.show('Creating Account...', 'Please wait while we set up your profile');
    
    const result = await apiRequest('register', {
      username: username,
      password: password,
      email: email
    });

    if (result.success) {
      saveSession(result.user);
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
    log('Registration error:', error);
    
    if (error.message === 'API_URL_NOT_CONFIGURED') {
      return { success: false, message: 'API URL belum dikonfigurasi. Silakan setup Google Sheets terlebih dahulu.' };
    }
    
    return { success: false, message: 'Gagal terhubung ke database. Periksa koneksi internet Anda.' };
  }
}

async function loginUser(username, password) {
  if (!username || !password) {
    return { success: false, message: 'Username dan password wajib diisi' };
  }

  try {
    LoadingManager.show('Logging In...', 'Verifying your credentials');
    
    const result = await apiRequest('login', {
      username: username,
      password: password
    });

    if (result.success && result.user) {
      saveSession(result.user);
      GameState.user = result.user;
      GameState.score = result.user.score || 0;
      GameState.coin = result.user.coin || 1000;
      GameState.monsterLevel = result.user.monster_level || 1;
      GameState.inventory = result.user.inventory ? JSON.parse(result.user.inventory) : [];
      GameState.apiAvailable = true;
      GameState.isOnline = true;
      
      // Apply inventory effects
      applyInventoryEffects();
      
      LoadingManager.hide();
      return { success: true, user: result.user, message: 'Login berhasil!' };
    } else {
      LoadingManager.hide();
      return { success: false, message: result.message || 'Login gagal' };
    }
  } catch (error) {
    LoadingManager.hide();
    log('Login error:', error);
    
    if (error.message === 'API_URL_NOT_CONFIGURED') {
      return { success: false, message: 'API URL belum dikonfigurasi. Silakan setup Google Sheets terlebih dahulu.' };
    }
    
    return { success: false, message: 'Gagal terhubung ke database. Periksa koneksi internet Anda.' };
  }
}

async function logout() {
  if (confirm('Yakin ingin logout?')) {
    LoadingManager.show('Logging Out...', 'Saving your progress');
    
    // Final save
    if (GameState.user) {
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
    
    // Clear session
    clearSession();
    
    // Reset game state
    GameState.user = null;
    GameState.score = 0;
    GameState.coin = 0;
    GameState.inventory = [];
    
    LoadingManager.hide();
    window.location.href = 'index.html';
  }
}

function getCurrentUser() {
  if (GameState.user) return GameState.user;
  return getSession();
}

function isLoggedIn() {
  return getCurrentUser() !== null;
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// ============================================
// GAME PROGRESS - Save/Load
// ============================================
async function saveProgress(immediate = false) {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

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
      GameState.apiAvailable = true;
      GameState.lastSync = new Date().toISOString();
      
      // Update session
      user.score = GameState.score;
      user.coin = GameState.coin;
      saveSession(user);
      
      return { success: true, message: 'Progress saved!' };
    }
  } catch (error) {
    log('Save progress error:', error);
  }

  return { success: false, message: 'Failed to save progress' };
}

async function loadProgress() {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('getUserData', { username: user.username });

    if (result.success && result.data) {
      const serverData = result.data;
      
      GameState.score = serverData.score || 0;
      GameState.coin = serverData.coin || 1000;
      GameState.monsterLevel = serverData.monster_level || 1;
      GameState.inventory = serverData.inventory ? JSON.parse(serverData.inventory) : [];
      GameState.apiAvailable = true;
      GameState.lastSync = new Date().toISOString();
      
      // Update session
      user.score = GameState.score;
      user.coin = GameState.coin;
      user.monster_level = GameState.monsterLevel;
      saveSession(user);
      
      // Apply inventory effects
      applyInventoryEffects();
      
      log('📥 Data loaded from server');
      return { success: true, data: serverData };
    }
  } catch (error) {
    log('Load progress error:', error);
  }

  return { success: false, message: 'Failed to load progress' };
}

// ============================================
// LEADERBOARD
// ============================================
async function getLeaderboard(limit = 50) {
  try {
    const result = await apiRequest('getLeaderboard', { limit: limit });

    if (result.success && result.leaderboard) {
      GameState.apiAvailable = true;
      return { 
        success: true, 
        leaderboard: result.leaderboard,
        lastUpdated: result.lastUpdated 
      };
    }
  } catch (error) {
    log('Get leaderboard error:', error);
  }

  return { success: false, message: 'Failed to load leaderboard' };
}

async function updateLeaderboard() {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

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
    log('Update leaderboard error:', error);
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
      return { success: true, items: result.items };
    }
  } catch (error) {
    log('Get shop items error:', error);
  }
  
  // Fallback default items
  return {
    success: true,
    items: [
      { id: 1, name: 'Power Tap', icon: '👊', desc: 'Double tap damage', price: 5000, type: 'power', availability: 'active' },
      { id: 2, name: 'Auto Tap', icon: '🤖', desc: 'Auto tap every 2s', price: 10000, type: 'power', availability: 'active' },
      { id: 3, name: 'Critical Hit', icon: '⚡', desc: '25% crit chance', price: 15000, type: 'power', availability: 'active' },
      { id: 4, name: 'Coin Multiplier', icon: '🪙', desc: '2x coin rewards', price: 20000, type: 'power', availability: 'active' },
      { id: 5, name: 'VIP Daily', icon: '👑', desc: '1 day VIP', price: 2000, type: 'vip', availability: 'active' },
      { id: 6, name: 'VIP Weekly', icon: '👑', desc: '7 days VIP', price: 10000, type: 'vip', availability: 'active' },
      { id: 7, name: 'VIP Monthly', icon: '👑', desc: '30 days VIP', price: 30000, type: 'vip', availability: 'active' },
      { id: 8, name: 'VIP Permanent', icon: '💎', desc: 'Permanent VIP', price: 100000, type: 'vip', availability: 'active' }
    ]
  };
}

async function recordTransaction(item) {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

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
    log('Record transaction error:', error);
  }

  return { success: false, message: 'Failed to record transaction' };
}

async function getUserTransactions() {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('getTransactions', { username: user.username });
    if (result.success) {
      return result;
    }
  } catch (error) {
    log('Get transactions error:', error);
  }

  return { success: false, message: 'Failed to get transactions' };
}

async function buyItemFromServer(itemId, itemName, price) {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('buyItem', {
      username: user.username,
      item_id: itemId,
      item_name: itemName,
      price: price
    });
    
    if (result.success) {
      // Update local state
      GameState.coin = result.remaining_coin;
      return result;
    }
  } catch (error) {
    log('Buy item error:', error);
  }

  return { success: false, message: 'Failed to buy item' };
}

// ============================================
// TOPUP REQUESTS
// ============================================
async function requestTopup(amount, paymentMethod) {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('requestTopup', {
      username: user.username,
      amount: amount,
      payment_method: paymentMethod
    });
    
    if (result.success) {
      return { success: true, message: 'Permintaan topup dikirim!' };
    }
  } catch (error) {
    log('Request topup error:', error);
  }

  return { success: false, message: 'Failed to send topup request' };
}

async function getUserTopups() {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('getTopups', { username: user.username });
    if (result.success) {
      return result;
    }
  } catch (error) {
    log('Get topups error:', error);
  }

  return { success: false, message: 'Failed to get topups' };
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
    log('Send chat error:', error);
  }

  return { success: false, message: 'Failed to send message' };
}

async function getChatMessages(limit = 50) {
  try {
    const result = await apiRequest('getChat', { limit: limit });
    if (result.success && result.messages) {
      return result;
    }
  } catch (error) {
    log('Get chat error:', error);
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
      window.location.href = 'game.html';
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

  // Show loading
  LoadingManager.show('Loading Game...', 'Connecting to game server');

  // Check API connection first
  const isConnected = await checkApiConnection();
  
  if (!isConnected) {
    LoadingManager.showError('Gagal terhubung ke database. Periksa koneksi internet Anda.', () => {
      initGame();
    });
    return;
  }

  const user = getCurrentUser();
  GameState.user = user;
  
  // Load progress from server
  const loadResult = await loadProgress();
  
  if (!loadResult.success) {
    // Use session data as fallback
    GameState.score = user.score || 0;
    GameState.coin = user.coin || 1000;
    GameState.monsterLevel = user.monster_level || 1;
    GameState.inventory = user.inventory ? JSON.parse(user.inventory) : [];
  }

  // Setup monster
  spawnMonster();
  
  // Setup auto-save
  setInterval(() => {
    saveProgress();
  }, CONFIG.AUTO_SAVE_INTERVAL);
  
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
    lastSync.textContent = 'Terakhir sync: ' + syncTime.toLocaleTimeString('id-ID');
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
let shopItems = [];
let currentFilter = 'all';

async function initShop() {
  if (!requireAuth()) return;

  LoadingManager.show('Loading Shop...', 'Fetching items from server');

  const user = getCurrentUser();
  GameState.user = user;
  GameState.coin = user.coin || 1000;

  // Load shop items from server
  const result = await getShopItems();
  if (result.success) {
    shopItems = result.items;
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
    ? shopItems
    : shopItems.filter(item => item.type === currentFilter);

  grid.innerHTML = items.map(item => {
    const owned = GameState.inventory.some(i => i.item === item.name);
    const isAvailable = item.availability === 'active';
    return `
      <div class="shop-item ${item.type === 'vip' ? 'vip' : ''} ${owned ? 'owned' : ''} ${!isAvailable ? 'unavailable' : ''}">
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
  const item = shopItems.find(i => i.id === itemId);
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
    LoadingManager.show('Processing...', 'Completing your purchase');
    
    // Try server purchase first
    const result = await buyItemFromServer(item.id, item.name, item.price);
    
    if (result.success) {
      GameState.inventory.push({
        item: item.name,
        purchased: new Date().toISOString()
      });

      applyItemEffect(item);

      // Update user session
      GameState.user.coin = GameState.coin;
      saveSession(GameState.user);

      // Record transaction
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

  list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">Loading...</div>';

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
// CHAT FUNCTIONS
// ============================================
let chatInterval = null;

async function initChat() {
  await loadChatMessages();
  
  if (chatInterval) clearInterval(chatInterval);
  chatInterval = setInterval(loadChatMessages, CONFIG.CHAT_REFRESH_INTERVAL);
}

async function loadChatMessages() {
  const chatContainer = document.getElementById('chat-messages');
  if (!chatContainer) return;

  const result = await getChatMessages(30);

  if (result.success && result.messages) {
    displayChatMessages(result.messages);
  }
}

function displayChatMessages(messages) {
  const chatContainer = document.getElementById('chat-messages');
  if (!chatContainer) return;

  chatContainer.innerHTML = messages.map(msg => `
    <div class="chat-message">
      <span class="chat-username">${msg.username}:</span>
      <span class="chat-text">${escapeHtml(msg.message)}</span>
      <span class="chat-time">${formatTime(msg.timestamp)}</span>
    </div>
  `).join('');

  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function handleChatSubmit(event) {
  event.preventDefault();

  const input = document.getElementById('chat-input');
  if (!input) return;

  const message = input.value.trim();
  if (!message) return;

  const result = await sendChatMessage(message);

  if (result.success) {
    input.value = '';
    await loadChatMessages();
  } else {
    showToast(result.message || 'Gagal mengirim pesan', 'error');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
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
      z-index: 1000;
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

  const colors = {
    25: '#FF3B30',
    50: '#FF9500',
    75: '#FFD700',
    100: '#34C759'
  };

  for (const threshold of [100, 75, 50, 25]) {
    if (strength <= threshold) {
      bar.style.background = colors[threshold];
      break;
    }
  }
}

function log(...args) {
  if (CONFIG.DEBUG) {
    console.log(...args);
  }
}

// ============================================
// PAGE INITIALIZATION
// ============================================
async function initPage() {
  const path = window.location.pathname;
  const page = path.split('/').pop() || 'index.html';

  switch (page) {
    case 'login.html':
      if (isLoggedIn()) {
        window.location.href = 'game.html';
        return;
      }
      // Check API on load
      checkApiConnection().then(connected => {
        if (!connected) {
          showToast('Database tidak terhubung. Beberapa fitur mungkin tidak berfungsi.', 'error');
        }
      });
      break;

    case 'register.html':
      if (isLoggedIn()) {
        window.location.href = 'game.html';
        return;
      }
      
      const passwordInput = document.getElementById('password');
      if (passwordInput) {
        passwordInput.addEventListener('input', (e) => {
          updateStrengthBar(e.target.value);
        });
      }
      
      // Check API on load
      checkApiConnection().then(connected => {
        if (!connected) {
          showToast('Database tidak terhubung. Beberapa fitur mungkin tidak berfungsi.', 'error');
        }
      });
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

    case 'chat.html':
      initChat();
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
      navLinks.innerHTML = `
        <a href="index.html" class="nav-link active">Home</a>
        <a href="game.html" class="nav-link">Game</a>
        <a href="leaderboard.html" class="nav-link">Leaderboard</a>
        <a href="shop.html" class="nav-link">Shop</a>
        <span style="color: var(--text-secondary); font-weight: 500;">👤 ${user.username}</span>
      `;
    }
    if (navPlay) {
      navPlay.textContent = 'Play Game';
      navPlay.href = 'game.html';
    }
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', initPage);

window.addEventListener('beforeunload', () => {
  if (GameState.user) {
    saveProgress(true);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && GameState.user) {
    saveProgress(true);
  }
});

// ============================================
// CSS INJECTION
// ============================================
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .shop-item.owned {
    opacity: 0.6;
  }

  .shop-item.owned .buy-btn {
    background: #34C759 !important;
    cursor: not-allowed;
  }

  .shop-item.unavailable {
    opacity: 0.4;
  }

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

  .online-status.online {
    background: rgba(52, 199, 89, 0.2);
    color: #34C759;
    border: 1px solid #34C759;
  }

  .online-status.offline {
    background: rgba(255, 59, 48, 0.2);
    color: #FF3B30;
    border: 1px solid #FF3B30;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  .online .status-dot {
    background: #34C759;
  }

  .offline .status-dot {
    background: #FF3B30;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .chat-message {
    padding: 8px 12px;
    margin-bottom: 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
  }

  .chat-username {
    font-weight: 600;
    color: #FF2D55;
  }

  .chat-text {
    margin-left: 8px;
  }

  .chat-time {
    float: right;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
  }
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
window.handleChatSubmit = handleChatSubmit;
window.sendChatMessage = sendChatMessage;
window.requestTopup = requestTopup;
window.getUserTopups = getUserTopups;
window.getUserTransactions = getUserTransactions;

console.log('🎮 TAP TAP WAR - Full Google Sheets Integration Ready!');
console.log('✅ Database: Google Sheets');
console.log('✅ Loading Screen: Enabled');
console.log('✅ Session Storage: Enabled (No LocalStorage)');
