/**
 * TAP TAP WAR - Unified JavaScript
 * Real-time Integration with Google Sheets via Google Apps Script
 * 
 * DATABASE STRUCTURE (from Excel):
 * - Users: ID, Username, Password_Hash, Email, Score, Coin, VIP_Status, VIP_Expired, Registered_Date, Last_Login, Status
 * - Leaderboard: Rank, Username, Score, VIP_Status, Last_Updated
 * - Transactions: ID, Username, Item_Name, Price, Transaction_Date, Type, Status
 * - Withdrawals: ID, Username, Amount, Payment_Method, Status, Request_Date, Admin_Notes
 * - Shop_Items: ID, Item_Name, Icon, Description, Price, Type, Availability
 * - Chat: ID, Username, Message, Timestamp, Status
 * 
 * INSTRUCTIONS:
 * 1. Create Google Apps Script from the provided code
 * 2. Deploy as Web App
 * 3. Replace CONFIG.API_URL with your deployed URL
 */

// ============================================
// CONFIGURATION - EDIT THIS SECTION
// ============================================
const CONFIG = {
  // GANTI URL INI DENGAN URL GOOGLE APPS SCRIPT ANDA
  // Contoh: 'https://script.google.com/macros/s/AKfycbx.../exec'
  API_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
  
  // Storage keys
  STORAGE_KEY: 'tapTapWarUser',
  USERS_KEY: 'tapTapWarUsers',
  LEADERBOARD_KEY: 'tapTapWarLeaderboard',
  TRANSACTIONS_KEY: 'tapTapWarTransactions',
  INVENTORY_KEY: 'tapTapWarInventory',
  CHAT_KEY: 'tapTapWarChat',
  
  // Intervals (in milliseconds)
  AUTO_SAVE_INTERVAL: 5000,        // 5 seconds
  LEADERBOARD_REFRESH_INTERVAL: 10000,  // 10 seconds
  CHAT_REFRESH_INTERVAL: 5000,     // 5 seconds
  SYNC_INTERVAL: 5000,             // 5 seconds for realtime sync
  
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
  apiAvailable: false
};

// ============================================
// SHOP ITEMS - From Database Structure
// ============================================
const SHOP_ITEMS = [
  { id: 1, name: 'Power Tap', icon: '👊', desc: 'Double tap damage', price: 5000, type: 'power', effect: 'power', value: 2, availability: 'active' },
  { id: 2, name: 'Auto Tap', icon: '🤖', desc: 'Auto tap every 2s', price: 10000, type: 'power', effect: 'autotap', value: 2000, availability: 'active' },
  { id: 3, name: 'Critical Hit', icon: '⚡', desc: '25% crit chance', price: 15000, type: 'power', effect: 'critical', value: 0.25, availability: 'active' },
  { id: 4, name: 'Coin Multiplier', icon: '🪙', desc: '2x coin rewards', price: 20000, type: 'power', effect: 'coin', value: 2, availability: 'active' },
  { id: 5, name: 'VIP Daily', icon: '👑', desc: '1 day VIP', price: 2000, type: 'vip', effect: 'vip', value: 1, availability: 'active' },
  { id: 6, name: 'VIP Weekly', icon: '👑', desc: '7 days VIP', price: 10000, type: 'vip', effect: 'vip', value: 7, availability: 'active' },
  { id: 7, name: 'VIP Monthly', icon: '👑', desc: '30 days VIP', price: 30000, type: 'vip', effect: 'vip', value: 30, availability: 'active' },
  { id: 8, name: 'VIP Permanent', icon: '💎', desc: 'Permanent VIP', price: 100000, type: 'vip', effect: 'vip', value: 9999, availability: 'active' }
];

