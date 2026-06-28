// Discrete Math Quiz Application Logic

// --- State Variables ---
let currentCategory = 'all'; // 'all', 'judgment', 'single_choice', 'fill_blank', 'subjective', 'bookmarks'
let currentMode = 'practice'; // 'practice', 'exam'
let currentQuestionIndex = 0;

// User Data Store (Persisted via localStorage)
// --- Settings & Shuffled cache state ---
let practiceSettings = {
  autoNext: false,
  randomOrder: false,
  hideCorrect: false
};

let cfCountdownInterval = null;

let shuffledQuestionsCache = null;
let radarChartInstance = null;
let currentAiQuestion = null;
let aiConversationHistory = [];
let lastFilteredIdsKey = ""; // To track if the pool changed

function loadSettings() {
  const saved = localStorage.getItem('dm_quiz_settings');
  if (saved) {
    try {
      practiceSettings = JSON.parse(saved);
    } catch(e) {
      console.error("Error loading settings", e);
    }
  }
}

function saveSettings() {
  localStorage.setItem('dm_quiz_settings', JSON.stringify(practiceSettings));
}

// Simple Fisher-Yates shuffle helper
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let userData = {
  bookmarks: [], // Array of question IDs: 'cat_originalnum' e.g. 'judgment_1'
  wrongQuestions: [], // Auto-added incorrect questions
  answered: {},  // Map of question ID -> { userAns: '', isCorrect: true/false }
  examHistory: []
};

// Exam State
let examState = {
  isActive: false,
  questions: [], // 15 selected questions
  answers: {},   // Map of index -> user answer
  timerId: null,
  secondsRemaining: 1800, // 30 minutes
  completed: false,
  subjectiveGrading: {} // Map of index -> true/false
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  loadUserData();
  setupSidebarCounts();
  setupCategoryNavigation();
  setupModeToggle();
  setupTheme();
  setupAuthEvents();
  checkAuthStatus();
  loadSettings();
  setupSettingsEvents();
  
  // Setup Floating AI Tutor Overlay
  setupFloatingAiTutor();
  
  // Render initial viewport
  renderViewport();
  
  // Toast container setup
  const toast = document.getElementById('toast');
  toast.addEventListener('transitionend', () => {
    if (!toast.classList.contains('show')) {
      toast.style.display = 'none';
    }
  });
});

// --- User Data Persistence ---
function loadUserData() {
  const savedData = localStorage.getItem('dm_quiz_user_data');
  if (savedData) {
    try {
      userData = JSON.parse(savedData);
      if (!userData.bookmarks) userData.bookmarks = [];
      if (!userData.wrongQuestions) userData.wrongQuestions = [];
      if (!userData.answered) userData.answered = {};
      if (!userData.examHistory) userData.examHistory = [];
    } catch (e) {
      console.error('Error parsing user data, resetting...', e);
    }
  }
  updateStatsDashboard();
}

let syncTimeoutId = null;

function saveUserData(forceSync = false) {
  localStorage.setItem('dm_quiz_user_data', JSON.stringify(userData));
  updateStatsDashboard();
  setupSidebarCounts();
  
  // Trigger background cloud sync with 10s debounce to optimize KV/R2 writes
  if (localStorage.getItem('dm_jwt_token')) {
    if (syncTimeoutId) {
      clearTimeout(syncTimeoutId);
      syncTimeoutId = null;
    }
    
    if (forceSync) {
      syncUserData();
    } else {
      syncTimeoutId = setTimeout(() => {
        syncUserData();
      }, 10000); // 10 seconds debounce
    }
  }
}

function updateStatsDashboard() {
  // Total questions
  document.getElementById('stat-total-q').innerText = QUESTIONS.length;
  
  // Answered questions
  const answeredCount = Object.keys(userData.answered).length;
  document.getElementById('stat-answered').innerText = answeredCount;
  
  // Accuracy
  let correctCount = 0;
  let gradedCount = 0;
  for (const key in userData.answered) {
    gradedCount++;
    if (userData.answered[key].isCorrect) {
      correctCount++;
    }
  }
  const accuracy = gradedCount > 0 ? Math.round((correctCount / gradedCount) * 100) : 0;
  document.getElementById('stat-accuracy').innerText = `${accuracy}%`;
  
  // Wrong questions count
  const wrongCountEl = document.getElementById('stat-wrong-questions');
  if (wrongCountEl) {
    wrongCountEl.innerText = userData.wrongQuestions.length;
  }
  
  // Bookmark count
  document.getElementById('stat-bookmarks').innerText = userData.bookmarks.length;
  
  // Dynamic UI updates for Mastery cards and Radar chart
  updateMasteryPanel();
  updateRadarChart();
}

function updateMasteryPanel() {
  const propPctEl = document.getElementById('mastery-prop-pct');
  const propBarEl = document.getElementById('mastery-prop-bar');
  const propAnsweredEl = document.getElementById('mastery-prop-answered');
  const propCorrectEl = document.getElementById('mastery-prop-correct');
  
  const predPctEl = document.getElementById('mastery-pred-pct');
  const predBarEl = document.getElementById('mastery-pred-bar');
  const predAnsweredEl = document.getElementById('mastery-pred-answered');
  const predCorrectEl = document.getElementById('mastery-pred-correct');
  
  if (!propPctEl || !predPctEl) return;
  
  const propTotal = 26;
  const predTotal = 30;
  
  let propAnswered = 0;
  let propCorrect = 0;
  let predAnswered = 0;
  let predCorrect = 0;
  
  for (const qKey in userData.answered) {
    const qObj = QUESTIONS.find(q => `${q.category}_${q.original_num}` === qKey);
    if (qObj) {
      if (qObj.topic === 'propositional_logic') {
        propAnswered++;
        if (userData.answered[qKey].isCorrect) propCorrect++;
      } else if (qObj.topic === 'predicate_logic') {
        predAnswered++;
        if (userData.answered[qKey].isCorrect) predCorrect++;
      }
    }
  }
  
  const propPctVal = Math.round((propCorrect / propTotal) * 100);
  const propCorrectRate = propAnswered > 0 ? Math.round((propCorrect / propAnswered) * 100) : 0;
  
  propPctEl.innerText = `${propPctVal}%`;
  if (propBarEl) propBarEl.style.width = `${propPctVal}%`;
  propAnsweredEl.innerText = `已答: ${propAnswered}/${propTotal}`;
  propCorrectEl.innerText = `正确率: ${propCorrectRate}%`;
  
  const predPctVal = Math.round((predCorrect / predTotal) * 100);
  const predCorrectRate = predAnswered > 0 ? Math.round((predCorrect / predAnswered) * 100) : 0;
  
  predPctEl.innerText = `${predPctVal}%`;
  if (predBarEl) predBarEl.style.width = `${predPctVal}%`;
  predAnsweredEl.innerText = `已答: ${predAnswered}/${predTotal}`;
  predCorrectEl.innerText = `正确率: ${predCorrectRate}%`;
}

// Helper to generate unique ID for questions
function getQuestionId(q) {
  return `${q.category}_${q.original_num}_${q.question.substring(0, 10).replace(/[^a-zA-Z0-9]/g, '')}`;
}

// Get lists of questions filtered by currentCategory
function getFilteredQuestions() {

  if (currentCategory === 'bookmarks') {
    return QUESTIONS.filter(q => userData.bookmarks.includes(getQuestionId(q)));
  }
  if (currentCategory === 'wrong_questions') {
    return QUESTIONS.filter(q => userData.wrongQuestions.includes(getQuestionId(q)));
  }
  if (currentCategory === 'all') {
    return QUESTIONS;
  }
  if (currentCategory === 'subjective') {
    return QUESTIONS.filter(q => ['calculation', 'proof', 'application'].includes(q.category));
  }
  return QUESTIONS.filter(q => q.category === currentCategory);
}

// --- Theme Setup ---
function setupTheme() {
  const toggleBtn = document.getElementById('theme-toggle');
  const sunIcon = document.getElementById('theme-sun');
  const moonIcon = document.getElementById('theme-moon');
  const themeText = document.getElementById('theme-text');
  
  // Get active theme
  const activeTheme = localStorage.getItem('dm_theme') || 'light';
  document.documentElement.setAttribute('data-theme', activeTheme);
  updateThemeUI(activeTheme);
  
  toggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('dm_theme', newTheme);
    updateThemeUI(newTheme);
    showToast(`已切换至${newTheme === 'dark' ? '深色' : '浅色'}模式`, 'info');
  });
  
  function updateThemeUI(theme) {
    if (theme === 'dark') {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
      themeText.innerText = '切换日间模式';
    } else {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
      themeText.innerText = '切换夜间模式';
    }
  }
}

// --- Navigation & Sidebar Counts ---
function setupSidebarCounts() {
  document.getElementById('count-all').innerText = QUESTIONS.length;
  document.getElementById('count-judgment').innerText = QUESTIONS.filter(q => q.category === 'judgment').length;
  document.getElementById('count-single_choice').innerText = QUESTIONS.filter(q => q.category === 'single_choice').length;
  document.getElementById('count-fill_blank').innerText = QUESTIONS.filter(q => q.category === 'fill_blank').length;
  document.getElementById('count-subjective').innerText = QUESTIONS.filter(q => ['calculation', 'proof', 'application'].includes(q.category)).length;
  
  const countWrongEl = document.getElementById('count-wrong-questions');
  if (countWrongEl) {
    countWrongEl.innerText = userData.wrongQuestions.length;
  }
  document.getElementById('count-bookmarks').innerText = userData.bookmarks.length;
}

function setupCategoryNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      if (examState.isActive) {
        if (!confirm('正在考试中，切换分类将退出考试且不保存当前进度，是否确认退出？')) {
          return;
        }
        exitExam();
      }
      
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      
      currentCategory = item.getAttribute('data-category');
      currentQuestionIndex = 0;
      
      // Update Title & Subtitle
      const titleEl = document.getElementById('view-title');
      const subtitleEl = document.getElementById('view-subtitle');
      
      const cnName = item.querySelector('span').innerText;
      titleEl.innerText = cnName;
      
      if (currentCategory === 'leaderboard') {
        subtitleEl.innerText = '全站刷题与考试积分高分榜前50名';
      } else if (currentCategory === 'profile') {
        subtitleEl.innerText = '查看您的个人做题战绩、连续打卡天数与账号同步状态';
      } else {
        const count = getFilteredQuestions().length;
        subtitleEl.innerText = `当前分类下共收录了 ${count} 道题目`;
      }
      
      renderViewport();
    });
  });
}

function setupModeToggle() {
  const modeBtns = document.querySelectorAll('#mode-selector .segment-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetMode = btn.getAttribute('data-mode');
      if (currentMode === targetMode) return;
      
      if (examState.isActive && targetMode === 'practice') {
        if (!confirm('正在模拟考试中，切换到刷题模式将中断本次考试，是否继续？')) {
          return;
        }
        exitExam();
      }
      
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      currentMode = targetMode;
      currentQuestionIndex = 0;
      renderViewport();
    });
  });
}

// --- Viewport Rendering Dispatcher ---
function renderViewport() {
  const container = document.getElementById('viewport');
  container.innerHTML = '';
  

  
  const statsPanel = document.getElementById('stats-panel');
  const masteryPanel = document.getElementById('mastery-panel');
  
  // If leaderboard, profile, exam or retake is active, hide dashboard metrics
  const hideMetrics = (currentCategory === 'leaderboard' || currentCategory === 'profile' || currentMode === 'exam' || currentCategory === 'bookmarks_retake');
  
  if (statsPanel) statsPanel.style.display = hideMetrics ? 'none' : 'grid';
  if (masteryPanel) masteryPanel.style.display = hideMetrics ? 'none' : 'grid';
  
  if (currentCategory === 'leaderboard') {
    renderLeaderboardView(container);
    return;
  }
  
  if (currentCategory === 'profile') {
    renderProfileView(container);
    return;
  }
  
  if (currentMode === 'practice') {
    renderPracticeMode(container);
  } else {
    renderExamMode(container);
  }
}