// ============================================
// REALTIME SYNC ENGINE
// ============================================
const RealtimeSync = {
  syncInterval: null,
  isSyncing: false,
  lastServerData: null,

  start() {
    if (this.syncInterval) return;
    
    log('🔄 Starting realtime sync...');
    
    // Immediate first sync
    this.sync();
    
    // Set up interval
    this.syncInterval = setInterval(() => {
      this.sync();
    }, CONFIG.SYNC_INTERVAL);
  },

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      log('🛑 Realtime sync stopped');
    }
  },

  async sync() {
    if (this.isSyncing || !GameState.user) return;
    
    this.isSyncing = true;
    
    try {
      // Push local changes to server
      await this.pushToServer();
      
      // Pull server changes
      await this.pullFromServer();
      
      GameState.lastSync = new Date().toISOString();
      GameState.isOnline = true;
      GameState.apiAvailable = true;
      
    } catch (error) {
      log('Sync error:', error);
      GameState.isOnline = false;
      GameState.apiAvailable = false;
    } finally {
      this.isSyncing = false;
      updateOnlineStatus();
    }
  },

  async pushToServer() {
    if (GameState.pendingUpdates.length === 0) return;
    
    const updates = [...GameState.pendingUpdates];
    GameState.pendingUpdates = [];
    
    for (const update of updates) {
      try {
        await apiRequest(update.action, update.data);
      } catch (error) {
        // Re-add to queue if failed
        GameState.pendingUpdates.push(update);
      }
    }
  },

  async pullFromServer() {
    const result = await apiRequest('getUserData', { 
      username: GameState.user.username 
    });
    
    if (result.success && result.data) {
      const serverData = result.data;
      
      // Check if server has newer data
      if (serverData.score > GameState.score) {
        GameState.score = serverData.score;
        GameState.coin = serverData.coin;
        GameState.monsterLevel = serverData.monster_level || 1;
        
        // Update UI
        updateGameUI();
        
        log('📥 Data updated from server');
      }
      
      this.lastServerData = serverData;
    }
  },

  queueUpdate(action, data) {
    GameState.pendingUpdates.push({ action, data, timestamp: Date.now() });
  }
};

// ============================================
// API FUNCTIONS - Google Sheets Integration
// ============================================

/**
 * Make API request to Google Apps Script with retry logic
 * @param {string} action - Action to perform
 * @param {object} data - Data to send
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<object>} - API response
 */
async function apiRequest(action, data = {}, retryCount = 0) {
  // Check if using default URL
  if (CONFIG.API_URL.includes('YOUR_SCRIPT_ID')) {
    throw new Error('API URL not configured. Please set CONFIG.API_URL in script.js');
  }

  try {
    const requestData = {
      action: action,
      timestamp: new Date().toISOString(),
      sessionId: GameState.sessionId,
      ...data
    };

    log('API Request:', action, requestData);

    // Use POST for better reliability with Google Apps Script
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    log('API Response:', result);
    
    // Update session ID if provided
    if (result.sessionId) {
      GameState.sessionId = result.sessionId;
    }
    
    return result;
    
  } catch (error) {
    log(`API Error (attempt ${retryCount + 1}):`, error);
    
    // Retry logic
    if (retryCount < CONFIG.MAX_RETRY_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
      return apiRequest(action, data, retryCount + 1);
    }
    
    // Return error after all retries failed
    return { 
      success: false, 
      error: error.message, 
      local: true,
      message: 'Connection failed. Using local mode.'
    };
  }
}

/**
 * Check if API is available
 */
async function checkApiAvailability() {
  try {
    const result = await apiRequest('ping', {});
    GameState.apiAvailable = result.success;
    return result.success;
  } catch (error) {
    GameState.apiAvailable = false;
    return false;
  }
}

// ============================================
// LOCAL DATABASE FALLBACK
// ============================================

function initLocalDatabase() {
  if (!localStorage.getItem(CONFIG.USERS_KEY)) {
    localStorage.setItem(CONFIG.USERS_KEY, JSON.stringify([]));
  }
  if (!localStorage.getItem(CONFIG.LEADERBOARD_KEY)) {
    localStorage.setItem(CONFIG.LEADERBOARD_KEY, JSON.stringify([]));
  }
  if (!localStorage.getItem(CONFIG.TRANSACTIONS_KEY)) {
    localStorage.setItem(CONFIG.TRANSACTIONS_KEY, JSON.stringify([]));
  }
  if (!localStorage.getItem(CONFIG.CHAT_KEY)) {
    localStorage.setItem(CONFIG.CHAT_KEY, JSON.stringify([]));
  }
  log('✅ Local database initialized');
}

function getAllLocalUsers() {
  return JSON.parse(localStorage.getItem(CONFIG.USERS_KEY) || '[]');
}

function saveLocalUsers(users) {
  localStorage.setItem(CONFIG.USERS_KEY, JSON.stringify(users));
}

function getLocalUserByUsername(username) {
  const users = getAllLocalUsers();
  return users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

function updateLocalUser(updatedUser) {
  const users = getAllLocalUsers();
  const index = users.findIndex(u => u.username.toLowerCase() === updatedUser.username.toLowerCase());
  if (index !== -1) {
    users[index] = { ...users[index], ...updatedUser };
    saveLocalUsers(users);
    return true;
  }
  return false;
}

// ============================================
// USER AUTHENTICATION - Realtime
// ============================================

/**
 * Register new user to Google Sheets
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string} email - Email (optional)
 * @returns {Promise<object>} - Registration result
 */
async function registerUser(username, password, email = '') {
  // Validate input
  if (!username || username.length < 3) {
    return { success: false, message: 'Username minimal 3 karakter' };
  }
  
  if (!password || password.length < 6) {
    return { success: false, message: 'Password minimal 6 karakter' };
  }

  // Check local cache first
  const localUsers = getAllLocalUsers();
  if (localUsers.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { success: false, message: 'Username sudah terdaftar' };
  }

  // Try API Registration
  try {
    const result = await apiRequest('register', {
      username: username,
      password: password,
      email: email,
      registered_date: new Date().toISOString(),
      last_login: new Date().toISOString(),
      status: 'active'
    });

    if (result.success) {
      // Create user object matching database structure
      const user = {
        id: result.userId || Date.now().toString(),
        username: username,
        email: email,
        vip_status: 'none',
        vip_expired: null,
        score: 0,
        coin: 1000,
        monster_level: 1,
        registered_date: new Date().toISOString(),
        last_login: new Date().toISOString(),
        status: 'active',
        inventory: '[]'
      };

      // Save to local cache
      localUsers.push({ username, password, ...user });
      saveLocalUsers(localUsers);
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(user));

      // Initialize game state
      GameState.user = user;
      GameState.score = 0;
      GameState.coin = 1000;
      GameState.apiAvailable = true;

      log('✅ User registered via API:', username);
      return { success: true, user, message: 'Registrasi berhasil!' };
    }
  } catch (error) {
    log('API registration failed, using local fallback:', error);
  }

  // Fallback to local registration
  const newUser = {
    id: Date.now().toString(),
    username: username,
    password: password,
    email: email,
    vip_status: 'none',
    vip_expired: null,
    score: 0,
    coin: 1000,
    monster_level: 1,
    registered_date: new Date().toISOString(),
    last_login: new Date().toISOString(),
    status: 'active',
    inventory: '[]'
  };

  localUsers.push(newUser);
  saveLocalUsers(localUsers);
  
  const { password: _, ...userWithoutPassword } = newUser;
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(userWithoutPassword));

  GameState.user = userWithoutPassword;
  GameState.score = 0;
  GameState.coin = 1000;
  GameState.apiAvailable = false;

  log('✅ User registered locally:', username);
  return { success: true, user: userWithoutPassword, message: 'Registrasi berhasil! (Local Mode)' };
}

/**
 * Login user with realtime sync
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<object>} - Login result
 */