// --- Profile Details View ---
function renderProfileView(container) {
  const isLoggedIn = !!localStorage.getItem('dm_jwt_token');
  
  if (!isLoggedIn) {
    container.innerHTML = `
      <div class="empty-bookmarks-card" style="max-width: 600px; text-align: center; gap: 1.25rem; margin: 2rem auto;">
        <div class="empty-icon" style="background-color: var(--primary-light); color: var(--primary); margin: 0 auto;">🔒</div>
        <h2>个人中心未激活</h2>
        <p style="color: var(--text-secondary); max-width: 420px; margin: 0 auto;">
          登录后可解锁个人专属详细页面，查看学习时长、打卡进度、高分榜记录并开启云端实时备份！
        </p>
        <button class="btn btn-primary" onclick="document.getElementById('login-trigger-btn').click()" style="padding: 0.65rem 1.5rem; margin-top: 0.5rem; align-self: center;">
          立即登录 / 注册
        </button>
      </div>
    `;
    return;
  }
  
  // Calculate statistics
  const answeredKeys = Object.keys(userData.answered);
  const totalAnswered = answeredKeys.length;
  let correctCount = 0;
  answeredKeys.forEach(key => {
    if (userData.answered[key].isCorrect) correctCount++;
  });
  const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
  const streak = userData.streak || 0;
  const examHighScore = userData.examHighScore || 0;
  const bookmarksCount = userData.bookmarks.length;
  
  const savedProfile = localStorage.getItem('dm_user_profile');
  const profile = savedProfile ? JSON.parse(savedProfile) : {};
  const username = profile.username || '同学';
  
  container.innerHTML = `
    <div class="profile-container" style="max-width: 650px; margin: 1rem auto; display: flex; flex-direction: column; gap: 1.5rem; animation: fadeIn 0.4s ease;">
      <!-- Profile Banner Card -->
      <div class="dashboard-card" style="display: flex; gap: 1.5rem; align-items: center; padding: 1.75rem 2rem; background: linear-gradient(135deg, var(--bg-secondary), var(--bg-primary)); border: 1px solid var(--border-color); border-radius: var(--radius-lg); position: relative; overflow: hidden; box-shadow: var(--shadow-md);">
        <div style="position: absolute; right: -10px; top: -10px; font-size: 6rem; opacity: 0.04; pointer-events: none; user-select: none;">🎓</div>
        <div style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--accent)); color: white; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 800; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);">
          ${username[0].toUpperCase()}
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.3rem;">
          <h2 style="margin: 0; font-size: 1.3rem; font-weight: 800; color: var(--text-primary);">${username}</h2>
          <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: var(--text-muted);">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #10B981;"></span>
            <span>已开启云端实时备份</span>
          </div>
        </div>
      </div>

      <!-- Statistics Grid -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
        <div class="dashboard-card" style="padding: 1.25rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; text-align: center; box-shadow: var(--shadow-sm);">
          <span style="font-size: 1.6rem;">🔥</span>
          <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted);">连续学习</span>
          <span style="font-size: 1.3rem; font-weight: 800; color: var(--primary);">${streak} 天</span>
        </div>
        <div class="dashboard-card" style="padding: 1.25rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; text-align: center; box-shadow: var(--shadow-sm);">
          <span style="font-size: 1.6rem;">🎯</span>
          <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted);">答题正确率</span>
          <span style="font-size: 1.3rem; font-weight: 800; color: var(--success);">${accuracy}%</span>
        </div>
        <div class="dashboard-card" style="padding: 1.25rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; text-align: center; box-shadow: var(--shadow-sm);">
          <span style="font-size: 1.6rem;">🏆</span>
          <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted);">考场最高分</span>
          <span style="font-size: 1.3rem; font-weight: 800; color: var(--warning);">${examHighScore} 分</span>
        </div>
      </div>

      <!-- Detail Card -->
      <div class="dashboard-card" style="padding: 1.5rem; box-shadow: var(--shadow-sm);">
        <h3 style="margin-top: 0; font-size: 0.95rem; font-weight: 800; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.6rem; margin-bottom: 1rem;">
          📊 个人刷题成就
        </h3>
        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
            <span style="color: var(--text-secondary); font-weight: 600;">已答题目总数：</span>
            <span style="font-weight: 800; color: var(--text-primary);">${totalAnswered} 题</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
            <span style="color: var(--text-secondary); font-weight: 600;">正确解答题数：</span>
            <span style="font-weight: 800; color: var(--success);">${correctCount} 题</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
            <span style="color: var(--text-secondary); font-weight: 600;">错题及收藏夹：</span>
            <span style="font-weight: 800; color: var(--error);">${bookmarksCount} 题</span>
          </div>
        </div>
      </div>

      <!-- Cloudflare Workers/Pages Usage Monitoring Card -->
      <div id="cf-usage-container"></div>

      <!-- Quick Actions -->
      <div class="dashboard-card" style="padding: 1.5rem; box-shadow: var(--shadow-sm);">
        <h3 style="margin-top: 0; font-size: 0.95rem; font-weight: 800; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.6rem; margin-bottom: 1rem;">
          ⚙️ 账户选项
        </h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; margin-bottom: 0.75rem;">
          <button class="btn btn-outline" onclick="document.getElementById('settings-trigger-btn').click()" style="padding: 0.65rem; font-size: 0.85rem; font-weight: 700; cursor: pointer;">
            ⚙️ 刷题首选项
          </button>
          <button class="btn btn-outline" id="profile-logout-btn" style="color: var(--text-primary); border-color: var(--border-color); padding: 0.65rem; font-size: 0.85rem; font-weight: 700; cursor: pointer;">
            🚪 退出当前登录
          </button>
        </div>
        <button class="btn btn-outline" id="profile-delete-btn" style="color: var(--error); border-color: rgba(239, 68, 68, 0.35); width: 100%; padding: 0.65rem; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all var(--transition-fast);">
          ⚠️ 注销此账号 (彻底清除云端数据)
        </button>
      </div>
    </div>
  `;
  
  // Bind Logout
  container.querySelector('#profile-logout-btn').addEventListener('click', () => {
    document.getElementById('logout-btn').click();
  });

  // Load and Render Cloudflare Usage Dashboard
  renderCloudflareUsageCard(container);

  // Bind Account Deletion
  const deleteBtn = container.querySelector('#profile-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const firstConfirm = confirm('⚠️ 警告：您正在请求注销该离散数学刷题账户！\\n\\n注销后：\\n1. 您的用户名与账户将被立即注销释放。\\n2. 您的云端刷题进度、打卡天数和错题藏书将被永久彻底抹除。\\n\\n您确定要继续吗？');
      if (!firstConfirm) return;
      
      const secondConfirm = confirm('⚠️ 再次确认：此操作不可撤销，云端数据将彻底被粉碎！\\n\\n您真的确定要彻底注销此账号吗？');
      if (!secondConfirm) return;
      
      const token = localStorage.getItem('dm_jwt_token');
      if (!token) return;
      
      try {
        const response = await fetch(`${API_BASE}/auth/delete`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        
        const result = await response.json();
        if (response.ok) {
          localStorage.removeItem('dm_jwt_token');
          localStorage.removeItem('dm_user_profile');
          userData.answered = {};
          userData.bookmarks = [];
          userData.streak = 0;
          userData.lastStudyDate = "";
          userData.examHistory = [];
          userData.examHighScore = 0;
          saveUserData();
          
          showToast('账号注销成功，所有本地及云端数据已彻底擦除！', 'success');
          
          currentCategory = 'all';
          checkAuthStatus();
          updateStatsDashboard();
          setupSidebarCounts();
          
          document.querySelectorAll('.nav-item').forEach(n => {
            n.classList.remove('active');
            if (n.getAttribute('data-category') === 'all') {
              n.classList.add('active');
            }
          });
          
          renderViewport();
        } else {
          showToast(result.error || '注销失败，请稍后重试！', 'error');
        }
      } catch (err) {
        showToast('连接账户中心失败，请检查网络！', 'error');
      }
    });
  }
}

// --- LaTeX Rendering Math Helper ---
function renderMath(element) {
  if (window.renderMathInElement) {
    window.renderMathInElement(element, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false
    });
  }
}

// --- Toast Messages ---
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastIcon = document.getElementById('toast-icon');
  const toastMsg = document.getElementById('toast-message');
  
  toastMsg.innerText = message;
  
  if (type === 'success') {
    toastIcon.innerText = '✓';
    toastIcon.className = 'toast-icon success';
  } else if (type === 'info') {
    toastIcon.innerText = 'ℹ';
    toastIcon.className = 'toast-icon info';
  } else {
    toastIcon.innerText = '✕';
    toastIcon.className = 'toast-icon error';
  }
  
  toast.style.display = 'flex';
  // Reflow force
  toast.offsetHeight;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// ==========================================
//           PRACTICE MODE RENDERING
// ==========================================
function renderPracticeMode(container) {
  const questions = getFilteredQuestions();
  
  if (questions.length === 0) {
    // Empty state
    container.innerHTML = `
      <div class="empty-bookmarks-card">
        <div class="empty-icon">✓</div>
        <h2>这里空空如也</h2>
        <p>你在这个分类下没有任何题目。如果是错题本，赶紧去做题积累吧！</p>
      </div>
    `;
    return;
  }
  
  const q = questions[currentQuestionIndex];
  const qId = getQuestionId(q);
  
  // Check if daily challenge completed
  if (currentCategory === 'daily_challenge') {
    checkDailyChallengeCompletion();
  }
  const isBookmarked = userData.bookmarks.includes(qId);
  const userRecord = userData.answered[qId];
  
  // Create Main Card
  const card = document.createElement('div');
  card.className = 'question-card';
  
  // Card Header
  let catBadgeName = '';
  switch(q.category) {
    case 'judgment': catBadgeName = '判断题'; break;
    case 'single_choice': catBadgeName = '单项选择题'; break;
    case 'fill_blank': catBadgeName = '填空题'; break;
    case 'calculation': catBadgeName = '计算题'; break;
    case 'proof': catBadgeName = '证明题'; break;
    case 'application': catBadgeName = '应用题'; break;
  }
  
  card.innerHTML = `
    <div class="question-header">
      <div class="question-badge-row" style="width: 100%; display: flex; justify-content: space-between; align-items: center;">
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <span class="badge badge-category">${catBadgeName}</span>
          <span class="badge badge-num">题号: ${currentQuestionIndex + 1}</span>
        </div>
        <button class="btn btn-outline" id="call-ai-tutor-btn" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; font-weight: 700; border-color: var(--primary); color: var(--primary); display: flex; align-items: center; gap: 0.25rem; border-radius: 12px; cursor: pointer; transition: all var(--transition-fast);">
          <span>🤖</span> 问助教
        </button>
      </div>
      <div class="card-actions" style="margin-left: 0.5rem;">
        <button class="action-icon-btn ${isBookmarked ? 'active' : ''}" id="bookmark-btn" title="${isBookmarked ? '取消收藏' : '添加收藏'}">
          <svg viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
    
    <div class="question-body">${renderContent(q.question)}</div>
    
    <div class="question-interactive-area" id="interactive-area">
      <!-- Options or input will be rendered here -->
    </div>
    
    <div class="card-footer">
      <span class="progress-text">进度: ${currentQuestionIndex + 1} / ${questions.length}</span>
      <div class="navigation-controls">
        <button class="btn btn-outline" id="prev-btn" ${currentQuestionIndex === 0 ? 'disabled' : ''}>上一题</button>
        <button class="btn btn-outline" id="toggle-solution-btn">显示答案与解析</button>
        <button class="btn btn-primary" id="next-btn" ${currentQuestionIndex === questions.length - 1 ? 'disabled' : ''}>下一题</button>
      </div>
    </div>
    
    <div class="solution-panel" id="solution-panel" style="display: none;">
      <div class="solution-header">
        <svg viewBox="0 0 24 24"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.364-5.636l-.707-.707m1.414 14.142l.707-.707M12 21v-1m6.364-1.636l.707.707M12 6a6 6 0 00-6 6c0 1.282.4 2.47 1.084 3.447A2 2 0 018 16.586V17a2 2 0 002 2h4a2 2 0 002-2v-.414a2 2 0 01.916-1.139A6.002 6.002 0 0018 12a6 6 0 00-6-6z" stroke="currentColor" stroke-linecap="round"/></svg>
        <span>参考答案</span>
      </div>
      <div class="solution-answer-block" id="solution-answer"></div>
      <div class="solution-analysis-block" id="solution-analysis"></div>
      

      
      <!-- Q&A Discussion Board -->
      <div class="comments-block" id="comments-block" style="margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1.25rem; display: flex; flex-direction: column; gap: 1rem; width: 100%;">
        <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary); display: flex; justify-content: space-between;">
          <span>💬 答题讨论区</span>
          <span id="comment-count-badge" style="font-size: 0.8rem; color: var(--text-muted);">正在加载...</span>
        </div>
        <div class="comment-list" id="comment-list" style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 220px; overflow-y: auto; padding-right: 0.25rem;">
          <!-- Loaded dynamically -->
        </div>
        <div class="comment-input-row" id="comment-input-row">
          <!-- Loaded dynamically -->
        </div>
      </div>
    </div>
  `;
  
  container.appendChild(card);
  
  // Toggle bookmark logic
  const bookmarkBtn = card.querySelector('#bookmark-btn');
  bookmarkBtn.addEventListener('click', () => {
    const idx = userData.bookmarks.indexOf(qId);
    if (idx > -1) {
      userData.bookmarks.splice(idx, 1);
      bookmarkBtn.classList.remove('active');
      bookmarkBtn.title = '添加收藏';
      showToast('已取消收藏', 'info');
    } else {
      userData.bookmarks.push(qId);
      bookmarkBtn.classList.add('active');
      bookmarkBtn.title = '取消收藏';
      showToast('已成功收藏题目', 'success');
    }
    saveUserData();
  });
  
  // Render input details based on question type
  const interactiveArea = card.querySelector('#interactive-area');
  const solutionPanel = card.querySelector('#solution-panel');
  const solutionAnswer = card.querySelector('#solution-answer');
  const solutionAnalysis = card.querySelector('#solution-analysis');
  const toggleSolutionBtn = card.querySelector('#toggle-solution-btn');
  
  // Set solution text (pre-rendered for loading)
  solutionAnswer.innerHTML = `正确答案：${renderContent(q.answer)}`;
  solutionAnalysis.innerHTML = q.analysis ? renderContent(q.analysis) : '该题目暂无详细解析。';
  
  const isLoggedIn = !!localStorage.getItem('dm_jwt_token');

  if (!isLoggedIn) {
    interactiveArea.innerHTML = `
      <div style="padding: 1.5rem; background-color: var(--bg-secondary); border: 1px dashed var(--border-color); border-radius: var(--radius-md); text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; width:100%; box-sizing:border-box;">
        <span style="font-size: 2rem; user-select: none;">🔒</span>
        <div style="font-weight: 700; font-size: 1rem; color: var(--text-primary);">答题特权已锁定</div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0; max-width: 320px;">
          您需要登录账号才能答题、解锁参考解析与 AI 助教！
        </p>
        <button class="btn btn-primary" onclick="document.getElementById('login-trigger-btn').click()" style="padding: 0.5rem 1.25rem; font-size: 0.85rem; margin-top: 0.25rem;">
          立即登录 / 注册
        </button>
      </div>
    `;
    
    // Disable call AI tutor
    const callAiTutorBtn = card.querySelector('#call-ai-tutor-btn');
    if (callAiTutorBtn) {
      // Overwrite with login prompt
      const clone = callAiTutorBtn.cloneNode(true);
      callAiTutorBtn.parentNode.replaceChild(clone, callAiTutorBtn);
      clone.addEventListener('click', (e) => {
        e.stopPropagation();
        showToast('请先登录以召唤 AI 助教！', 'warning');
        document.getElementById('login-trigger-btn').click();
      });
    }
    
    // Disable toggle solution button
    toggleSolutionBtn.disabled = true;
    toggleSolutionBtn.innerText = '🔒 登录解锁解析';
    toggleSolutionBtn.style.opacity = '0.6';
    toggleSolutionBtn.style.cursor = 'not-allowed';
  } else {
    // Toggle solution button listener
    toggleSolutionBtn.addEventListener('click', () => {
      if (solutionPanel.style.display === 'none') {
        solutionPanel.style.display = 'flex';
        toggleSolutionBtn.innerText = '隐藏答案与解析';
        renderMath(solutionPanel);
        loadComments(qId, solutionPanel);
      } else {
        solutionPanel.style.display = 'none';
        toggleSolutionBtn.innerText = '显示答案与解析';
      }
    });

    // Handle Practice View Question UI based on category
    if (q.category === 'judgment') {
    // Judgment rendering
    interactiveArea.innerHTML = `
      <div class="judgment-wrapper">
        <button class="judgment-btn" id="judge-true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>对 (True)</span>
        </button>
        <button class="judgment-btn" id="judge-false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>错 (False)</span>
        </button>
      </div>
    `;
    
    const trueBtn = interactiveArea.querySelector('#judge-true');
    const falseBtn = interactiveArea.querySelector('#judge-false');
    
    // Check if already answered
    if (userRecord) {
      revealJudgmentStatus(trueBtn, falseBtn, userRecord.userAns, q.answer);
      solutionPanel.style.display = 'flex';
      toggleSolutionBtn.innerText = '隐藏答案与解析';
      loadComments(qId, solutionPanel);
    } else {
      trueBtn.addEventListener('click', () => selectJudgment('对'));
      falseBtn.addEventListener('click', () => selectJudgment('错'));
    }
    
    function selectJudgment(selectedVal) {
      if (userData.answered[qId]) return; // Lock: can only select once
      const isCorrect = (selectedVal === q.answer);
      userData.answered[qId] = { userAns: selectedVal, isCorrect: isCorrect };
      
      revealJudgmentStatus(trueBtn, falseBtn, selectedVal, q.answer);
      
      // Auto open solution
      solutionPanel.style.display = 'flex';
      toggleSolutionBtn.innerText = '隐藏答案与解析';
      renderMath(solutionPanel);
      
      if (isCorrect) {
        showToast('回答正确！', 'success');
      } else {
        showToast('回答错误，看下解析吧', 'error');
      }
      handleAnswerSubmitted(qId, isCorrect);
    }
    
  } else if (q.category === 'single_choice') {
    // Choice rendering
    let choicesHtml = `<div class="options-list">`;
    q.options.forEach(opt => {
      choicesHtml += `
        <div class="option-item" data-key="${opt.key}">
          <div class="option-prefix">${opt.key}</div>
          <div class="option-text">${renderContent(opt.text)}</div>
        </div>
      `;
    });
    choicesHtml += `</div>`;
    interactiveArea.innerHTML = choicesHtml;
    
    const optionItems = interactiveArea.querySelectorAll('.option-item');
    
    if (userRecord) {
      revealChoiceStatus(optionItems, userRecord.userAns, q.answer);
      solutionPanel.style.display = 'flex';
      toggleSolutionBtn.innerText = '隐藏答案与解析';
      loadComments(qId, solutionPanel);
    } else {
      optionItems.forEach(item => {
        item.addEventListener('click', () => {
          if (userData.answered[qId]) return; // Lock: can only select once
          const selectedKey = item.getAttribute('data-key');
          const isCorrect = (selectedKey === q.answer);
          
          userData.answered[qId] = { userAns: selectedKey, isCorrect: isCorrect };
          
          revealChoiceStatus(optionItems, selectedKey, q.answer);
          
          solutionPanel.style.display = 'flex';
          toggleSolutionBtn.innerText = '隐藏答案与解析';
          renderMath(solutionPanel);
          loadComments(qId, solutionPanel);
          
          if (isCorrect) {
            showToast('回答正确！', 'success');
          } else {
            showToast('回答错误，正确答案是 ' + q.answer, 'error');
          }
          handleAnswerSubmitted(qId, isCorrect);
        });
      });
    }
    
  } else if (q.category === 'fill_blank') {
    // Fill Blank rendering
    interactiveArea.innerHTML = `
      <div class="fill-blank-wrapper">
        <input type="text" class="fill-input" id="blank-input" placeholder="请输入你的答案，多个空用 '|' 分隔..." autocomplete="off">
        <button class="btn btn-primary" id="blank-submit">提交答案</button>
      </div>
    `;
    
    const blankInput = interactiveArea.querySelector('#blank-input');
    const blankSubmit = interactiveArea.querySelector('#blank-submit');
    
    if (userRecord) {
      blankInput.value = userRecord.userAns;
      blankInput.disabled = true;
      blankSubmit.disabled = true;
      blankSubmit.innerText = userRecord.isCorrect ? '回答正确' : '回答错误';
      blankSubmit.className = userRecord.isCorrect ? 'btn btn-primary' : 'btn btn-outline';
      solutionPanel.style.display = 'flex';
      toggleSolutionBtn.innerText = '隐藏答案与解析';
      loadComments(qId, solutionPanel);
      
      // Add custom self-correct button if wrong
      if (!userRecord.isCorrect) {
        addManualGradeButton(interactiveArea, qId);
      }
    } else {
      blankSubmit.addEventListener('click', () => submitBlank());
      blankInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitBlank();
      });
    }
    
    function submitBlank() {
      const userAns = blankInput.value.trim();
      if (!userAns) {
        showToast('请输入答案！', 'error');
        return;
      }
      
      const isCorrect = checkBlankCorrectness(userAns, q.answer);
      userData.answered[qId] = { userAns: userAns, isCorrect: isCorrect };
      
      blankInput.disabled = true;
      blankSubmit.disabled = true;
      blankSubmit.innerText = isCorrect ? '回答正确' : '回答错误';
      blankSubmit.className = isCorrect ? 'btn btn-primary' : 'btn btn-outline';
      
      solutionPanel.style.display = 'flex';
      toggleSolutionBtn.innerText = '隐藏答案与解析';
      renderMath(solutionPanel);
      loadComments(qId, solutionPanel);
      
      if (isCorrect) {
        showToast('回答正确！', 'success');
      } else {
        showToast('判定错误，点击下方解析对照', 'error');
        addManualGradeButton(interactiveArea, qId);
      }
      handleAnswerSubmitted(qId, isCorrect);
    }
    
  } else {
    // Subjective question rendering (Calculation, Proof, Application)
    interactiveArea.innerHTML = `
      <div class="subjective-wrapper">
        <textarea class="subjective-textarea" id="subjective-draft" placeholder="在此写下你的解题思路或草稿（非必填，主要通过点击下方答案进行自我对照）..."></textarea>
      </div>
    `;
    
    const draftTextarea = interactiveArea.querySelector('#subjective-draft');
    
    // Restore draft if answered
    if (userRecord) {
      draftTextarea.value = userRecord.userAns;
      draftTextarea.disabled = true;
      solutionPanel.style.display = 'flex';
      toggleSolutionBtn.innerText = '隐藏答案与解析';
      
      // Render subjective feedback buttons
      renderSubjectiveFeedback(interactiveArea, qId, userRecord.isCorrect);
    } else {
      // For subjective, display answer toggle immediately
      toggleSolutionBtn.addEventListener('click', () => {
        if (solutionPanel.style.display === 'flex' && !userData.answered[qId]) {
          // If they opened the solution, trigger self-assessment buttons
          renderSubjectiveFeedback(interactiveArea, qId, null, draftTextarea.value);
        }
      }, { once: true });
    }
  }
}

  // Navigation controls
  const prevBtn = card.querySelector('#prev-btn');
  const nextBtn = card.querySelector('#next-btn');
  
  prevBtn.addEventListener('click', () => {
    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
      renderViewport();
    }
  });
  
  nextBtn.addEventListener('click', () => {
    if (currentQuestionIndex < questions.length - 1) {
      currentQuestionIndex++;
      renderViewport();
    }
  });
  
  // Bind Call AI Button
  const callAiBtn = card.querySelector('#call-ai-tutor-btn');
  if (callAiBtn) {
    callAiBtn.addEventListener('click', () => {
      bindQuestionToAi(q);
    });
  }
  
  // ==========================================
  //     PRACTICE MODE ANSWER SHEET RENDER
  // ==========================================
  const sheetCard = document.createElement('div');
  sheetCard.className = 'practice-answer-sheet-card';
  
  let doneCount = 0;
  let cellsHtml = '';
  
  questions.forEach((question, idx) => {
    const qKey = `${question.category}_${question.original_num}`;
    const record = userData.answered[qKey];
    
    let cellClass = '';
    if (idx === currentQuestionIndex) {
      cellClass = 'current';
    } else if (record) {
      doneCount++;
      cellClass = record.isCorrect ? 'correct' : 'incorrect';
    }
    
    cellsHtml += `<button class="practice-sheet-cell ${cellClass}" data-index="${idx}">${idx + 1}</button>`;
  });
  
  sheetCard.innerHTML = `
    <div class="practice-sheet-title">
      <span>🧭 答题卡 (点击可快速跳题)</span>
      <span style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">已做: ${doneCount}/${questions.length}</span>
    </div>
    <div class="practice-sheet-grid">
      ${cellsHtml}
    </div>
  `;
  
  container.appendChild(sheetCard);
  
  sheetCard.querySelectorAll('.practice-sheet-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const idx = parseInt(cell.getAttribute('data-index'), 10);
      currentQuestionIndex = idx;
      renderViewport();
    });
  });
  
  // Render mathematical symbols in card
  renderMath(card);
}