async function loginUser(username, password) {
  // Try API Login first
  try {
    const result = await apiRequest('login', {
      username: username,
      password: password,
      login_time: new Date().toISOString()
    });

    if (result.success && result.user) {
      // Merge server data with local
      const user = {
        ...result.user,
        last_login: new Date().toISOString()
      };

      // Save to local storage
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(user));

      // Initialize game state
      GameState.user = user;
      GameState.score = user.score || 0;
      GameState.coin = user.coin || 1000;
      GameState.monsterLevel = user.monster_level || 1;
      GameState.inventory = user.inventory ? JSON.parse(user.inventory) : [];
      GameState.apiAvailable = true;

      // Start realtime sync
      RealtimeSync.start();

      log('✅ User logged in via API:', username);
      return { success: true, user, message: 'Login berhasil!' };
    }
  } catch (error) {
    log('API login failed, using local fallback:', error);
  }

  // Fallback to local authentication
  const localUsers = getAllLocalUsers();
  const localUser = localUsers.find(u => 
    u.username.toLowerCase() === username.toLowerCase() && 
    u.password === password
  );

  if (localUser) {
    const { password: _, ...userWithoutPassword } = localUser;
    userWithoutPassword.last_login = new Date().toISOString();
    
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(userWithoutPassword));
    
    GameState.user = userWithoutPassword;
    GameState.score = userWithoutPassword.score || 0;
    GameState.coin = userWithoutPassword.coin || 1000;
    GameState.monsterLevel = userWithoutPassword.monster_level || 1;
    GameState.inventory = userWithoutPassword.inventory ? JSON.parse(userWithoutPassword.inventory) : [];
    GameState.apiAvailable = false;

    log('✅ User logged in locally:', username);
    return { success: true, user: userWithoutPassword, message: 'Login berhasil! (Local Mode)' };
  }

  return { success: false, message: 'Username atau password salah' };
}

/**
 * Logout user with final sync
 */
async function logout() {
  if (confirm('Yakin ingin logout?')) {
    // Stop realtime sync
    RealtimeSync.stop();
    
    // Final save
    await saveProgress(true);
    
    // Clear local storage
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    localStorage.removeItem(CONFIG.INVENTORY_KEY);
    
    // Reset game state
    GameState.user = null;
    GameState.score = 0;
    GameState.coin = 0;
    GameState.inventory = [];
    
    if (GameState.autoTapInterval) {
      clearInterval(GameState.autoTapInterval);
      GameState.autoTapInterval = null;
    }
    
    window.location.href = 'index.html';
  }
}

// ============================================
// GAME PROGRESS - Realtime Save/Load
// ============================================

/**
 * Save user progress to Google Sheets (Realtime)
 * @param {boolean} immediate - Skip debounce and save immediately
 * @returns {Promise<object>} - Save result
 */
async function saveProgress(immediate = false) {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  const data = {
    username: user.username,
    score: GameState.score,
    coin: GameState.coin,
    monster_level: GameState.monsterLevel,
    vip_status: user.vip_status,
    inventory: JSON.stringify(GameState.inventory),
    last_updated: new Date().toISOString()
  };

  // Update local storage immediately
  user.score = GameState.score;
  user.coin = GameState.coin;
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(user));
  localStorage.setItem(CONFIG.INVENTORY_KEY, JSON.stringify(GameState.inventory));

  // Try to save to API
  try {
    const result = await apiRequest('saveProgress', data);
    
    if (result.success) {
      GameState.apiAvailable = true;
      
      // Update leaderboard
      await updateLeaderboard();
      
      if (immediate) {
        log('💾 Progress saved to cloud');
      }
      
      return { success: true, message: 'Progress saved!' };
    }
  } catch (error) {
    log('Cloud save failed:', error);
  }

  // Fallback to local save
  updateLocalUser({
    ...user,
    score: GameState.score,
    coin: GameState.coin,
    monster_level: GameState.monsterLevel,
    inventory: JSON.stringify(GameState.inventory)
  });

  GameState.apiAvailable = false;
  return { success: true, local: true, message: 'Progress saved locally' };
}

/**
 * Load user progress from Google Sheets
 * @returns {Promise<object>} - Load result
 */
async function loadProgress() {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('getUserData', { username: user.username });

    if (result.success && result.data) {
      const serverData = result.data;
      
      // Update game state with server data
      GameState.score = serverData.score || 0;
      GameState.coin = serverData.coin || 1000;
      GameState.monsterLevel = serverData.monster_level || 1;
      GameState.inventory = serverData.inventory ? JSON.parse(serverData.inventory) : [];
      GameState.apiAvailable = true;

      // Update local storage
      user.score = GameState.score;
      user.coin = GameState.coin;
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(user));
      localStorage.setItem(CONFIG.INVENTORY_KEY, JSON.stringify(GameState.inventory));

      // Apply inventory effects
      applyInventoryEffects();

      log('📥 Data loaded from server');
      return { success: true, data: serverData };
    }
  } catch (error) {
    log('Cloud load failed:', error);
  }

  // Fallback to local data
  const localUser = getLocalUserByUsername(user.username);
  if (localUser) {
    GameState.score = localUser.score || 0;
    GameState.coin = localUser.coin || 1000;
    GameState.monsterLevel = localUser.monster_level || 1;
    GameState.inventory = localUser.inventory ? JSON.parse(localUser.inventory) : [];
    GameState.apiAvailable = false;

    applyInventoryEffects();

    return { success: true, local: true, data: localUser };
  }

  return { success: false, message: 'Failed to load progress' };
}

// ============================================
// LEADERBOARD - Realtime
// ============================================

/**
 * Get leaderboard data from Google Sheets
 * @returns {Promise<object>} - Leaderboard data
 */
async function getLeaderboard() {
  try {
    const result = await apiRequest('getLeaderboard', { limit: 50 });

    if (result.success && result.leaderboard) {
      GameState.apiAvailable = true;
      return { 
        success: true, 
        leaderboard: result.leaderboard,
        lastUpdated: result.lastUpdated 
      };
    }
  } catch (error) {
    log('Leaderboard API failed:', error);
  }

  // Fallback to local leaderboard
  return getLocalLeaderboard();
}

/**
 * Get local leaderboard (fallback)
 */
function getLocalLeaderboard() {
  const localUsers = getAllLocalUsers();
  const localLeaderboard = localUsers
    .map(u => ({
      rank: 0,
      username: u.username,
      score: u.score || 0,
      vip_status: u.vip_status || 'none',
      vip: u.vip_status !== 'none'
    }))
    .sort((a, b) => b.score - a.score)
    .map((u, i) => ({ ...u, rank: i + 1 }))
    .slice(0, 50);

  // Demo data if empty
  if (localLeaderboard.length === 0) {
    return {
      success: true,
      local: true,
      leaderboard: [
        { rank: 1, username: 'WarriorKing', score: 50000, vip_status: 'permanent', vip: true },
        { rank: 2, username: 'TapMaster', score: 45000, vip_status: 'none', vip: false },
        { rank: 3, username: 'MonsterSlayer', score: 42000, vip_status: 'monthly', vip: true },
        { rank: 4, username: 'CoinCollector', score: 40000, vip_status: 'none', vip: false },
        { rank: 5, username: 'BattleHero', score: 38000, vip_status: 'none', vip: false },
        { rank: 6, username: 'SpeedTapper', score: 35000, vip_status: 'weekly', vip: true },
        { rank: 7, username: 'EpicGamer', score: 32000, vip_status: 'none', vip: false },
        { rank: 8, username: 'TapLegend', score: 30000, vip_status: 'none', vip: false },
        { rank: 9, username: 'WarriorPro', score: 28000, vip_status: 'none', vip: false },
        { rank: 10, username: 'GameMaster', score: 25000, vip_status: 'monthly', vip: true }
      ]
    };
  }

  return { success: true, local: true, leaderboard: localLeaderboard };
}

/**
 * Update leaderboard score
 * @returns {Promise<object>} - Update result
 */
async function updateLeaderboard() {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('updateLeaderboard', {
      username: user.username,
      score: GameState.score,
      vip_status: user.vip_status,
      last_updated: new Date().toISOString()
    });

    if (result.success) {
      GameState.apiAvailable = true;
      return result;
    }
  } catch (error) {
    log('Leaderboard update failed:', error);
  }

  // Fallback to local leaderboard
  const leaderboard = JSON.parse(localStorage.getItem(CONFIG.LEADERBOARD_KEY) || '[]');
  const index = leaderboard.findIndex(e => e.username.toLowerCase() === user.username.toLowerCase());
  
  const entry = {
    rank: 0,
    username: user.username,
    score: GameState.score,
    vip_status: user.vip_status,
    vip: user.vip_status !== 'none',
    last_updated: new Date().toISOString()
  };

  if (index !== -1) {
    leaderboard[index] = entry;
  } else {
    leaderboard.push(entry);
  }

  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard.forEach((e, i) => e.rank = i + 1);
  
  localStorage.setItem(CONFIG.LEADERBOARD_KEY, JSON.stringify(leaderboard));

  return { success: true, local: true };
}