// Helpers for answers styling
function revealJudgmentStatus(trueBtn, falseBtn, selectedVal, correctVal) {
  trueBtn.disabled = true;
  falseBtn.disabled = true;
  
  const activeBtn = (selectedVal === '对') ? trueBtn : falseBtn;
  const otherBtn = (selectedVal === '对') ? falseBtn : trueBtn;
  
  if (selectedVal === correctVal) {
    activeBtn.classList.add('correct');
  } else {
    activeBtn.classList.add('incorrect');
    const correctBtn = (correctVal === '对') ? trueBtn : falseBtn;
    correctBtn.classList.add('correct');
  }
}

function revealChoiceStatus(optionItems, selectedKey, correctKey) {
  optionItems.forEach(item => {
    const itemKey = item.getAttribute('data-key');
    if (itemKey === correctKey) {
      item.classList.add('correct');
    } else if (itemKey === selectedKey) {
      item.classList.add('incorrect');
    }
  });
}

// Grade checker for blank fills
function checkBlankCorrectness(userVal, correctVal) {
  const normUser = normalizeAnswer(userVal);
  const normCorrect = normalizeAnswer(correctVal);
  
  // Split checks for multiple blanks separated by | or 或
  if (normCorrect.includes('|')) {
    const correctParts = normCorrect.split('|');
    const userParts = normUser.split('|');
    if (correctParts.length !== userParts.length) return false;
    return correctParts.every((part, idx) => checkSinglePart(userParts[idx], part));
  }
  
  return checkSinglePart(normUser, normCorrect);
}

function checkSinglePart(userStr, correctStr) {
  if (userStr === correctStr) return true;
  
  // Handle common synonyms
  if (correctStr === '真' && userStr === '1') return true;
  if (correctStr === '假' && userStr === '0') return true;
  if (correctStr === '对' && userStr === '1') return true;
  if (correctStr === '错' && userStr === '0') return true;
  
  // Handle LaTeX double escape differences
  const cleanU = userStr.replace(/\\+/g, '\\');
  const cleanC = correctStr.replace(/\\+/g, '\\');
  if (cleanU === cleanC) return true;
  
  return false;
}

function normalizeAnswer(str) {
  return str.trim()
    .toLowerCase()
    .replace(/\s+/g, '') // remove spaces
    .replace(/，/g, ',') // normalize commas
    .replace(/：/g, ':') // normalize colons
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/【/g, '[')
    .replace(/】/g, ']');
}

// User override grade button
function addManualGradeButton(interactiveArea, qId) {
  // Check if button already exists
  if (interactiveArea.querySelector('.self-correct-row')) return;
  
  const div = document.createElement('div');
  div.className = 'self-correct-row';
  div.style.marginTop = '0.75rem';
  div.innerHTML = `
    <button class="btn btn-outline" style="font-size: 0.85rem; padding: 0.4rem 0.8rem; border-color: var(--success); color: var(--success);" id="force-correct-btn">
      我认为我答对了，设为正确
    </button>
  `;
  interactiveArea.appendChild(div);
  
  div.querySelector('#force-correct-btn').addEventListener('click', () => {
    if (userData.answered[qId]) {
      userData.answered[qId].isCorrect = true;
      saveUserData();
      showToast('已更新状态为正确！', 'success');
      renderViewport();
    }
  });
}

// Self assessment button for subjective questions
function renderSubjectiveFeedback(interactiveArea, qId, existingIsCorrect, draftValue = '') {
  // Clear any existing feedback row
  const oldRow = interactiveArea.querySelector('.subjective-feedback-row');
  if (oldRow) oldRow.remove();
  
  const div = document.createElement('div');
  div.className = 'subjective-feedback-row';
  div.style.marginTop = '1rem';
  div.style.display = 'flex';
  div.style.flexDirection = 'column';
  div.style.gap = '0.75rem';
  
  if (existingIsCorrect !== null) {
    div.innerHTML = `
      <div style="font-weight:600; color: ${existingIsCorrect ? 'var(--success)' : 'var(--error)'};">
        自我评估结果：${existingIsCorrect ? '答对了' : '答错了 / 没做出来'}
      </div>
      <button class="btn btn-outline" style="align-self: flex-start; font-size:0.85rem;" id="change-grade-btn">重新评估</button>
    `;
    interactiveArea.appendChild(div);
    
    div.querySelector('#change-grade-btn').addEventListener('click', () => {
      userData.answered[qId] = undefined;
      delete userData.answered[qId];
      saveUserData();
      renderViewport();
    });
  } else {
    div.innerHTML = `
      <div style="font-size: 0.9rem; font-weight:600; color: var(--text-secondary);">对照参考答案，你做对了吗？</div>
      <div style="display:flex; gap:0.75rem;">
        <button class="btn btn-outline" style="border-color: var(--success); color: var(--success); flex:1;" id="grade-correct">做对了</button>
        <button class="btn btn-outline" style="border-color: var(--error); color: var(--error); flex:1;" id="grade-incorrect">做错了 / 没做出来</button>
      </div>
    `;
    interactiveArea.appendChild(div);
    
    const draftTextarea = interactiveArea.querySelector('#subjective-draft');
    
    div.querySelector('#grade-correct').addEventListener('click', () => selectGrade(true));
    div.querySelector('#grade-incorrect').addEventListener('click', () => selectGrade(false));
    
    function selectGrade(isCorrect) {
      userData.answered[qId] = {
        userAns: draftTextarea ? draftTextarea.value : draftValue,
        isCorrect: isCorrect
      };
      
      // Update wrongQuestions for subjective
      if (isCorrect) {
        const wIdx = userData.wrongQuestions.indexOf(qId);
        if (wIdx > -1) {
          userData.wrongQuestions.splice(wIdx, 1);
        }
      } else {
        if (!userData.wrongQuestions.includes(qId)) {
          userData.wrongQuestions.push(qId);
        }
      }
      
      saveUserData();
      showToast(isCorrect ? '太棒了，继续加油！' : '没关系，看懂解析才是关键', isCorrect ? 'success' : 'info');
      renderViewport();
    }
  }
}

// ==========================================
//             EXAM MODE RENDERING
// ==========================================
function renderExamMode(container) {
  const isLoggedIn = !!localStorage.getItem('dm_jwt_token');
  if (!isLoggedIn) {
    container.innerHTML = `
      <div class="empty-bookmarks-card" style="max-width: 600px; text-align: center; gap: 1.25rem; margin: 2rem auto;">
        <div class="empty-icon" style="background-color: var(--primary-light); color: var(--primary); margin: 0 auto;">🔒</div>
        <h2>模拟考试功能已锁定</h2>
        <p style="color: var(--text-secondary); max-width: 420px; margin: 0 auto;">
          模拟考试需要登录账号以保存考试成绩高分榜、记录错题库并计算答题正确率。
        </p>
        <button class="btn btn-primary" onclick="document.getElementById('login-trigger-btn').click()" style="padding: 0.65rem 1.5rem; margin-top: 0.5rem; align-self: center;">
          立即登录 / 注册
        </button>
      </div>
    `;
    return;
  }
  
  if (!examState.isActive) {
    renderExamLobby(container);
  } else {
    renderExamRunner(container);
  }
}