// ============================================
// TRANSACTIONS - Shop Purchases
// ============================================

/**
 * Record transaction in Google Sheets
 * @param {object} item - Purchased item
 * @returns {Promise<object>} - Transaction result
 */
async function recordTransaction(item) {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  const transactionData = {
    id: Date.now().toString(),
    username: user.username,
    item_name: item.name,
    price: item.price,
    transaction_date: new Date().toISOString(),
    type: 'purchase',
    status: 'success'
  };

  try {
    const result = await apiRequest('recordTransaction', transactionData);
    if (result.success) {
      return result;
    }
  } catch (error) {
    log('Transaction API failed:', error);
  }

  // Fallback to local
  const transactions = JSON.parse(localStorage.getItem(CONFIG.TRANSACTIONS_KEY) || '[]');
  transactions.push(transactionData);
  localStorage.setItem(CONFIG.TRANSACTIONS_KEY, JSON.stringify(transactions));

  return { success: true, local: true };
}

/**
 * Get user transactions
 * @returns {Promise<object>} - User transactions
 */
async function getUserTransactions() {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('getTransactions', { username: user.username });
    if (result.success) {
      return result;
    }
  } catch (error) {
    log('Get transactions API failed:', error);
  }

  // Fallback to local
  const transactions = JSON.parse(localStorage.getItem(CONFIG.TRANSACTIONS_KEY) || '[]');
  const userTransactions = transactions.filter(t => 
    t.username.toLowerCase() === user.username.toLowerCase()
  );

  return { success: true, local: true, transactions: userTransactions };
}

// ============================================
// WITHDRAWALS
// ============================================

/**
 * Request withdrawal
 * @param {number} amount - Amount to withdraw
 * @param {string} paymentMethod - Payment method (Dana, OVO, Gopay)
 * @returns {Promise<object>} - Withdrawal result
 */
async function requestWithdrawal(amount, paymentMethod) {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  if (GameState.coin < amount) {
    return { success: false, message: 'Koin tidak cukup' };
  }

  const withdrawalData = {
    id: Date.now().toString(),
    username: user.username,
    amount: amount,
    payment_method: paymentMethod,
    request_date: new Date().toISOString(),
    status: 'pending',
    admin_notes: ''
  };

  try {
    const result = await apiRequest('requestWithdrawal', withdrawalData);
    if (result.success) {
      // Deduct coins
      GameState.coin -= amount;
      await saveProgress();
      return { success: true, message: 'Permintaan withdrawal dikirim!' };
    }
  } catch (error) {
    log('Withdrawal API failed:', error);
  }

  // Fallback to local
  const withdrawals = JSON.parse(localStorage.getItem('tapTapWarWithdrawals') || '[]');
  withdrawals.push(withdrawalData);
  localStorage.setItem('tapTapWarWithdrawals', JSON.stringify(withdrawals));

  GameState.coin -= amount;
  await saveProgress();

  return { success: true, local: true, message: 'Permintaan withdrawal disimpan (Local Mode)' };
}

/**
 * Get user withdrawals
 * @returns {Promise<object>} - User withdrawals
 */
async function getUserWithdrawals() {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  try {
    const result = await apiRequest('getWithdrawals', { username: user.username });
    if (result.success) {
      return result;
    }
  } catch (error) {
    log('Get withdrawals API failed:', error);
  }

  // Fallback to local
  const withdrawals = JSON.parse(localStorage.getItem('tapTapWarWithdrawals') || '[]');
  const userWithdrawals = withdrawals.filter(w => 
    w.username.toLowerCase() === user.username.toLowerCase()
  );

  return { success: true, local: true, withdrawals: userWithdrawals };
}

// ============================================
// CHAT SYSTEM - Realtime
// ============================================