function renderExamLobby(container) {
  container.innerHTML = `
    <div class="empty-bookmarks-card" style="max-width: 600px; text-align: left; align-items: stretch; gap: 1.25rem;">
      <div class="empty-icon" style="background-color: var(--primary-light); color: var(--primary); margin: 0 auto 0.5rem auto;">📝</div>
      <h2 style="text-align: center;">离散数学自定义考场</h2>
      <p style="color: var(--text-secondary); text-align: center;">自主配置您专属的模拟考卷，系统将根据题量和范围随机抽取组卷。</p>
      
      <div style="display:flex; flex-direction:column; gap:1.15rem; background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; margin-top: 0.5rem;">
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
          <!-- Range Selection -->
          <div class="form-group">
            <label for="exam-set-topic" style="font-weight:700;">考察知识范围</label>
            <select id="exam-set-topic" style="padding: 0.6rem 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-family: inherit;">
              <option value="all">全部范围</option>
              <option value="propositional_logic">仅命题逻辑 (Propositional)</option>
              <option value="predicate_logic">仅谓词逻辑 (Predicate)</option>
            </select>
          </div>
          
          <!-- Time Limit Selection -->
          <div class="form-group">
            <label for="exam-set-time" style="font-weight:700;">考试时间限制</label>
            <select id="exam-set-time" style="padding: 0.6rem 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-family: inherit;">
              <option value="900">15 分钟</option>
              <option value="1800" selected>30 分钟</option>
              <option value="2700">45 分钟</option>
              <option value="3600">60 分钟</option>
              <option value="0">无时间限制</option>
            </select>
          </div>
        </div>
        
        <!-- Composition Inputs -->
        <div style="margin-top:0.5rem;">
          <h4 style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; font-weight:700; margin-bottom:0.75rem;">题型数量配置 (每题 10 分)</h4>
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:0.5rem;">
            <div class="form-group" style="align-items:center;">
              <label style="font-size:0.75rem;">判断题</label>
              <input type="number" id="exam-cnt-judgment" value="5" min="0" max="15" style="width:100%; text-align:center; padding:0.4rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary);">
            </div>
            <div class="form-group" style="align-items:center;">
              <label style="font-size:0.75rem;">单选题</label>
              <input type="number" id="exam-cnt-choice" value="5" min="0" max="23" style="width:100%; text-align:center; padding:0.4rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary);">
            </div>
            <div class="form-group" style="align-items:center;">
              <label style="font-size:0.75rem;">填空题</label>
              <input type="number" id="exam-cnt-blank" value="3" min="0" max="9" style="width:100%; text-align:center; padding:0.4rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary);">
            </div>
            <div class="form-group" style="align-items:center;">
              <label style="font-size:0.75rem;">主观题</label>
              <input type="number" id="exam-cnt-subjective" value="2" min="0" max="5" style="width:100%; text-align:center; padding:0.4rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary);">
            </div>
          </div>
        </div>
        
        <!-- Summary indicators -->
        <div style="display:flex; justify-content:space-between; font-weight:700; font-size:0.95rem; border-top:1px solid var(--border-color); padding-top:0.75rem; color:var(--primary);">
          <span id="exam-set-summary-qs">总计: 15 道题</span>
          <span id="exam-set-summary-score">总分: 150 分</span>
        </div>
      </div>
      
      <button class="btn btn-primary" id="start-exam-btn" style="width: 100%; padding: 0.95rem; font-size:1.05rem; font-weight:700;">开始模拟考试</button>
    </div>
  `;
  
  const summaryQs = container.querySelector('#exam-set-summary-qs');
  const summaryScore = container.querySelector('#exam-set-summary-score');
  const inputJudgment = container.querySelector('#exam-cnt-judgment');
  const inputChoice = container.querySelector('#exam-cnt-choice');
  const inputBlank = container.querySelector('#exam-cnt-blank');
  const inputSubjective = container.querySelector('#exam-cnt-subjective');
  
  function updateExamSummary() {
    const j = parseInt(inputJudgment.value || 0, 10);
    const c = parseInt(inputChoice.value || 0, 10);
    const b = parseInt(inputBlank.value || 0, 10);
    const s = parseInt(inputSubjective.value || 0, 10);
    const total = j + c + b + s;
    if (summaryQs) summaryQs.innerText = `总计: ${total} 道题`;
    if (summaryScore) summaryScore.innerText = `总分: ${total * 10} 分`;
  }
  
  [inputJudgment, inputChoice, inputBlank, inputSubjective].forEach(input => {
    input.addEventListener('input', updateExamSummary);
  });
  
  container.querySelector('#start-exam-btn').addEventListener('click', startExam);
}

function startExam() {
  const selectedTopic = document.getElementById('exam-set-topic').value;
  const selectedTime = parseInt(document.getElementById('exam-set-time').value, 10);
  
  const cntJudgment = parseInt(document.getElementById('exam-cnt-judgment').value || 0, 10);
  const cntChoice = parseInt(document.getElementById('exam-cnt-choice').value || 0, 10);
  const cntBlank = parseInt(document.getElementById('exam-cnt-blank').value || 0, 10);
  const cntSubjective = parseInt(document.getElementById('exam-cnt-subjective').value || 0, 10);
  
  const totalQuestionsNeeded = cntJudgment + cntChoice + cntBlank + cntSubjective;
  if (totalQuestionsNeeded === 0) {
    showToast('总题数不能为 0！', 'error');
    return;
  }
  
  // Filter pool based on selected knowledge range
  let pool = QUESTIONS;
  if (selectedTopic !== 'all') {
    pool = QUESTIONS.filter(q => q.topic === selectedTopic);
  }
  
  // Assemble questions
  const judgments = selectRandom(pool.filter(q => q.category === 'judgment'), cntJudgment);
  const choices = selectRandom(pool.filter(q => q.category === 'single_choice'), cntChoice);
  const blanks = selectRandom(pool.filter(q => q.category === 'fill_blank'), cntBlank);
  const subjectives = selectRandom(pool.filter(q => ['calculation', 'proof', 'application'].includes(q.category)), cntSubjective);
  
  examState.questions = [...judgments, ...choices, ...blanks, ...subjectives];
  
  // Verify if we have enough questions in the selected pool
  if (examState.questions.length < totalQuestionsNeeded) {
    showToast(`当前选题范围内题源不足！仅抽取到 ${examState.questions.length}/${totalQuestionsNeeded} 题，请调低配置或扩大知识范围！`, 'error');
    return;
  }
  
  examState.isActive = true;
  examState.answers = {};
  examState.completed = false;
  examState.secondsRemaining = selectedTime;
  examState.subjectiveGrading = {};
  currentQuestionIndex = 0;
  
  // Start Timer if not unlimited
  if (examState.secondsRemaining > 0) {
    examState.timerId = setInterval(() => {
      examState.secondsRemaining--;
      updateExamTimer();
      if (examState.secondsRemaining <= 0) {
        clearInterval(examState.timerId);
        submitExam(true); // Force submit on timeout
      }
    }, 1000);
  } else {
    examState.timerId = null;
  }
  
  renderViewport();
  showToast('考试开始，答题过程中请勿切换分类或关闭网页', 'info');
}

function selectRandom(arr, count) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function updateExamTimer() {
  const timerEl = document.getElementById('exam-timer-display');
  if (!timerEl) return;
  
  if (examState.secondsRemaining === 0) {
    timerEl.innerText = "不限时";
    timerEl.parentElement.classList.remove('warning');
    return;
  }
  
  const mins = Math.floor(examState.secondsRemaining / 60);
  const secs = examState.secondsRemaining % 60;
  
  const displayMins = mins.toString().padStart(2, '0');
  const displaySecs = secs.toString().padStart(2, '0');
  
  timerEl.innerText = `${displayMins}:${displaySecs}`;
  
  if (examState.secondsRemaining < 300) {
    timerEl.parentElement.classList.add('warning');
  } else {
    timerEl.parentElement.classList.remove('warning');
  }
}

function exitExam() {
  clearInterval(examState.timerId);
  examState.isActive = false;
  examState.questions = [];
  examState.answers = {};
  examState.completed = false;
}

// --- Exam Runner Screen ---
function renderExamRunner(container) {
  if (examState.completed) {
    renderExamResults(container);
    return;
  }
  
  const q = examState.questions[currentQuestionIndex];
  
  // Create header widget for Exam
  const examHeader = document.createElement('div');
  examHeader.className = 'exam-header-widget';
  examHeader.innerHTML = `
    <div class="exam-timer">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:20px;height:20px;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      <span id="exam-timer-display">--:--</span>
    </div>
    
    <div class="exam-progress-tracker">
      <span class="progress-text" style="white-space:nowrap;">已答: <span id="answered-badge">0</span>/${examState.questions.length}</span>
      <div class="progress-bar-outer">
        <div class="progress-bar-inner" id="exam-progress-bar"></div>
      </div>
    </div>
    
    <button class="btn btn-outline" style="border-color: var(--error); color: var(--error);" id="submit-exam-btn">交卷</button>
  `;
  container.appendChild(examHeader);
  updateExamTimer();
  updateProgressTracker();
  
  // Question navigation dots grid
  const navGrid = document.createElement('div');
  navGrid.className = 'question-nav-grid';
  for (let idx = 0; idx < examState.questions.length; idx++) {
    const isAnswered = examState.answers[idx] !== undefined && examState.answers[idx] !== '';
    navGrid.innerHTML += `
      <div class="nav-dot ${isAnswered ? 'answered' : ''} ${idx === currentQuestionIndex ? 'current' : ''}" data-idx="${idx}">
        ${idx + 1}
      </div>
    `;
  }
  container.appendChild(navGrid);
  
  navGrid.querySelectorAll('.nav-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      currentQuestionIndex = parseInt(dot.getAttribute('data-idx'));
      renderViewport();
    });
  });
  
  // Current Question Card
  const card = document.createElement('div');
  card.className = 'question-card';
  
  let catBadgeName = '';
  switch(q.category) {
    case 'judgment': catBadgeName = '判断题'; break;
    case 'single_choice': catBadgeName = '单项选择题'; break;
    case 'fill_blank': catBadgeName = '填空题'; break;
    case 'calculation': catBadgeName = '计算题'; break;
    case 'proof': catBadgeName = '证明题'; break;
    case 'application': catBadgeName = '应用题'; break;
  }
  
  card.innerHTML = `
    <div class="question-header">
      <div class="question-badge-row" style="width: 100%; display: flex; justify-content: space-between; align-items: center;">
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <span class="badge badge-category">${catBadgeName}</span>
          <span class="badge badge-num">试卷题号: ${currentQuestionIndex + 1}</span>
        </div>
        <button class="btn btn-outline" id="call-ai-tutor-btn" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; font-weight: 700; border-color: var(--primary); color: var(--primary); display: flex; align-items: center; gap: 0.25rem; border-radius: 12px; cursor: pointer; transition: all var(--transition-fast);">
          <span>🤖</span> 问助教
        </button>
      </div>
    </div>
    
    <div class="question-body">${renderContent(q.question)}</div>
    
    <div class="question-interactive-area" id="exam-interactive-area"></div>
    
    <div class="card-footer">
      <span>第 ${currentQuestionIndex + 1} / ${examState.questions.length} 题</span>
      <div class="navigation-controls">
        <button class="btn btn-outline" id="exam-prev" ${currentQuestionIndex === 0 ? 'disabled' : ''}>上一题</button>
        <button class="btn btn-primary" id="exam-next" ${currentQuestionIndex === examState.questions.length - 1 ? 'disabled' : ''}>下一题</button>
      </div>
    </div>
  `;
  container.appendChild(card);
  
  // Render answer selection inputs
  const interactiveArea = card.querySelector('#exam-interactive-area');
  const userAns = examState.answers[currentQuestionIndex];
  
  if (q.category === 'judgment') {
    interactiveArea.innerHTML = `
      <div class="judgment-wrapper">
        <button class="judgment-btn ${userAns === '对' ? 'selected-true' : ''}" id="judge-true">对 (True)</button>
        <button class="judgment-btn ${userAns === '错' ? 'selected-true' : ''}" id="judge-false">错 (False)</button>
      </div>
    `;
    interactiveArea.querySelector('#judge-true').addEventListener('click', () => saveExamAnswer('对'));
    interactiveArea.querySelector('#judge-false').addEventListener('click', () => saveExamAnswer('错'));
    
  } else if (q.category === 'single_choice') {
    let choicesHtml = `<div class="options-list">`;
    q.options.forEach(opt => {
      const isSelected = (userAns === opt.key);
      choicesHtml += `
        <div class="option-item ${isSelected ? 'selected' : ''}" data-key="${opt.key}">
          <div class="option-prefix">${opt.key}</div>
          <div class="option-text">${renderContent(opt.text)}</div>
        </div>
      `;
    });
    choicesHtml += `</div>`;
    interactiveArea.innerHTML = choicesHtml;
    
    interactiveArea.querySelectorAll('.option-item').forEach(item => {
      item.addEventListener('click', () => {
        saveExamAnswer(item.getAttribute('data-key'));
      });
    });
    
  } else if (q.category === 'fill_blank') {
    interactiveArea.innerHTML = `
      <div class="fill-blank-wrapper">
        <input type="text" class="fill-input" id="blank-input" placeholder="请在这里输入答案..." value="${userAns || ''}">
      </div>
    `;
    const input = interactiveArea.querySelector('#blank-input');
    input.addEventListener('input', () => {
      saveExamAnswer(input.value);
    });
    
  } else {
    // Subjective (Calculation, Proof, Application)
    interactiveArea.innerHTML = `
      <div class="subjective-wrapper">
        <textarea class="subjective-textarea" id="subjective-draft" placeholder="请在这里写下你的解题推导过程草稿...">${userAns || ''}</textarea>
      </div>
    `;
    const textarea = interactiveArea.querySelector('#subjective-draft');
    textarea.addEventListener('input', () => {
      saveExamAnswer(textarea.value);
    });
  }
  
  function saveExamAnswer(val) {
    examState.answers[currentQuestionIndex] = val;
    updateProgressTracker();
    
    // Update nav dot color
    const dot = navGrid.querySelector(`[data-idx="${currentQuestionIndex}"]`);
    if (val !== undefined && val !== '') {
      dot.classList.add('answered');
    } else {
      dot.classList.remove('answered');
    }
  }
  
  function updateProgressTracker() {
    let count = 0;
    for (let idx = 0; idx < examState.questions.length; idx++) {
      if (examState.answers[idx] !== undefined && examState.answers[idx] !== '') {
        count++;
      }
    }
    const badge = document.getElementById('answered-badge');
    const bar = document.getElementById('exam-progress-bar');
    if (badge) badge.innerText = count;
    if (bar) bar.style.width = `${(count / examState.questions.length) * 100}%`;
  }
  
  // Setup Bind AI Trigger
  const callAiBtn = card.querySelector('#call-ai-tutor-btn');
  if (callAiBtn) {
    callAiBtn.addEventListener('click', () => {
      bindQuestionToAi(q);
    });
  }

  // Wire nav buttons
  card.querySelector('#exam-prev').addEventListener('click', () => {
    currentQuestionIndex--;
    renderViewport();
  });
  
  card.querySelector('#exam-next').addEventListener('click', () => {
    currentQuestionIndex++;
    renderViewport();
  });
  
  // 交卷 logic
  document.getElementById('submit-exam-btn').addEventListener('click', () => {
    const unansweredCount = examState.questions.length - Object.keys(examState.answers).filter(k => examState.answers[k] !== '').length;
    let confirmMsg = '是否确认交卷？';
    if (unansweredCount > 0) {
      confirmMsg = `你还有 ${unansweredCount} 道题目未作答，是否确认交卷？`;
    }
    if (confirm(confirmMsg)) {
      submitExam(false);
    }
  });
  
  renderMath(card);
}

function submitExam(isTimeout = false) {
  clearInterval(examState.timerId);
  examState.completed = true;
  
  if (isTimeout) {
    alert('答题时间到，系统已自动帮你交卷！');
  } else {
    showToast('提交考卷成功！正在结算中...', 'success');
  }
  
  // Set subjective grading values to correct by default for auto checking,
  // then user can adjust in grading list.
  examState.questions.forEach((q, idx) => {
    if (['calculation', 'proof', 'application'].includes(q.category)) {
      examState.subjectiveGrading[idx] = true; // Default self-grade correct
    }
  });
  
  renderViewport();
  
  // Trigger Canvas Confetti if score is good (we evaluate score after rendering results)
}

// --- Render Exam Results ---
function renderExamResults(container) {
  // Score calculations
  let score = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let subjectiveCount = 0;
  
  examState.questions.forEach((q, idx) => {
    const userAns = examState.answers[idx] || '';
    if (['judgment', 'single_choice', 'fill_blank'].includes(q.category)) {
      const isCorrect = (q.category === 'fill_blank') 
        ? checkBlankCorrectness(userAns, q.answer)
        : (userAns === q.answer);
      if (isCorrect) {
        score += 10;
        correctCount++;
      } else {
        incorrectCount++;
      }
    } else {
      // Subjective questions
      subjectiveCount++;
      const isCorrect = examState.subjectiveGrading[idx];
      if (isCorrect) {
        score += 10;
        correctCount++;
      } else {
        incorrectCount++;
      }
    }
  });
  
  // HTML layout for results
  container.innerHTML = `
    <div class="result-card">
      <h2>考试结果结算</h2>
      <p style="color:var(--text-secondary);">本次模拟考卷总分 ${examState.questions.length * 10} 分，包含定制化的知识点测验。</p>
      
      <div class="score-ring">
        <span class="score-val" id="score-val-text">${score}</span>
        <span class="score-max">满分 ${examState.questions.length * 10} 分</span>
      </div>
      
      <div class="result-stats">
        <div class="result-stat-item">
          <span class="result-stat-val correct-color">${correctCount}</span>
          <span class="result-stat-lbl">答对题数</span>
        </div>
        <div class="result-stat-item">
          <span class="result-stat-val error-color">${incorrectCount}</span>
          <span class="result-stat-lbl">答错题数</span>
        </div>
        <div class="result-stat-item">
          <span class="result-stat-val">${Math.round((correctCount / examState.questions.length) * 100)}%</span>
          <span class="result-stat-lbl">正确率</span>
        </div>
      </div>
      
      <div style="display:flex; gap:1rem; width:100%; max-width:480px; margin-top: 1rem;">
        <button class="btn btn-outline" id="exit-exam-btn" style="flex:1;">返回考场大厅</button>
        <button class="btn btn-primary" id="retry-exam-btn" style="flex:1;">重新组卷考试</button>
      </div>
    </div>
    
    <h3 style="margin-top: 2rem; margin-bottom: 1rem; font-weight:800; border-bottom: 2px solid var(--border-color); padding-bottom: 0.5rem;">错题与试卷回顾 (Review)</h3>
    <div class="review-list" id="review-list"></div>
  `;
  
  // Confetti triggering on score >= 90
  if (score >= 90 && window.confetti) {
    window.confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 }
    });
  }
  
  // Wire lobby exits
  container.querySelector('#exit-exam-btn').addEventListener('click', exitExamAndRenderLobby);
  container.querySelector('#retry-exam-btn').addEventListener('click', () => {
    exitExam();
    startExam();
  });
  
  function exitExamAndRenderLobby() {
    exitExam();
    renderViewport();
  }
  
  // Render review question list
  const reviewList = container.querySelector('#review-list');
  examState.questions.forEach((q, idx) => {
    const userAns = examState.answers[idx] || '（未作答）';
    let isCorrect = false;
    let isSubjective = false;
    
    if (['judgment', 'single_choice', 'fill_blank'].includes(q.category)) {
      isCorrect = (q.category === 'fill_blank')
        ? checkBlankCorrectness(userAns, q.answer)
        : (userAns === q.answer);
    } else {
      isSubjective = true;
      isCorrect = examState.subjectiveGrading[idx];
    }
    
    let catBadgeName = '';
    switch(q.category) {
      case 'judgment': catBadgeName = '判断'; break;
      case 'single_choice': catBadgeName = '单选'; break;
      case 'fill_blank': catBadgeName = '填空'; break;
      case 'calculation': catBadgeName = '计算'; break;
      case 'proof': catBadgeName = '证明'; break;
      case 'application': catBadgeName = '应用'; break;
    }
    
    const itemCard = document.createElement('div');
    itemCard.className = 'question-card';
    itemCard.style.boxShadow = 'var(--shadow-sm)';
    itemCard.style.padding = '1.5rem';
    
    itemCard.innerHTML = `
      <div class="question-header">
        <div class="question-badge-row">
          <span class="badge ${isCorrect ? 'badge-category' : 'badge-num'}" style="background-color: ${isCorrect ? 'var(--success-light)' : 'var(--error-light)'}; color: ${isCorrect ? 'var(--success)' : 'var(--error)'};">
            ${isCorrect ? '✓ 对' : '✕ 错'}
          </span>
          <span class="badge badge-num">${catBadgeName} 试题</span>
        </div>
      </div>
      
      <div class="question-body" style="font-size: 1.05rem;">${renderContent(q.question)}</div>
      
      ${q.category === 'single_choice' ? renderReviewOptions(q.options, userAns, q.answer) : ''}
      
      <div style="background-color: var(--bg-primary); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); font-size: 0.95rem;">
        <div>你的回答：<strong>${renderContent(userAns)}</strong></div>
        <div style="margin-top: 0.25rem;">正确答案：<strong>${renderContent(q.answer)}</strong></div>
        
        ${isSubjective ? `
          <div style="margin-top: 0.5rem; display:flex; gap:0.5rem; align-items:center;">
            <span style="font-size:0.85rem; color:var(--text-muted);">自我批改反馈：</span>
            <button class="btn btn-outline" style="font-size:0.8rem; padding: 0.25rem 0.5rem; border-color:${isCorrect ? 'var(--error)' : 'var(--success)'}; color:${isCorrect ? 'var(--error)' : 'var(--success)'};" id="toggle-grading-${idx}">
              标记为${isCorrect ? '打错/扣分' : '做对/得分'}
            </button>
          </div>
        ` : ''}
      </div>
      
      <div class="solution-panel ${isCorrect ? 'correct-border' : 'incorrect-border'}" style="display: flex;">
        <div class="solution-header">
          <svg viewBox="0 0 24 24"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.364-5.636l-.707-.707m1.414 14.142l.707-.707M12 21v-1m6.364-1.636l.707.707M12 6a6 6 0 00-6 6c0 1.282.4 2.47 1.084 3.447A2 2 0 018 16.586V17a2 2 0 002 2h4a2 2 0 002-2v-.414a2 2 0 01.916-1.139A6.002 6.002 0 0018 12a6 6 0 00-6-6z" stroke="currentColor" stroke-linecap="round"/></svg>
          <span>试题解析</span>
        </div>
        <div class="solution-analysis-block" style="border:none; padding:0;">${q.analysis ? renderContent(q.analysis) : '该题暂无详细解析。'}</div>
      </div>
    `;
    reviewList.appendChild(itemCard);
    
    // Setup toggle grade event for subjective question review
    if (isSubjective) {
      itemCard.querySelector(`#toggle-grading-${idx}`).addEventListener('click', () => {
        examState.subjectiveGrading[idx] = !examState.subjectiveGrading[idx];
        
        // Also save this incorrect review to user's standard bookmarked list so they can practice later!
        const qId = getQuestionId(q);
        if (!examState.subjectiveGrading[idx]) {
          // If incorrect, add to bookmarks automatically
          if (!userData.bookmarks.includes(qId)) {
            userData.bookmarks.push(qId);
            saveUserData();
          }
        }
        
        renderViewport();
      });
    }
    
    // Automatically save normal incorrect exam questions to error notebook (bookmarks)
    if (!isCorrect) {
      const qId = getQuestionId(q);
      if (!userData.bookmarks.includes(qId)) {
        userData.bookmarks.push(qId);
        saveUserData();
      }
    }
    
    renderMath(itemCard);
  });
}

function renderReviewOptions(options, userAns, correctAns) {
  let choicesHtml = `<div class="options-list" style="margin: 0.5rem 0;">`;
  options.forEach(opt => {
    const isUserSelected = (userAns === opt.key);
    const isCorrect = (correctAns === opt.key);
    
    let optClass = '';
    if (isCorrect) optClass = 'correct';
    else if (isUserSelected) optClass = 'incorrect';
    
    choicesHtml += `
      <div class="option-item ${optClass}" style="pointer-events:none;">
        <div class="option-prefix">${opt.key}</div>
        <div class="option-text">${renderContent(opt.text)}</div>
      </div>
    `;
  });
  choicesHtml += `</div>`;
  return choicesHtml;
}

// --- Markdown & LaTeX Content Renderer ---
function renderContent(text) {
  if (!text) return '';
  
  // Extract math blocks
  const mathBlocks = [];
  
  // Replace display math ($$.*?$$)
  let processedText = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
    const placeholder = `MATHDISPLAYPLACEHOLDER${mathBlocks.length}`;
    mathBlocks.push({ placeholder, math: `$$${math}$$` });
    return placeholder;
  });
  
  // Replace inline math ($.*?$)
  processedText = processedText.replace(/\$([^\$]+?)\$/g, (match, math) => {
    const placeholder = `MATHINLINEPLACEHOLDER${mathBlocks.length}`;
    mathBlocks.push({ placeholder, math: `$${math}$` });
    return placeholder;
  });
  
  // Parse Markdown (using marked if available, otherwise fallback)
  let html = '';
  if (window.marked && window.marked.parse) {
    html = window.marked.parse(processedText);
  } else {
    html = fallbackMarkdownParse(processedText);
  }
  
  // Restore math blocks
  mathBlocks.forEach(item => {
    html = html.split(item.placeholder).join(item.math);
  });
  
  return html;
}

function fallbackMarkdownParse(text) {
  let lines = text.split('\n');
  let inTable = false;
  let tableHtml = '<table>';
  let processedLines = [];
  
  for (let line of lines) {
    let trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHtml = '<table>';
      }
      
      if (trimmed.includes(':---') || trimmed.includes('---:')) {
        continue;
      }
      
      let cells = trimmed.split('|').slice(1, -1);
      let cellTag = tableHtml.includes('<thead>') ? 'td' : 'th';
      let rowHtml = '<tr>';
      
      cells.forEach(cell => {
        rowHtml += `<${cellTag}>${cell.trim()}</${cellTag}>`;
      });
      rowHtml += '</tr>';
      
      if (cellTag === 'th') {
        tableHtml += `<thead>${rowHtml}</thead><tbody>`;
      } else {
        tableHtml += rowHtml;
      }
    } else {
      if (inTable) {
        inTable = false;
        tableHtml += '</tbody></table>';
        processedLines.push(tableHtml);
      }
      
      let lineHtml = line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      
      processedLines.push(lineHtml ? `<p>${lineHtml}</p>` : '');
    }
  }
  
  if (inTable) {
    tableHtml += '</tbody></table>';
    processedLines.push(tableHtml);
  }
  
  return processedLines.join('\n');
}

// --- General Utility Escapers ---
function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ==========================================
//          AUTH & CLOUD SYNC ENGINE
// ==========================================

const API_BASE = "/api";

// Check if user is logged in and render profile
async function checkAuthStatus() {
  const token = localStorage.getItem('dm_jwt_token');
  const userProfile = document.getElementById('user-profile');
  const loginTriggerBtn = document.getElementById('login-trigger-btn');
  
  if (token) {
    // If token exists, display profile
    const savedProfile = localStorage.getItem('dm_user_profile');
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        document.getElementById('user-username').innerText = profile.username;
        document.getElementById('user-email').innerText = '已开启云端备份';
        document.getElementById('user-avatar-initial').innerText = profile.username.substring(0, 1).toUpperCase();
        
        userProfile.style.display = 'flex';
        loginTriggerBtn.style.display = 'none';
        
        // Trigger initial sync to merge data
        syncUserData();
        return;
      } catch (e) {
        console.error('Error parsing profile data', e);
      }
    }
  }
  
  // Default logged out state
  userProfile.style.display = 'none';
  loginTriggerBtn.style.display = 'flex';
}