/**
 * Send chat message
 * @param {string} message - Message to send
 * @returns {Promise<object>} - Send result
 */
async function sendChatMessage(message) {
  const user = getCurrentUser();
  if (!user) return { success: false, message: 'Not logged in' };

  if (!message || message.trim().length === 0) {
    return { success: false, message: 'Pesan tidak boleh kosong' };
  }

  const chatData = {
    id: Date.now().toString(),
    username: user.username,
    message: message.trim(),
    timestamp: new Date().toISOString(),
    status: 'visible'
  };

  try {
    const result = await apiRequest('sendChat', chatData);
    if (result.success) {
      return result;
    }
  } catch (error) {
    log('Send chat API failed:', error);
  }

  // Fallback to local
  const chats = JSON.parse(localStorage.getItem(CONFIG.CHAT_KEY) || '[]');
  chats.push(chatData);
  if (chats.length > 100) chats.shift();
  localStorage.setItem(CONFIG.CHAT_KEY, JSON.stringify(chats));

  return { success: true, local: true };
}

/**
 * Get chat messages
 * @param {number} limit - Number of messages to fetch
 * @returns {Promise<object>} - Chat messages
 */
async function getChatMessages(limit = 50) {
  try {
    const result = await apiRequest('getChat', { limit });
    if (result.success && result.messages) {
      return result;
    }
  } catch (error) {
    log('Get chat API failed:', error);
  }

  // Fallback to local
  const chats = JSON.parse(localStorage.getItem(CONFIG.CHAT_KEY) || '[]');
  
  // Add demo messages if empty
  if (chats.length === 0) {
    const demoChats = [
      { id: '1', username: 'WarriorKing', message: 'Halo semua!', timestamp: new Date(Date.now() - 3600000).toISOString() },
      { id: '2', username: 'TapMaster', message: 'Semangat mainnya!', timestamp: new Date(Date.now() - 3000000).toISOString() },
      { id: '3', username: 'MonsterSlayer', message: 'Baru mencapai level 50!', timestamp: new Date(Date.now() - 1800000).toISOString() }
    ];
    localStorage.setItem(CONFIG.CHAT_KEY, JSON.stringify(demoChats));
    return { success: true, local: true, messages: demoChats.slice(-limit) };
  }

  return { success: true, local: true, messages: chats.slice(-limit) };
}

// ============================================
// AUTHENTICATION HELPERS
// ============================================

function getCurrentUser() {
  const userData = localStorage.getItem(CONFIG.STORAGE_KEY);
  return userData ? JSON.parse(userData) : null;
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

  showToast('Sedang login...', 'success');
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

  showToast('Membuat akun...', 'success');
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
// GAME FUNCTIONS - Realtime
// ============================================

function initGame() {
  if (!requireAuth()) return;

  // Initialize local database
  initLocalDatabase();

  const user = getCurrentUser();
  GameState.user = user;
  GameState.score = user.score || 0;
  GameState.coin = user.coin || 1000;
  GameState.monsterLevel = user.monster_level || 1;

  // Load inventory
  const savedInventory = localStorage.getItem(CONFIG.INVENTORY_KEY);
  if (savedInventory) {
    GameState.inventory = JSON.parse(savedInventory);
    applyInventoryEffects();
  }

  // Load from cloud
  loadProgress().then(() => {
    updateGameUI();
    spawnMonster();
  });

  // Start realtime sync
  RealtimeSync.start();

  // Setup auto-save interval
  setInterval(() => {
    saveProgress();
  }, CONFIG.AUTO_SAVE_INTERVAL);

  // Setup monster click
  const monsterBox = document.getElementById('monster-box');
  if (monsterBox) {
    monsterBox.addEventListener('click', tapMonster);
  }

  // Online status indicator
  updateOnlineStatus();
  setInterval(updateOnlineStatus, 5000);

  log('🎮 Game initialized');
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
      statusText.textContent = '🔴 Offline Mode';
    }
  }
  
  if (lastSync && GameState.lastSync) {
    const syncTime = new Date(GameState.lastSync);
    lastSync.textContent = 'Terakhir sync: ' + syncTime.toLocaleTimeString('id-ID');
  }
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

  updateVIPBadge();
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