// Sync local storage data with Cloudflare KV database
async function syncUserData() {
  const token = localStorage.getItem('dm_jwt_token');
  if (!token) return;
  
  // Calculate highest exam score from local history
  let localHighScore = 0;
  if (userData.examHistory && userData.examHistory.length > 0) {
    localHighScore = Math.max(...userData.examHistory);
  }
  const savedProfile = localStorage.getItem('dm_user_profile');
  if (savedProfile) {
    const profile = JSON.parse(savedProfile);
    localHighScore = Math.max(localHighScore, profile.examHighScore || 0);
  }

  try {
    const response = await fetch(`${API_BASE}/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        bookmarks: userData.bookmarks,
        wrongQuestions: userData.wrongQuestions,
        answered: userData.answered,
        examHighScore: localHighScore
      })
    });
    
    if (response.status === 401) {
      // Session expired
      logout();
      showToast('登录态失效，已自动退出登录，请重新登录！', 'error');
      return;
    }
    
    if (response.ok) {
      const result = await response.json();
      
      // Update local profile stats from server response
      localStorage.setItem('dm_user_profile', JSON.stringify(result.profile));
      document.getElementById('user-username').innerText = result.profile.username;
      document.getElementById('user-email').innerText = '已开启云端备份';
      
      // Update stats dashboard with server data if needed
      updateStatsDashboard();
    }
  } catch (e) {
    console.error('Sync failed:', e);
  }
}

// Setup login/register modal events
function setupAuthEvents() {
  const authModal = document.getElementById('auth-modal');
  const modalClose = document.getElementById('auth-modal-close');
  const loginTrigger = document.getElementById('login-trigger-btn');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const logoutBtn = document.getElementById('logout-btn');
  
  // Show modal
  loginTrigger.addEventListener('click', () => {
    authModal.classList.add('show');
  });
  
  // Hide modal
  modalClose.addEventListener('click', () => {
    authModal.classList.remove('show');
  });
  
  // Hide modal by clicking overlay
  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) {
      authModal.classList.remove('show');
    }
  });
  
  // Switch to login tab
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.style.display = 'flex';
    registerForm.style.display = 'none';
  });
  
  // Switch to register tab
  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.style.display = 'flex';
    loginForm.style.display = 'none';
  });
  
  // Handle Login submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const result = await response.json();
      if (response.ok) {
        localStorage.setItem('dm_jwt_token', result.token);
        localStorage.setItem('dm_user_profile', JSON.stringify(result.profile));
        
        // Merge progress data from server
        if (result.data) {
          // Sync Server answered to local
          Object.assign(userData.answered, result.data.answered || {});
          // Sync Server bookmarks to local
          (result.data.bookmarks || []).forEach(b => {
            if (!userData.bookmarks.includes(b)) {
              userData.bookmarks.push(b);
            }
          });
          // Sync Server wrongQuestions to local
          (result.data.wrongQuestions || []).forEach(w => {
            if (!userData.wrongQuestions.includes(w)) {
              userData.wrongQuestions.push(w);
            }
          });
          localStorage.setItem('dm_quiz_user_data', JSON.stringify(userData));
        }
        
        authModal.classList.remove('show');
        loginForm.reset();
        checkAuthStatus();
        showToast('欢迎回来，登录成功！', 'success');
        
        // Force refresh UI stats
        updateStatsDashboard();
        setupSidebarCounts();
        renderViewport();
      } else {
        showToast(result.error || '登录失败，请检查账号密码！', 'error');
      }
    } catch (err) {
      showToast('登录服务暂不可用，请稍后再试！', 'error');
    }
  });
  
  // Handle Register submission
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    
    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const result = await response.json();
      if (response.ok) {
        showToast('注册成功！正在切换至登录界面...', 'success');
        
        // Automatically switch to login tab
        registerForm.reset();
        tabLogin.click();
        document.getElementById('login-email').value = email;
      } else {
        showToast(result.error || '注册失败，请稍后重试！', 'error');
      }
    } catch (err) {
      showToast('注册服务不可用，请检查网络！', 'error');
    }
  });
  
  // Handle Logout
  logoutBtn.addEventListener('click', () => {
    if (confirm('是否确认退出登录？退出登录后您的本地数据依然存在，但将停止云端同步。')) {
      logout();
      showToast('已成功退出登录，同步已关闭', 'info');
    }
  });
}

function logout() {
  localStorage.removeItem('dm_jwt_token');
  localStorage.removeItem('dm_user_profile');
  checkAuthStatus();
  renderViewport();
}

// ==========================================
//          LEADERBOARD VIEW RENDER
// ==========================================
async function renderLeaderboardView(container) {
  // Render loading state first
  container.innerHTML = `
    <div style="text-align: center; padding: 4rem 2rem;">
      <div style="font-size: 1.2rem; color: var(--text-muted);">正在加载云端排行榜数据...</div>
    </div>
  `;

  try {
    const response = await fetch(`${API_BASE}/leaderboard`);
    if (!response.ok) throw new Error('网络请求异常');
    
    const list = await response.json();
    
    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-bookmarks-card">
          <div class="empty-icon">🏆</div>
          <h2>排行榜空空如也</h2>
          <p>当前还没有学霸上传成绩，赶紧注册登录提交考卷，成为全场第一吧！</p>
        </div>
      `;
      return;
    }
    
    let tableRows = '';
    list.forEach((item, idx) => {
      let rankClass = 'rank-other';
      if (idx === 0) rankClass = 'rank-1';
      else if (idx === 1) rankClass = 'rank-2';
      else if (idx === 2) rankClass = 'rank-3';
      
      tableRows += `
        <tr>
          <td><span class="rank-badge ${rankClass}">${idx + 1}</span></td>
          <td style="font-weight:600;">${escapeHtml(item.username)}</td>
          <td style="font-weight:700; color:var(--primary);">${item.examHighScore} 分</td>
          <td>${item.answeredCount} 道</td>
          <td>${item.correctRate}%</td>
        </tr>
      `;
    });
    
    container.innerHTML = `
      <div style="margin-bottom: 1.5rem; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h2 style="font-weight:800; font-size:1.4rem;">学霸积分榜 (Top 50)</h2>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-top: 0.15rem;">排行标准：模拟考最高分 > 总刷题数 > 平均正确率</p>
        </div>
        <button class="btn btn-outline" id="refresh-leaderboard" style="padding: 0.5rem 1rem; font-size: 0.85rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:0.25rem;"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.27 15" stroke-linecap="round" stroke-linejoin="round"/></svg>
          刷新榜单
        </button>
      </div>
      
      <div class="leaderboard-table-wrapper">
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th style="width: 80px;">排名</th>
              <th>用户昵称</th>
              <th>模拟考高分</th>
              <th>已刷题数</th>
              <th>平均正确率</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;
    
    container.querySelector('#refresh-leaderboard').addEventListener('click', () => {
      renderLeaderboardView(container);
    });
    
  } catch (e) {
    container.innerHTML = `
      <div class="empty-bookmarks-card">
        <div class="empty-icon" style="background-color: var(--error-light); color: var(--error);">✕</div>
        <h2>获取榜单失败</h2>
        <p>网络连接超时或服务器异常，请稍后再试！</p>
        <button class="btn btn-primary" id="retry-leaderboard">重新加载</button>
      </div>
    `;
    
    container.querySelector('#retry-leaderboard').addEventListener('click', () => {
      renderLeaderboardView(container);
    });
  }
}


// ==========================================
//          SETTINGS & PROGRESS RESET EVENTS
// ==========================================

function setupSettingsEvents() {
  const settingsModal = document.getElementById('settings-modal');
  const settingsClose = document.getElementById('settings-modal-close');
  const settingsTrigger = document.getElementById('settings-trigger-btn');
  
  const chkAutoNext = document.getElementById('set-auto-next');
  const chkRandomOrder = document.getElementById('set-random-order');
  const chkHideCorrect = document.getElementById('set-hide-correct');
  
  const btnResetProgress = document.getElementById('reset-progress-btn');
  const btnResetBookmarks = document.getElementById('reset-bookmarks-btn');
  
  // Sync checkbox state with practiceSettings object on modal open
  settingsTrigger.addEventListener('click', () => {
    chkAutoNext.checked = practiceSettings.autoNext;
    chkRandomOrder.checked = practiceSettings.randomOrder;
    chkHideCorrect.checked = practiceSettings.hideCorrect;
    settingsModal.classList.add('show');
  });
  
  // Hide settings modal
  settingsClose.addEventListener('click', () => {
    settingsModal.classList.remove('show');
  });
  
  // Hide modal by clicking overlay
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove('show');
    }
  });
  
  // Watch setting switches
  chkAutoNext.addEventListener('change', () => {
    practiceSettings.autoNext = chkAutoNext.checked;
    saveSettings();
  });
  
  chkRandomOrder.addEventListener('change', () => {
    practiceSettings.randomOrder = chkRandomOrder.checked;
    shuffledQuestionsCache = null; // Clear shuffle cache to trigger fresh shuffle on toggle
    saveSettings();
    currentQuestionIndex = 0; // Reset index to avoid out-of-bounds
    renderViewport();
  });
  
  chkHideCorrect.addEventListener('change', () => {
    practiceSettings.hideCorrect = chkHideCorrect.checked;
    saveSettings();
    currentQuestionIndex = 0; // Reset index to avoid out-of-bounds
    renderViewport();
  });
  
  // Progress reset actions
  btnResetProgress.addEventListener('click', () => {
    if (confirm('⚠️ 警告：是否确定要清空您所有的刷题与答题记录，以及全部个人成就统计数据？此操作将无法撤销！如果已登录，云端记录也将同步清空。')) {
      userData.answered = {};
      userData.streak = 0;
      userData.lastStudyDate = "";
      userData.examHistory = [];
      userData.examHighScore = 0;
      
      saveUserData(); // saves to local & automatically pushes sync deletion to cloud KV
      showToast('所有答题历史记录与统计数据已成功清空！', 'success');
      settingsModal.classList.remove('show');
      currentQuestionIndex = 0;
      renderViewport();
    }
  });
  
  // Clear Wrong questions book
  const btnResetWrong = document.getElementById('reset-wrong-btn');
  if (btnResetWrong) {
    btnResetWrong.addEventListener('click', () => {
      if (confirm('⚠️ 警告：是否确定要清空您的整个错题本？此操作将无法撤销！如果已登录，云端记录也将同步清空。')) {
        userData.wrongQuestions = [];
        saveUserData(true);
        showToast('错题本已成功清空！', 'success');
        settingsModal.classList.remove('show');
        currentQuestionIndex = 0;
        renderViewport();
      }
    });
  }
  
  btnResetBookmarks.addEventListener('click', () => {
    if (confirm('⚠️ 警告：是否确定要清空收藏夹中的所有题目？此操作将无法撤销！如果已登录，云端收藏夹也将同步清空。')) {
      userData.bookmarks = [];
      saveUserData(true); // saves to local & automatically pushes sync deletion to cloud KV
      showToast('收藏夹已成功清空！', 'success');
      settingsModal.classList.remove('show');
      currentQuestionIndex = 0;
      renderViewport();
    }
  });
}

// Helper for settings-based auto-navigation
function handleAnswerSubmitted(qId, isCorrect) {

  // Update wrongQuestions
  if (isCorrect) {
    updateStudyStreak();
    const wIdx = userData.wrongQuestions.indexOf(qId);
    if (wIdx > -1) {
      userData.wrongQuestions.splice(wIdx, 1);
    }
  } else {
    if (!userData.wrongQuestions.includes(qId)) {
      userData.wrongQuestions.push(qId);
    }
  }
  saveUserData();

  if (practiceSettings.autoNext && isCorrect) {
    const questions = getFilteredQuestions();
    setTimeout(() => {
      if (currentQuestionIndex < questions.length - 1) {
        currentQuestionIndex++;
        renderViewport();
      } else {
        showToast('已答对当前列表最后一道题！', 'success');
      }
    }, 900);
  }
}


// ==========================================
//          RADAR CHART PROFICIENCY
// ==========================================
function updateRadarChart() {
  const canvas = document.getElementById('radar-chart');
  if (!canvas) return;
  
  // Calculate correct answers count for the 5 sub-topics
  let correctCounts = {
    prop_formulas: 0,
    normal_forms: 0,
    prop_deduction: 0,
    pred_formulas: 0,
    pred_deduction: 0
  };
  
  for (const qKey in userData.answered) {
    const qObj = QUESTIONS.find(q => `${q.category}_${q.original_num}` === qKey);
    if (qObj && qObj.sub_topic && userData.answered[qKey].isCorrect) {
      correctCounts[qObj.sub_topic]++;
    }
  }
  
  // Compute mastery score (0 to 100% of maximum possible correct answers in each topic)
  const dataValues = [
    Math.round((correctCounts.prop_formulas / 14) * 100), // 14 Qs
    Math.round((correctCounts.normal_forms / 8) * 100),   // 8 Qs
    Math.round((correctCounts.prop_deduction / 7) * 100), // 7 Qs
    Math.round((correctCounts.pred_formulas / 17) * 100), // 17 Qs
    Math.round((correctCounts.pred_deduction / 10) * 100)  // 10 Qs
  ];
  
  // Determine text and grid colors based on theme
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
  const angleColor = isDark ? '#cbd5e1' : '#1e293b';
  
  if (radarChartInstance) {
    radarChartInstance.destroy();
  }
  
  const ctx = canvas.getContext('2d');
  radarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['命题公式/真值表', '标准范式/联结词', '命题逻辑推理', '一阶谓词公式', '谓词逻辑推理'],
      datasets: [{
        label: '掌握度 (%)',
        data: dataValues,
        backgroundColor: 'rgba(99, 102, 241, 0.18)',
        borderColor: 'rgba(99, 102, 241, 0.85)',
        borderWidth: 2,
        pointBackgroundColor: '#ec4899',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#ec4899',
        pointRadius: 3.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          titleColor: isDark ? '#ffffff' : '#0f172a',
          bodyColor: isDark ? '#cbd5e1' : '#334155',
          borderColor: 'rgba(99, 102, 241, 0.2)',
          borderWidth: 1,
          displayColors: false
        }
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
            display: false
          },
          grid: {
            color: gridColor
          },
          angleLines: {
            color: gridColor
          },
          pointLabels: {
            color: angleColor,
            font: {
              family: 'inherit',
              size: 10,
              weight: 'bold'
            }
          }
        }
      }
    }
  });
}

// Watch theme change event to refresh chart colors
const originalThemeToggle = document.getElementById('theme-toggle');
if (originalThemeToggle) {
  originalThemeToggle.addEventListener('click', () => {
    // Wait for DOM attribute change to apply before updating chart colors
    setTimeout(updateRadarChart, 100);
  });
}


// Streak & Daily Challenge Helpers
function getYesterdayDateString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('zh-CN');
}

function updateStudyStreak() {
  const todayStr = new Date().toLocaleDateString('zh-CN');
  if (userData.lastStudyDate === todayStr) return; // Already studied today
  
  const yesterdayStr = getYesterdayDateString();
  if (userData.lastStudyDate === yesterdayStr) {
    userData.streak++;
  } else {
    userData.streak = 1; // Streak broken or first time
  }
  
  userData.lastStudyDate = todayStr;
  saveUserData();
}

function checkDailyChallengeCompletion() {
  if (userData.dailyChallenge.completed) return;
  
  // Check if all 3 questions in the daily challenge are answered correctly
  const allCorrect = userData.dailyChallenge.questions.every(qKey => {
    return userData.answered[qKey] && userData.answered[qKey].isCorrect;
  });
  
  if (allCorrect) {
    userData.dailyChallenge.completed = true;
    updateStudyStreak();
    saveUserData();
    
    showToast('恭喜！今日挑战全部完成，打卡成功！', 'success');
    
    // Confetti explosion
    if (typeof confetti === 'function') {
      confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } });
    }
  }
}


// ==========================================
//          Q&A COMMENTS API FLOWS
// ==========================================

async function loadComments(qId, panel) {
  const commentList = panel.querySelector('#comment-list');
  const countBadge = panel.querySelector('#comment-count-badge');
  const inputRow = panel.querySelector('#comment-input-row');
  
  if (!commentList) return;
  
  commentList.innerHTML = `<div class="comment-empty-msg">正在加载讨论帖子...</div>`;
  
  try {
    const response = await fetch(`${API_BASE}/comments?q=${qId}`);
    if (!response.ok) throw new Error("加载失败");
    
    const comments = await response.json();
    
    if (comments.length === 0) {
      commentList.innerHTML = `<div class="comment-empty-msg">💬 暂无讨论。写下你的第一个疑问或心得开启话题吧！</div>`;
      if (countBadge) countBadge.innerText = "0 条讨论";
    } else {
      let listHtml = "";
      comments.forEach(c => {
        const timeStr = new Date(c.timestamp).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        
        listHtml += `
          <div class="comment-item">
            <div class="comment-user-avatar">${c.username.substring(0, 1).toUpperCase()}</div>
            <div class="comment-bubble">
              <div class="comment-meta">
                <span style="color: var(--text-primary); font-weight: 700;">${escapeHtml(c.username)}</span>
                <span>${timeStr}</span>
              </div>
              <div class="comment-text">${escapeHtml(c.content)}</div>
            </div>
          </div>
        `;
      });
      commentList.innerHTML = listHtml;
      if (countBadge) countBadge.innerText = `${comments.length} 条讨论`;
      
      // Auto-scroll comment list to the bottom
      commentList.scrollTop = commentList.scrollHeight;
    }
  } catch (err) {
    commentList.innerHTML = `<div class="comment-empty-msg" style="color:var(--error);">✕ 讨论板加载失败，请检查网络！</div>`;
  }
  
  // Render Input row depending on auth status
  const token = localStorage.getItem('dm_jwt_token');
  if (token) {
    inputRow.innerHTML = `
      <div style="display:flex; gap:0.5rem; width:100%;">
        <input type="text" id="comment-input" placeholder="写下你的看法或疑点..." style="flex: 1; padding: 0.55rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-family: inherit; font-size: 0.85rem;" autocomplete="off">
        <button class="btn btn-primary" id="comment-submit" style="padding: 0.55rem 1rem; font-size: 0.85rem; font-weight:600;">发布</button>
      </div>
    `;
    
    const submitBtn = inputRow.querySelector('#comment-submit');
    const inputField = inputRow.querySelector('#comment-input');
    
    submitBtn.addEventListener('click', () => postComment(qId, panel));
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') postComment(qId, panel);
    });
  } else {
    inputRow.innerHTML = `
      <div style="text-align: center; font-size: 0.82rem; color: var(--text-muted); padding: 0.6rem 0; border: 1px dashed var(--border-color); border-radius: var(--radius-sm);">
        🔒 请先 <a href="#" id="comment-login-trigger" style="color: var(--primary); font-weight: 700; text-decoration: underline;">登录</a> 以参与讨论区互动
      </div>
    `;
    
    inputRow.querySelector('#comment-login-trigger').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-trigger-btn').click(); // Open auth modal
    });
  }
}

async function postComment(qId, panel) {
  const inputField = panel.querySelector('#comment-input');
  if (!inputField) return;
  
  const content = inputField.value.trim();
  if (!content) {
    showToast('留言内容不能为空！', 'error');
    return;
  }
  
  const token = localStorage.getItem('dm_jwt_token');
  if (!token) {
    showToast('请先登录账号！', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ qId, content })
    });
    
    const result = await response.json();
    if (response.ok) {
      inputField.value = '';
      showToast('发布留言成功！', 'success');
      
      // Reload comments list with server data
      loadComments(qId, panel);
    } else {
      showToast(result.error || '发布失败，请重试！', 'error');
    }
  } catch (err) {
    showToast('服务器连接失败，请稍后重试！', 'error');
  }
}


// ==========================================
//          AI MATH TUTOR FLOWS
// ==========================================

// ==========================================
//        FLOATING AI ASSISTANT OVERLAY
// ==========================================

// Chinese Helper for question category
function getCategoryChineseName(cat) {
  switch(cat) {
    case 'judgment': return '判断题';
    case 'single_choice': return '单选题';
    case 'fill_blank': return '填空题';
    case 'calculation': return '计算题';
    case 'proof': return '证明题';
    case 'application': return '应用题';
    default: return '客观题';
  }
}

// Dynamically shift layout by updating main content padding-right
function updateMainContentPadding() {
  // No-op: Prevent popup from shifting or altering the main page layout
}

// Update the AI context header with context size and estimated tokens
function updateAiContextBar(q) {
  const contextBar = document.getElementById('ai-window-context-bar');
  if (!contextBar) return;
  if (!q) {
    contextBar.innerHTML = `<span>📌 当前未关联具体题目</span>`;
    return;
  }
  
  let catBadgeName = getCategoryChineseName(q.category);
  
  // Calculate total characters in context
  let totalChars = q.question.length + (q.analysis || '').length;
  aiConversationHistory.forEach(msg => {
    totalChars += msg.content.length;
  });
  
  // Estimate tokens (approx 0.75 tokens per char + baseline prompt template overhead)
  let estTokens = Math.round(totalChars * 0.75) + 180;
  
  contextBar.innerHTML = `
    <span style="font-weight:700;">📌 关联: ${catBadgeName} 原卷第 ${q.original_num} 题</span>
    <span style="font-size:0.68rem; color:var(--primary); font-weight:700; background-color:var(--primary-light); padding:0.15rem 0.35rem; border-radius:4px;">
      长: ${totalChars}字 (~${estTokens} Token)
    </span>
  `;
}

function setupFloatingAiTutor() {
  // Prevent duplicate insertion
  if (document.getElementById('ai-floating-toggle')) return;
  
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'ai-floating-toggle';
  toggleBtn.title = 'AI 助教答疑';
  toggleBtn.innerHTML = '🤖';
  document.body.appendChild(toggleBtn);

  const windowDiv = document.createElement('div');
  windowDiv.id = 'ai-floating-window';
  windowDiv.innerHTML = `
    <!-- Left Resizing Handle -->
    <div id="ai-resize-handle" style="position: absolute; left: 0; top: 0; width: 6px; height: 100%; cursor: ew-resize; z-index: 1001; background: transparent; transition: background 0.2s;"></div>

    <div class="ai-window-header" style="user-select: none;">
      <div class="ai-window-title">
        <span>🤖 AI 离散数学助教</span>
      </div>
      <button class="ai-window-close" id="ai-window-close-btn">&times;</button>
    </div>
    
    <!-- Model Switcher, Intensity & Stream Selectors -->
    <div style="padding: 0.5rem 1rem; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.5rem; user-select: none;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
        <div style="display:flex; flex-direction:column; gap:0.2rem;">
          <span style="font-size: 0.68rem; font-weight: 700; color: var(--text-muted);">🔮 选择大模型:</span>
          <select id="ai-model-selector" style="font-size: 0.72rem; padding: 0.2rem 0.3rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background-color: var(--bg-primary); color: var(--text-primary); cursor: pointer; outline: none; font-weight:600; width:100%;">
            <option value="@cf/meta/llama-3.3-70b-instruct-fp8-fast" selected>Llama 3.3 70B (旗舰)</option>
            <option value="@cf/qwen/qwen3-30b-a3b-fp8">Qwen 3 MoE (中文)</option>
            <option value="@cf/qwen/qwen2.5-coder-32b-instruct">Qwen Coder (代码)</option>
            <option value="@cf/qwen/qwq-32b">QwQ 32B (数学)</option>
            <option value="@cf/deepseek-ai/deepseek-r1-distill-qwen-32b">DeepSeek R1 (推理)</option>
          </select>
        </div>
        <div style="display:flex; flex-direction:column; gap:0.2rem;">
          <span style="font-size: 0.68rem; font-weight: 700; color: var(--text-muted);">🧠 思考强度:</span>
          <select id="ai-intensity-selector" style="font-size: 0.72rem; padding: 0.2rem 0.3rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background-color: var(--bg-primary); color: var(--text-primary); cursor: pointer; outline: none; font-weight:600; width:100%;">
            <option value="low">低 (精简直答)</option>
            <option value="medium" selected>中 (标准思考)</option>
            <option value="high">高 (深度探究)</option>
          </select>
        </div>
      </div>
      <label style="display:flex; align-items:center; gap:0.35rem; cursor:pointer; font-size:0.7rem; font-weight:600; color:var(--text-muted); margin-top:0.15rem;">
        <input type="checkbox" id="ai-stream-toggle" checked style="cursor:pointer; width:14px; height:14px; accent-color:var(--primary);">
        <span>⚡ 启用打字机流式输出 (更流畅)</span>
      </label>
    </div>
    
    <div class="ai-window-context" id="ai-window-context-bar" style="user-select: none;">
      <span>📌 当前未关联具体题目</span>
    </div>
    <div class="ai-window-chat" id="ai-chat-area-floating">
      <div class="ai-msg-bubble assistant">
        你好！我是你的离散数学AI助教。在刷题或模拟考试中遇到任何疑问，点击题目右上角的 <b>🤖 问助教</b> 按钮，我将自动关联这道题的上下文并在这里为您解答！支持多轮追问，窗口顶栏支持拖动，左侧边缘支持拖拽拉伸宽度！
      </div>
    </div>
    <div class="ai-window-input-row">
      <input type="text" id="ai-query-input-floating" placeholder="对当前关联的题目有什么不懂？问问我吧..." autocomplete="off">
      <button id="ai-query-submit-floating">提问</button>
    </div>
  `;
  document.body.appendChild(windowDiv);
  
  // Binding close & toggle events
  toggleBtn.addEventListener('click', () => {
    windowDiv.classList.toggle('active');
    updateMainContentPadding();
  });
  
  windowDiv.querySelector('#ai-window-close-btn').addEventListener('click', () => {
    windowDiv.classList.remove('active');
    updateMainContentPadding();
  });
  
  const submitBtn = windowDiv.querySelector('#ai-query-submit-floating');
  const inputField = windowDiv.querySelector('#ai-query-input-floating');
  
  submitBtn.addEventListener('click', askFloatingAiTutor);
  inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') askFloatingAiTutor();
  });

  // Highlight resize handle on hover
  const resizeHandle = windowDiv.querySelector('#ai-resize-handle');
  resizeHandle.addEventListener('mouseenter', () => {
    resizeHandle.style.background = 'rgba(99, 102, 241, 0.2)';
  });
  resizeHandle.addEventListener('mouseleave', () => {
    resizeHandle.style.background = 'transparent';
  });

  // DRAG ENGINE (拖拽移动窗口)
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let windowStartX = 0;
  let windowStartY = 0;
  
  const header = windowDiv.querySelector('.ai-window-header');
  header.style.cursor = 'move';
  
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('#ai-window-close-btn')) return;
    
    isDragging = true;
    windowDiv.style.transition = 'none'; // Disable transition for buttery performance
    
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    
    const rect = windowDiv.getBoundingClientRect();
    windowStartX = rect.left;
    windowStartY = rect.top;
    
    // Convert to absolute positioning
    windowDiv.style.right = 'auto';
    windowDiv.style.bottom = 'auto';
    windowDiv.style.left = windowStartX + 'px';
    windowDiv.style.top = windowStartY + 'px';
    
    updateMainContentPadding(); // Shift layout off if dragged away
    e.preventDefault();
  });

  // RESIZE ENGINE (拉伸调整宽度)
  let isResizing = false;
  let resizeStartX = 0;
  let windowStartWidth = 0;
  let windowStartLeft = 0;
  let isDockedRight = true;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    windowDiv.style.transition = 'none'; // Disable transition for buttery performance
    
    resizeStartX = e.clientX;
    
    const rect = windowDiv.getBoundingClientRect();
    windowStartWidth = rect.width;
    windowStartLeft = rect.left;
    
    isDockedRight = (windowDiv.style.right !== 'auto');
    e.preventDefault();
  });

  // Combined Move & Resize Mouse Listeners
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      
      windowDiv.style.left = (windowStartX + dx) + 'px';
      windowDiv.style.top = (windowStartY + dy) + 'px';
    }
    
    if (isResizing) {
      const dx = e.clientX - resizeStartX;
      let newWidth = windowStartWidth;
      
      if (isDockedRight) {
        newWidth = windowStartWidth - dx;
      } else {
        newWidth = windowStartWidth - dx;
        if (newWidth >= 300 && newWidth <= 800) {
          windowDiv.style.left = (windowStartLeft + dx) + 'px';
        }
      }
      
      // Limit bounds
      if (newWidth < 300) newWidth = 300;
      if (newWidth > 800) newWidth = 800;
      
      windowDiv.style.width = newWidth + 'px';
      
      if (isDockedRight) {
        const mainContent = document.querySelector('.main-content');
        if (mainContent && mainContent.classList.contains('ai-open')) {
          mainContent.style.paddingRight = (newWidth + 40) + 'px';
        }
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging || isResizing) {
      isDragging = false;
      isResizing = false;
      windowDiv.style.transition = ''; // Restore smooth transitions
    }
  });
}

function bindQuestionToAi(q) {
  currentAiQuestion = q;
  
  // Clear conversation history on binding a new question
  aiConversationHistory = [];
  
  // Open the window
  const windowDiv = document.getElementById('ai-floating-window');
  if (windowDiv) {
    windowDiv.classList.add('active');
  }
  
  updateAiContextBar(q);
  updateMainContentPadding();
  
  let catBadgeName = getCategoryChineseName(q.category);
  
  // Append binding greeting bubble
  const chatArea = document.getElementById('ai-chat-area-floating');
  if (chatArea) {
    const greetingDiv = document.createElement('div');
    greetingDiv.className = 'ai-msg-bubble assistant';
    greetingDiv.style.borderLeft = '3px solid var(--primary)';
    greetingDiv.innerHTML = `已成功绑定：<b>${catBadgeName} (原卷第 ${q.original_num} 题)</b>。<br/>已为你载入试题上下文。支持多轮连续追问，请在下方发问！`;
    chatArea.appendChild(greetingDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}

async function askFloatingAiTutor() {
  const inputField = document.getElementById('ai-query-input-floating');
  const chatArea = document.getElementById('ai-chat-area-floating');
  const modelSelect = document.getElementById('ai-model-selector');
  const streamToggle = document.getElementById('ai-stream-toggle');
  if (!inputField || !chatArea) return;
  
  const query = inputField.value.trim();
  if (!query) {
    showToast('请输入问题！', 'error');
    return;
  }
  
  if (!currentAiQuestion) {
    showToast('请先在题卡上点击 🤖 问助教 按钮以绑定题目！', 'warning');
    return;
  }
  
  const chosenModel = modelSelect ? modelSelect.value : '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const selectedModelName = modelSelect ? modelSelect.options[modelSelect.selectedIndex].text.split(' ')[0] : 'AI';
  const useStreaming = streamToggle ? streamToggle.checked : true;
  
  // Append User message in UI
  const userMsgDiv = document.createElement('div');
  userMsgDiv.className = 'ai-msg-bubble user';
  userMsgDiv.innerText = query;
  chatArea.appendChild(userMsgDiv);
  
  // Push to conversation history array
  aiConversationHistory.push({ role: 'user', content: query });
  updateAiContextBar(currentAiQuestion);
  
  // Append AI Loading state
  const aiLoadingDiv = document.createElement('div');
  aiLoadingDiv.className = 'ai-msg-bubble assistant';
  aiLoadingDiv.innerHTML = `<span style="color:var(--text-muted);">AI 助教使用 <b>${selectedModelName}</b> 推演中...</span>`;
  chatArea.appendChild(aiLoadingDiv);
  
  // Clear input & scroll
  inputField.value = '';
  chatArea.scrollTop = chatArea.scrollHeight;
  
  const intensitySelect = document.getElementById('ai-intensity-selector');
  const chosenIntensity = intensitySelect ? intensitySelect.value : 'medium';

  // Pre-prepare reply bubble shell
  const aiReplyDiv = document.createElement('div');
  aiReplyDiv.className = 'ai-msg-bubble assistant';

  if (useStreaming) {
    try {
      const response = await fetch(`${API_BASE}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: currentAiQuestion.question,
          analysis: currentAiQuestion.analysis,
          userQuery: query,
          model: chosenModel,
          history: aiConversationHistory,
          thinkingIntensity: chosenIntensity,
          stream: true
        })
      });
      
      aiLoadingDiv.remove();
      
      if (!response.ok) {
        const result = await response.json();
        aiReplyDiv.innerHTML = `<span style="color:var(--error);">✕ 助教答疑失败: ${result.error || "请求异常"}</span>`;
        chatArea.appendChild(aiReplyDiv);
        aiConversationHistory.pop();
        updateAiContextBar(currentAiQuestion);
        chatArea.scrollTop = chatArea.scrollHeight;
        return;
      }
      
      // Initialize streaming DOM structure inside reply bubble
      aiReplyDiv.innerHTML = `
        <div class="ai-thinking-accordion" style="display:none; margin-bottom:0.75rem; border:1px solid var(--border-color); border-radius:var(--radius-sm); overflow:hidden; background-color:rgba(0,0,0,0.02);">
          <button class="ai-thinking-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.querySelector('.arrow').innerText = this.nextElementSibling.style.display === 'none' ? '▶' : '▼';" style="width:100%; border:none; background:transparent; padding:0.4rem 0.6rem; font-size:0.75rem; font-weight:700; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center; cursor:pointer; text-align:left;">
            <span style="display:flex; align-items:center; gap:0.25rem;">💡 思考过程 (${selectedModelName})</span>
            <span class="arrow" style="font-size:0.6rem; color:var(--text-muted);">▼</span>
          </button>
          <div class="ai-thinking-body" style="display:none; padding:0.5rem 0.6rem; border-top:1px dashed var(--border-color); font-size:0.75rem; color:var(--text-muted); line-height:1.45; white-space:pre-wrap; background-color:rgba(0,0,0,0.005);"></div>
        </div>
        <div class="ai-main-body" style="min-height: 20px;"></div>
      `;
      chatArea.appendChild(aiReplyDiv);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let fullText = "";
      let hasFinishedThinking = false;
      
      // Helper parser for streaming text chunk by chunk
      function parseAndRenderStream(text) {
        let thinkingText = "";
        let mainText = text;
        
        const thinkStart = text.indexOf("<think>");
        const thinkEnd = text.indexOf("</think>");
        
        if (thinkStart !== -1) {
          if (thinkEnd !== -1) {
            thinkingText = text.substring(thinkStart + 7, thinkEnd).trim();
            mainText = text.substring(thinkEnd + 8).trim();
            
            // Automatically collapse once finished thinking
            if (!hasFinishedThinking) {
              hasFinishedThinking = true;
              const body = aiReplyDiv.querySelector('.ai-thinking-body');
              const arrow = aiReplyDiv.querySelector('.arrow');
              if (body) body.style.display = 'none';
              if (arrow) arrow.innerText = '▶';
            }
          } else {
            thinkingText = text.substring(thinkStart + 7).trim();
            mainText = "";
          }
        }
        
        // Update thinking body contents
        const thinkBody = aiReplyDiv.querySelector('.ai-thinking-body');
        if (thinkBody && thinkingText) {
          thinkBody.innerText = thinkingText;
          const accordion = aiReplyDiv.querySelector('.ai-thinking-accordion');
          if (accordion) accordion.style.display = 'block';
          if (!hasFinishedThinking) {
            if (thinkBody.style.display === 'none') {
              thinkBody.style.display = 'block';
              const arrow = aiReplyDiv.querySelector('.arrow');
              if (arrow) arrow.innerText = '▼';
            }
          }
        }
        
        // Update main content body
        const mainBody = aiReplyDiv.querySelector('.ai-main-body');
        if (mainBody && mainText) {
          mainBody.innerHTML = marked.parse(mainText);
          renderMath(mainBody);
        }
        
        chatArea.scrollTop = chatArea.scrollHeight;
      }
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep last incomplete line
        
        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned) continue;
          if (cleaned.startsWith("data: ")) {
            const dataStr = cleaned.slice(6).trim();
            if (dataStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(dataStr);
              const chunk = parsed.response || parsed.text || "";
              fullText += chunk;
              parseAndRenderStream(fullText);
            } catch (err) {
              // ignore incomplete JSON strings
            }
          }
        }
      }
      
      // Finished streaming: Append simulated token usage badge at bottom
      const estPromptTokens = Math.round(JSON.stringify(aiConversationHistory).length * 0.25) + 120;
      const estCompletionTokens = Math.round(fullText.length * 0.25);
      const estTotalTokens = estPromptTokens + estCompletionTokens;
      
      const usageBadge = document.createElement('div');
      usageBadge.style.fontSize = '0.65rem';
      usageBadge.style.color = 'var(--text-muted)';
      usageBadge.style.marginTop = '0.4rem';
      usageBadge.style.borderTop = '1px dashed var(--border-color)';
      usageBadge.style.paddingTop = '0.25rem';
      usageBadge.style.display = 'flex';
      usageBadge.style.justifyContent = 'space-between';
      usageBadge.style.alignItems = 'center';
      usageBadge.innerHTML = `
        <span>🔮 ${selectedModelName} (流式)</span>
        <span>Tokens: ~Prompt ${estPromptTokens} \| ~Reply ${estCompletionTokens} \| ~Total ${estTotalTokens}</span>
      `;
      aiReplyDiv.appendChild(usageBadge);
      
      // Push assistant response to history
      aiConversationHistory.push({ role: 'assistant', content: fullText });
      updateAiContextBar(currentAiQuestion);
      
    } catch (err) {
      aiLoadingDiv.remove();
      aiReplyDiv.innerHTML = `<span style="color:var(--error);">✕ 连接 AI 服务失败或流式读取中断，请重试！</span>`;
      chatArea.appendChild(aiReplyDiv);
      aiConversationHistory.pop();
      updateAiContextBar(currentAiQuestion);
    }
  } else {
    // Normal JSON Non-streaming request
    try {
      const response = await fetch(`${API_BASE}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: currentAiQuestion.question,
          analysis: currentAiQuestion.analysis,
          userQuery: query,
          model: chosenModel,
          history: aiConversationHistory,
          thinkingIntensity: chosenIntensity,
          stream: false
        })
      });
      
      const result = await response.json();
      aiLoadingDiv.remove();
      
      if (response.ok) {
        // Extract <think>...</think> block if present (robust regex parsing)
        let rawText = result.response;
        let thinkingText = "";
        
        const thinkRegex = /<think>([\s\S]*?)<\/think>/i;
        const match = rawText.match(thinkRegex);
        if (match) {
          thinkingText = match[1].trim();
          rawText = rawText.replace(thinkRegex, "").trim();
        } else {
          // Fallback for missing closing tag
          const openIndex = rawText.toLowerCase().indexOf("<think>");
          if (openIndex !== -1) {
            thinkingText = rawText.substring(openIndex + 7).trim();
            rawText = rawText.substring(0, openIndex).trim();
          }
        }
        
        // Render Collapsible Thinking Accordion
        let thinkingHtml = "";
        if (thinkingText) {
          thinkingHtml = `
            <div class="ai-thinking-accordion" style="margin-bottom:0.75rem; border:1px solid var(--border-color); border-radius:var(--radius-sm); overflow:hidden; background-color:rgba(0,0,0,0.02);">
              <button class="ai-thinking-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.querySelector('.arrow').innerText = this.nextElementSibling.style.display === 'none' ? '▶' : '▼';" style="width:100%; border:none; background:transparent; padding:0.4rem 0.6rem; font-size:0.75rem; font-weight:700; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center; cursor:pointer; text-align:left;">
                <span style="display:flex; align-items:center; gap:0.25rem;">💡 思考过程 (${selectedModelName})</span>
                <span class="arrow" style="font-size:0.6rem; color:var(--text-muted);">▶</span>
              </button>
              <div class="ai-thinking-body" style="display:none; padding:0.5rem 0.6rem; border-top:1px dashed var(--border-color); font-size:0.75rem; color:var(--text-muted); line-height:1.45; white-space:pre-wrap; background-color:rgba(0,0,0,0.005);">
                ${thinkingText}
              </div>
            </div>
          `;
        }
        
        // Combine thinking block and markdown result
        aiReplyDiv.innerHTML = thinkingHtml + marked.parse(rawText);
        
        // Render token usage metadata badge
        const usage = result.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        const usageBadge = document.createElement('div');
        usageBadge.style.fontSize = '0.65rem';
        usageBadge.style.color = 'var(--text-muted)';
        usageBadge.style.marginTop = '0.4rem';
        usageBadge.style.borderTop = '1px dashed var(--border-color)';
        usageBadge.style.paddingTop = '0.25rem';
        usageBadge.style.display = 'flex';
        usageBadge.style.justifyContent = 'space-between';
        usageBadge.style.alignItems = 'center';
        usageBadge.innerHTML = `
          <span>🔮 ${selectedModelName}</span>
          <span>Tokens: Prompt ${usage.prompt_tokens} \| Reply ${usage.completion_tokens} \| Total ${usage.total_tokens}</span>
        `;
        aiReplyDiv.appendChild(usageBadge);
        chatArea.appendChild(aiReplyDiv);
        renderMath(aiReplyDiv);
        
        // Push assistant response to history
        aiConversationHistory.push({ role: 'assistant', content: result.response });
        updateAiContextBar(currentAiQuestion);
      } else {
        aiReplyDiv.innerHTML = `<span style="color:var(--error);">✕ 助教答疑失败: ${result.error || "请求异常"}</span>`;
        chatArea.appendChild(aiReplyDiv);
        aiConversationHistory.pop();
        updateAiContextBar(currentAiQuestion);
      }
    } catch (err) {
      aiLoadingDiv.remove();
      aiReplyDiv.innerHTML = `<span style="color:var(--error);">✕ 连接 AI 服务失败，请检查网络！</span>`;
      chatArea.appendChild(aiReplyDiv);
      aiConversationHistory.pop();
      updateAiContextBar(currentAiQuestion);
    }
  }
  
  chatArea.scrollTop = chatArea.scrollHeight;
}


// ============================================================================
//            CLOUDFLARE WORKERS/PAGES USAGE METRICS HANDLERS
// ============================================================================

function renderCloudflareUsageCard(container) {
  const usageContainer = container.querySelector('#cf-usage-container');
  if (!usageContainer) return;
  
  const cfAccountId = localStorage.getItem('cf_account_id');
  const cfApiToken = localStorage.getItem('cf_api_token');
  
  // Clean up any running timers
  if (cfCountdownInterval) {
    clearInterval(cfCountdownInterval);
    cfCountdownInterval = null;
  }
  
  if (!cfAccountId || !cfApiToken) {
    // Show configuration form
    usageContainer.innerHTML = `
      <div class="dashboard-card" style="padding: 1.5rem; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 1rem;">
        <h3 style="margin: 0; font-size: 0.95rem; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
          📊 Workers/Pages 请求使用情况
        </h3>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0; line-height:1.45;">
          输入您的 Cloudflare 凭证即可在此直观监测当前账号今日 Workers 与 Pages 的请求额度消耗进度与重置倒计时。
        </p>
        <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.25rem;">
          <div style="display:flex; flex-direction:column; gap:0.25rem;">
            <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Cloudflare Account ID</label>
            <input type="text" id="cf-account-id" placeholder="输入您的 32 位 Account ID..." style="padding: 0.55rem 0.75rem; font-size: 0.8rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); outline: none;">
          </div>
          <div style="display:flex; flex-direction:column; gap:0.25rem;">
            <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Cloudflare API Token</label>
            <input type="password" id="cf-api-token" placeholder="输入具有 Account Analytics: Read 权限的 API 令牌..." style="padding: 0.55rem 0.75rem; font-size: 0.8rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); outline: none;">
          </div>
          <button class="btn btn-primary" id="cf-save-btn" style="padding: 0.6rem; font-size: 0.85rem; font-weight: 700; width: 100%; margin-top: 0.25rem; cursor: pointer;">
            确认绑定并查询使用进度
          </button>
        </div>
      </div>
    `;
    
    usageContainer.querySelector('#cf-save-btn').addEventListener('click', () => {
      const idInput = usageContainer.querySelector('#cf-account-id').value.trim();
      const tokenInput = usageContainer.querySelector('#cf-api-token').value.trim();
      
      if (!idInput || !tokenInput) {
        showToast('Account ID 和 API Token 均不能为空！', 'error');
        return;
      }
      
      localStorage.setItem('cf_account_id', idInput);
      localStorage.setItem('cf_api_token', tokenInput);
      showToast('Cloudflare 凭证保存成功，正在获取数据...', 'success');
      renderCloudflareUsageCard(container);
    });
    
  } else {
    // Show loading state and fetch usage from server
    usageContainer.innerHTML = `
      <div class="dashboard-card" style="padding: 2rem; text-align: center; color: var(--text-muted); display:flex; flex-direction:column; align-items:center; gap:0.5rem; justify-content:center;">
        <span style="font-size:1.5rem; animation: pulse 1s infinite;">📡</span>
        <span style="font-size:0.85rem; font-weight:600;">正在建立安全代理连接，实时抓取 Cloudflare 额度数据...</span>
      </div>
    `;
    
    fetchCloudflareUsage(cfAccountId, cfApiToken, usageContainer);
  }
}

async function fetchCloudflareUsage(accountId, apiToken, targetContainer) {
  const token = localStorage.getItem('dm_jwt_token');
  try {
    const response = await fetch(`${API_BASE}/cf-usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ accountId, apiToken })
    });
    
    if (response.ok) {
      const result = await response.json();
      
      const workers = result.workersRequests;
      const pages = result.pagesRequests;
      const total = result.totalRequests;
      const quota = result.quota;
      const pct = parseFloat(((total / quota) * 100).toFixed(2));
      let secondsLeft = result.secondsRemaining;
      
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      
      // Helper function to format seconds into timer HTML
      function getTimerHtml(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `<span style="color:#d97706; font-weight:700;">${hours}</span>小时<span style="color:#d97706; font-weight:700;">${minutes}</span>分<span style="color:#d97706; font-weight:700;">${secs}</span>秒`;
      }
      
      targetContainer.innerHTML = `
        <div class="dashboard-card" style="padding: 1.5rem; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 1.15rem; animation: fadeIn 0.4s ease;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin: 0; font-size: 0.95rem; font-weight: 800; color: var(--text-primary);">📊 Workers/Pages 请求使用情况</h3>
            <button class="btn btn-outline" id="cf-reconfig-btn" style="padding: 0.25rem 0.5rem; font-size: 0.72rem; font-weight: 700; border-radius: 8px; cursor:pointer;">⚙️ 重设凭证</button>
          </div>

          <!-- Progress Bar -->
          <div style="background-color: var(--bg-secondary); border-radius: 9999px; height: 24px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; width: 100%; border: 1px solid var(--border-color);">
            <div id="cf-progress-bar" style="background: linear-gradient(90deg, var(--primary), var(--accent)); height: 100%; position: absolute; left: 0; top: 0; transition: width 0.6s ease; width: ${Math.min(100, pct)}%;"></div>
            <span id="cf-progress-text" style="color: var(--text-primary); font-size: 0.78rem; font-weight: 700; z-index: 1; text-shadow: ${isDark ? '0 1px 2px rgba(0,0,0,0.8)' : '0 1px 2px rgba(255,255,255,0.8)'}; user-select:none;">
              请求使用进度: ${total.toLocaleString()} (${pct}%)
            </span>
          </div>

          <!-- Stats Grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; border-left: 4px solid var(--primary); background-color: rgba(99, 102, 241, 0.04); padding: 1.15rem; border-radius: 0 var(--radius-md) var(--radius-md) 0; border: 1px solid var(--border-color);">
            <div style="display:flex; flex-direction:column; gap:0.25rem;">
              <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Workers 请求</span>
              <span style="font-size: 1.6rem; font-weight: 800; color: var(--success);">${workers.toLocaleString()}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.25rem;">
              <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Pages 请求</span>
              <span style="font-size: 1.6rem; font-weight: 800; color: var(--primary);">${pages.toLocaleString()}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.25rem;">
              <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">日配额</span>
              <span style="font-size: 1.6rem; font-weight: 800; color: var(--warning);">${quota.toLocaleString()}</span>
            </div>
          </div>

          <!-- Info Alert -->
          <div style="background-color: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: var(--radius-md); padding: 0.85rem; display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.45;">
            <span style="font-size:1rem;">ℹ️</span>
            <div>
              <strong>每日请求数重置清零：</strong>
              距离重置还有 <span id="cf-countdown-timer">${getTimerHtml(secondsLeft)}</span>，北京时间 (UTC+8) <strong>8:00</strong> 重置，今日使用情况总计：<strong style="color:#d97706;">${total.toLocaleString()}</strong>。
            </div>
          </div>
        </div>
      `;
      
      // Bind reconfig
      targetContainer.querySelector('#cf-reconfig-btn').addEventListener('click', () => {
        localStorage.removeItem('cf_account_id');
        localStorage.removeItem('cf_api_token');
        renderCloudflareUsageCard(document.getElementById('viewport'));
      });
      
      // Start Countdown Timer
      const countdownTimerEl = targetContainer.querySelector('#cf-countdown-timer');
      cfCountdownInterval = setInterval(() => {
        if (secondsLeft > 0) {
          secondsLeft--;
          if (countdownTimerEl) {
            countdownTimerEl.innerHTML = getTimerHtml(secondsLeft);
          }
        } else {
          // Timer expired, re-render card to fetch fresh data
          clearInterval(cfCountdownInterval);
          renderCloudflareUsageCard(document.getElementById('viewport'));
        }
      }, 1000);
      
    } else {
      const errRes = await response.json();
      renderErrorCard(targetContainer, errRes.error || '获取使用率出错！');
    }
  } catch (err) {
    renderErrorCard(targetContainer, '网络连接异常，无法获取额度详情。');
  }
}

function renderErrorCard(targetContainer, errMsg) {
  targetContainer.innerHTML = `
    <div class="dashboard-card" style="padding: 1.5rem; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 1rem; border-color: rgba(239, 68, 68, 0.3);">
      <h3 style="margin: 0; font-size: 0.95rem; font-weight: 800; color: var(--error); display: flex; align-items: center; gap: 0.5rem;">
        ⚠️ 获取 Cloudflare 额度失败
      </h3>
      <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0; line-height:1.45;">
        错误信息: ${errMsg}
      </p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
        <button class="btn btn-outline" id="cf-retry-btn" style="padding: 0.5rem; font-size: 0.8rem; font-weight:700; cursor:pointer;">🔄 重新获取</button>
        <button class="btn btn-outline" id="cf-reset-err-btn" style="padding: 0.5rem; font-size: 0.8rem; font-weight:700; cursor:pointer; color:var(--text-secondary);">⚙️ 修改凭据</button>
      </div>
    </div>
  `;
  
  targetContainer.querySelector('#cf-retry-btn').addEventListener('click', () => {
    renderCloudflareUsageCard(document.getElementById('viewport'));
  });
  
  targetContainer.querySelector('#cf-reset-err-btn').addEventListener('click', () => {
    localStorage.removeItem('cf_account_id');
    localStorage.removeItem('cf_api_token');
    renderCloudflareUsageCard(document.getElementById('viewport'));
  });
}