function initShop() {
  if (!requireAuth()) return;

  // Initialize local database
  initLocalDatabase();

  const user = getCurrentUser();
  GameState.user = user;
  GameState.coin = user.coin || 1000;

  // Load inventory
  const savedInventory = localStorage.getItem(CONFIG.INVENTORY_KEY);
  if (savedInventory) {
    GameState.inventory = JSON.parse(savedInventory);
  }

  updateCoinDisplay();
  renderShop();
}

function renderShop() {
  const grid = document.getElementById('shop-grid');
  if (!grid) return;

  const items = currentFilter === 'all'
    ? SHOP_ITEMS
    : SHOP_ITEMS.filter(item => item.type === currentFilter);

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
  const item = SHOP_ITEMS.find(i => i.id === itemId);
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
    GameState.coin -= item.price;
    GameState.inventory.push({
      item: item.name,
      purchased: new Date().toISOString(),
      effect: item.effect,
      value: item.value
    });

    applyItemEffect(item);

    GameState.user.coin = GameState.coin;
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(GameState.user));
    localStorage.setItem(CONFIG.INVENTORY_KEY, JSON.stringify(GameState.inventory));

    // Record transaction
    await recordTransaction(item);

    // Update user in database
    updateLocalUser({
      ...GameState.user,
      coin: GameState.coin,
      inventory: JSON.stringify(GameState.inventory)
    });

    updateCoinDisplay();
    renderShop();
    showToast(`Berhasil membeli ${item.name}!`, 'success');

    saveProgress(true);
  }
}

function applyItemEffect(item) {
  switch (item.effect) {
    case 'power':
      GameState.powerMultiplier = item.value;
      break;
    case 'autotap':
      if (!GameState.autoTapInterval) {
        GameState.autoTapInterval = setInterval(() => {
          tapMonster();
        }, item.value);
      }
      break;
    case 'critical':
      GameState.criticalChance = item.value;
      break;
    case 'coin':
      GameState.coinMultiplier = item.value;
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
// LEADERBOARD FUNCTIONS - Realtime
// ============================================

async function loadLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;

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
// CHAT FUNCTIONS - Realtime
// ============================================

let chatInterval = null;

async function initChat() {
  await loadChatMessages();
  
  // Start realtime chat refresh
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

  // Auto scroll to bottom
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

function initPage() {
  // Initialize local database
  initLocalDatabase();

  const path = window.location.pathname;
  const page = path.split('/').pop() || 'index.html';

  switch (page) {
    case 'login.html':
      if (isLoggedIn()) {
        window.location.href = 'game.html';
      }
      break;

    case 'register.html':
      if (isLoggedIn()) {
        window.location.href = 'game.html';
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

    case 'chat.html':
      initChat();
      break;

    case 'index.html':
    default:
      // Update navbar based on login status
      updateNavbar();
      break;
  }
}

/**
 * Update navbar based on login status
 */
function updateNavbar() {
  const navLinks = document.querySelector('.nav-links');
  if (navLinks && isLoggedIn()) {
    const user = getCurrentUser();
    navLinks.innerHTML = `
      <a href="index.html" class="nav-link active">Home</a>
      <a href="game.html" class="nav-link">Game</a>
      <a href="leaderboard.html" class="nav-link">Leaderboard</a>
      <a href="shop.html" class="nav-link">Shop</a>
      <span style="color: var(--text-secondary); font-weight: 500;">👤 ${user.username}</span>
    `;
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
  RealtimeSync.stop();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && GameState.user) {
    saveProgress(true);
  } else if (document.visibilityState === 'visible' && GameState.user) {
    RealtimeSync.start();
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
    background: #34C759;
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
window.requestWithdrawal = requestWithdrawal;
window.getUserWithdrawals = getUserWithdrawals;
window.getUserTransactions = getUserTransactions;

console.log('🎮 TAP TAP WAR - Ready for Google Sheets Integration!');
console.log('⚠️  Jangan lupa update CONFIG.API_URL dengan URL Google Apps Script Anda!');
