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
let globalCfCountdownInterval = null;

let shuffledQuestionsCache = null;
let radarChartInstance = null;
let currentAiQuestion = null;
let aiConversationHistory = [];
let lastFilteredIdsKey = ""; // To track if the pool changed

function getExpectedCfScriptName() {
  const hostname = window.location.hostname;
  if (hostname.endsWith('.pages.dev')) {
    return 'pages-' + hostname.split('.')[0];
  }
  return 'pages-discrete-math-quiz';
}

async function loadDynamicQuestions() {
  try {
    const res = await fetch("/api/questions?_t=" + Date.now());
    if (res.ok) {
      const dbQuestions = await res.json();
      if (dbQuestions && Array.isArray(dbQuestions) && dbQuestions.length > 0) {
        if (!window.STATIC_QUESTIONS) {
          window.STATIC_QUESTIONS = [...QUESTIONS];
        }
        QUESTIONS.length = 0;
        QUESTIONS.push(...dbQuestions);
        console.log(`Successfully loaded ${dbQuestions.length} custom questions from database.`);
      }
    }
  } catch (err) {
    console.error("Failed to load dynamic questions from database:", err);
  }
}

function getCurrentUserRole() {
  const role = localStorage.getItem('dm_user_role');
  if (role) return role;
  const profileStr = localStorage.getItem('dm_user_profile');
  if (profileStr) {
    try {
      const profile = JSON.parse(profileStr);
      if (profile && profile.username && profile.username.toLowerCase() === 'admin') {
        return 'admin';
      }
    } catch(e) {}
  }
  return 'user';
}

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
  examHistory: [],
  dailyChallenge: { date: '', questions: [], completed: false },
  streak: 0,
  lastStudyDate: ''
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

function saveExamState() {
  try {
    localStorage.setItem('dm_exam_state', JSON.stringify({
      isActive: examState.isActive,
      answers: examState.answers,
      completed: examState.completed,
      secondsRemaining: examState.secondsRemaining,
      questions: examState.questions.map(q => ({
        category: q.category,
        original_num: q.original_num,
        question: q.question,
        options: q.options,
        answer: q.answer,
        analysis: q.analysis,
        topic: q.topic
      }))
    }));
  } catch (e) {
    console.error("Failed to save exam state:", e);
  }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  await loadDynamicQuestions();
  loadUserData();
  initDailyChallenge();
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
  
  // Initialize mobile layout variables and events
  setupMobileNavigation();
  setupMobileSwipeGestures();
  
  // Render initial viewport
  renderViewport();
  
  // Initialize Global Cloud Quota Dashboard
  loadGlobalCloudQuota();
  
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
      if (!userData.dailyChallenge) userData.dailyChallenge = { date: '', questions: [], completed: false };
      if (userData.streak === undefined) userData.streak = 0;
      if (userData.lastStudyDate === undefined) userData.lastStudyDate = '';
    } catch (e) {
      console.error('Error parsing user data, resetting...', e);
    }
  }
  updateStatsDashboard();
}

function initDailyChallenge() {
  const todayStr = new Date().toLocaleDateString('zh-CN');
  if (!userData.dailyChallenge || userData.dailyChallenge.date !== todayStr || !userData.dailyChallenge.questions || userData.dailyChallenge.questions.length === 0) {
    const available = QUESTIONS.map(q => getQuestionId(q));
    if (available.length > 0) {
      const shuffled = shuffleArray(available);
      userData.dailyChallenge = {
        date: todayStr,
        questions: shuffled.slice(0, 3),
        completed: false
      };
      saveUserData();
    }
  }
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
    const qObj = QUESTIONS.find(q => getQuestionId(q) === qKey);
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
  if (currentCategory === 'admin') {
    return [];
  }
  if (currentCategory === 'bookmarks') {
    return QUESTIONS.filter(q => userData.bookmarks.includes(getQuestionId(q)));
  }
  if (currentCategory === 'wrong_questions') {
    return QUESTIONS.filter(q => userData.wrongQuestions.includes(getQuestionId(q)));
  }
  if (currentCategory === 'daily_challenge') {
    if (!userData.dailyChallenge || !userData.dailyChallenge.questions) return [];
    return QUESTIONS.filter(q => userData.dailyChallenge.questions.includes(getQuestionId(q)));
  }
  if (currentCategory === 'all') {
    return QUESTIONS;
  }
  if (currentCategory === 'subjective') {
    return QUESTIONS.filter(q => ['calculation', 'proof', 'application'].includes(q.category));
  }
  if (currentCategory === 'logic') {
    return QUESTIONS.filter(q => q.topic === 'propositional_logic' || q.topic === 'predicate_logic');
  }
  if (['propositional_logic', 'predicate_logic', 'set_theory', 'binary_relations', 'graph_theory'].includes(currentCategory)) {
    return QUESTIONS.filter(q => q.topic === currentCategory);
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
  document.documentElement.classList.toggle('dark', activeTheme === 'dark');
  updateThemeUI(activeTheme);
  
  toggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    localStorage.setItem('dm_theme', newTheme);
    updateThemeUI(newTheme);
    
    // Sync mobile header icon if exists
    const mobThemeIcon = document.getElementById('mobile-theme-icon');
    if (mobThemeIcon) {
      mobThemeIcon.innerText = newTheme === 'dark' ? 'dark_mode' : 'light_mode';
    }
    
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

  const streakCountVal = document.getElementById('streak-count-val');
  if (streakCountVal) {
    streakCountVal.innerText = userData.streak || 0;
  }
  
  const countDailyChallenge = document.getElementById('count-daily-challenge');
  if (countDailyChallenge) {
    if (userData.dailyChallenge && userData.dailyChallenge.completed) {
      countDailyChallenge.innerText = '已完';
      countDailyChallenge.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
      countDailyChallenge.style.color = '#10B981';
    } else {
      countDailyChallenge.innerText = '新';
      countDailyChallenge.style.backgroundColor = 'var(--accent)';
      countDailyChallenge.style.color = 'white';
    }
  }
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
      } else if (currentCategory === 'admin') {
        subtitleEl.innerText = '全局系统配置、用户角色变更、题库管理与大模型调试后台';
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
  
  const isMobile = window.innerWidth <= 768;
  
  // Call mobile nav & header update
  updateMobileNavAndHeader();

  const cfPanel = document.getElementById('global-cf-quota-panel');
  const statsPanel = document.getElementById('stats-panel');
  const masteryPanel = document.getElementById('mastery-panel');

  if (isMobile) {
    // Mobile View Dispatcher
    if (cfPanel) cfPanel.style.display = 'none';
    if (statsPanel) statsPanel.style.display = 'none';
    if (masteryPanel) masteryPanel.style.display = 'none';

    if (currentMobileTab === 'lobby') {
      renderMobileLobby(container);
      return;
    }
    
    if (currentMobileTab === 'lobby_comments') {
      renderLobbyComments(container);
      return;
    }

    if (currentMobileTab === 'quota_details') {
      renderQuotaDetails(container);
      return;
    }

    if (currentMobileTab === 'category') {
      if (currentCategory === 'all') {
        renderCategoryGrid(container);
        return;
      } else {
        renderMobilePractice(container);
        return;
      }
    }
    
    if (currentMobileTab === 'exam') {
      renderMobileExam(container);
      return;
    }
    
    if (currentMobileTab === 'leaderboard') {
      renderMobileLeaderboard(container);
      return;
    }
    
    if (currentMobileTab === 'profile') {
      renderMobileProfile(container);
      return;
    }
    if (currentMobileTab === 'admin') {
      renderAdminView(container);
      return;
    }
  } else {
    // Original Desktop View Dispatcher
    if (cfPanel) {
      const isLobby = ['all', 'judgment', 'single_choice', 'fill_blank', 'subjective', 'wrong_questions', 'bookmarks'].includes(currentCategory) && currentMode === 'practice';
      if (isLobby) {
        loadGlobalCloudQuota();
      } else {
        cfPanel.style.display = 'none';
        if (globalCfCountdownInterval) {
          clearInterval(globalCfCountdownInterval);
          globalCfCountdownInterval = null;
        }
      }
    }
    
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
    if (currentCategory === 'admin') {
      renderAdminView(container);
      return;
    }
    if (currentMode === 'practice') {
      renderPracticeMode(container);
    } else {
      renderExamMode(container);
    }
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
    // If it's an objective question and has not been answered, disable the toggle button to prevent leaks
    const isObjective = ['judgment', 'single_choice', 'fill_blank'].includes(q.category);
    if (isObjective && !userRecord) {
      toggleSolutionBtn.disabled = true;
      toggleSolutionBtn.innerText = '请先作答以解锁解析';
      toggleSolutionBtn.style.opacity = '0.6';
      toggleSolutionBtn.style.cursor = 'not-allowed';
    } else {
      toggleSolutionBtn.disabled = false;
      toggleSolutionBtn.style.opacity = '1';
      toggleSolutionBtn.style.cursor = 'pointer';
    }

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
      toggleSolutionBtn.disabled = false;
      toggleSolutionBtn.style.opacity = '1';
      toggleSolutionBtn.style.cursor = 'pointer';
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
          toggleSolutionBtn.disabled = false;
          toggleSolutionBtn.style.opacity = '1';
          toggleSolutionBtn.style.cursor = 'pointer';
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
    const correctParts = q.answer.split('|').map(s => s.trim());
    const blankCount = correctParts.length;
    const userAnsParts = userRecord ? userRecord.userAns.split('|').map(s => s.trim()) : [];
    
    let inputsHtml = `<div class="fill-blank-container" style="display:flex; flex-direction:column; gap:0.75rem; width:100%;">`;
    for (let i = 0; i < blankCount; i++) {
      const val = userAnsParts[i] || '';
      inputsHtml += `
        <div style="display:flex; align-items:center; gap:0.5rem; width:100%;">
          <span style="font-size:0.85rem; font-weight:700; color:var(--text-secondary); min-width:3.5rem;">第 ${i + 1} 空:</span>
          <input type="text" class="fill-input-box" id="blank-input-${i}" placeholder="请输入第 ${i + 1} 空答案..." autocomplete="off" value="${val}" ${userRecord ? 'disabled' : ''} style="padding:0.7rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; flex:1; box-sizing:border-box;">
        </div>
      `;
    }
    inputsHtml += `
        <button class="btn btn-primary" id="blank-submit" style="margin-top:0.5rem;">提交答案</button>
      </div>
    `;
    
    interactiveArea.innerHTML = inputsHtml;
    
    const blankInputs = Array.from(interactiveArea.querySelectorAll('.fill-input-box'));
    const blankSubmit = interactiveArea.querySelector('#blank-submit');
    
    if (userRecord) {
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
      blankInputs.forEach((input, idx) => {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            if (idx < blankInputs.length - 1) {
              blankInputs[idx + 1].focus();
            } else {
              submitBlank();
            }
          }
        });
      });
    }
    
    function submitBlank() {
      const vals = blankInputs.map(input => input.value.trim());
      if (vals.some(v => !v)) {
        showToast('请将所有空格填写完整！', 'error');
        return;
      }
      const userAns = vals.join(' | ');
      const isCorrect = checkBlankCorrectness(userAns, q.answer);
      userData.answered[qId] = { userAns: userAns, isCorrect: isCorrect };
      
      blankInputs.forEach(input => input.disabled = true);
      blankSubmit.disabled = true;
      blankSubmit.innerText = isCorrect ? '回答正确' : '回答错误';
      blankSubmit.className = isCorrect ? 'btn btn-primary' : 'btn btn-outline';
      
      solutionPanel.style.display = 'flex';
      toggleSolutionBtn.disabled = false;
      toggleSolutionBtn.style.opacity = '1';
      toggleSolutionBtn.style.cursor = 'pointer';
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

function buildCustomExam(selectedTopic, selectedTime, cntJudgment, cntChoice, cntBlank, cntSubjective) {
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
  examState.startTime = Date.now(); // Record start time for mobile/desktop logs
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

function startExam() {
  const selectedTopic = document.getElementById('exam-set-topic').value;
  const selectedTime = parseInt(document.getElementById('exam-set-time').value, 10);
  
  const cntJudgment = parseInt(document.getElementById('exam-cnt-judgment').value || 0, 10);
  const cntChoice = parseInt(document.getElementById('exam-cnt-choice').value || 0, 10);
  const cntBlank = parseInt(document.getElementById('exam-cnt-blank').value || 0, 10);
  const cntSubjective = parseInt(document.getElementById('exam-cnt-subjective').value || 0, 10);
  
  buildCustomExam(selectedTopic, selectedTime, cntJudgment, cntChoice, cntBlank, cntSubjective);
}

function selectRandom(arr, count) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function updateExamTimer() {
  const timerEl = document.getElementById('exam-timer-display');
  const mobTimerEl = document.getElementById('mobile-exam-timer');
  
  if (mobTimerEl) {
    mobTimerEl.style.display = 'block'; // Make sure the timer badge is visible during exam
  }
  
  if (examState.secondsRemaining === 0) {
    if (timerEl) {
      timerEl.innerText = "不限时";
      timerEl.parentElement.classList.remove('warning');
    }
    if (mobTimerEl) mobTimerEl.innerText = "不限时";
    return;
  }
  
  const mins = Math.floor(examState.secondsRemaining / 60);
  const secs = examState.secondsRemaining % 60;
  
  const displayMins = mins.toString().padStart(2, '0');
  const displaySecs = secs.toString().padStart(2, '0');
  const timerStr = `${displayMins}:${displaySecs}`;
  
  if (timerEl) {
    timerEl.innerText = timerStr;
    if (examState.secondsRemaining < 300) {
      timerEl.parentElement.classList.add('warning');
    } else {
      timerEl.parentElement.classList.remove('warning');
    }
  }
  
  if (mobTimerEl) {
    mobTimerEl.innerText = timerStr;
    if (examState.secondsRemaining < 300) {
      mobTimerEl.classList.remove('bg-red-100', 'text-red-600', 'dark:bg-red-950/30', 'dark:text-red-400');
      mobTimerEl.classList.add('bg-red-600', 'text-white', 'animate-pulse');
    } else {
      mobTimerEl.classList.remove('bg-red-600', 'text-white', 'animate-pulse');
      mobTimerEl.classList.add('bg-red-100', 'text-red-600', 'dark:bg-red-950/30', 'dark:text-red-400');
    }
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
    const correctParts = q.answer.split('|').map(s => s.trim());
    const blankCount = correctParts.length;
    const userAnsParts = (userAns || '').split('|').map(s => s.trim());
    
    let inputsHtml = `<div class="fill-blank-container" style="display:flex; flex-direction:column; gap:0.75rem; width:100%;">`;
    for (let i = 0; i < blankCount; i++) {
      const val = userAnsParts[i] || '';
      inputsHtml += `
        <div style="display:flex; align-items:center; gap:0.5rem; width:100%;">
          <span style="font-size:0.85rem; font-weight:700; color:var(--text-secondary); min-width:3.5rem;">第 ${i + 1} 空:</span>
          <input type="text" class="exam-blank-sub-input" id="exam-blank-input-${i}" placeholder="请输入第 ${i + 1} 空答案..." value="${val}" style="padding:0.7rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; flex:1; box-sizing:border-box;">
        </div>
      `;
    }
    inputsHtml += `</div>`;
    interactiveArea.innerHTML = inputsHtml;
    
    const examInputs = Array.from(interactiveArea.querySelectorAll('.exam-blank-sub-input'));
    examInputs.forEach(input => {
      input.addEventListener('input', () => {
        const combined = examInputs.map(i => i.value.trim()).join(' | ');
        saveExamAnswer(combined);
      });
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
  document.getElementById('submit-exam-btn').addEventListener('click', triggerExamSubmission);
  
  renderMath(card);
}

function triggerExamSubmission() {
  const unansweredCount = examState.questions.length - Object.keys(examState.answers).filter(k => examState.answers[k] !== '').length;
  let confirmMsg = '是否确认交卷？';
  if (unansweredCount > 0) {
    confirmMsg = `你还有 ${unansweredCount} 道题目未作答，是否确认交卷？`;
  }
  if (confirm(confirmMsg)) {
    submitExam(false);
  }
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

  // Calculate score and correct count
  let score = 0;
  let correctCount = 0;
  examState.questions.forEach((q, idx) => {
    const userAns = examState.answers[idx] || '';
    if (['judgment', 'single_choice', 'fill_blank'].includes(q.category)) {
      const isCorrect = (q.category === 'fill_blank')
        ? checkBlankCorrectness(userAns, q.answer)
        : (userAns === q.answer);
      if (isCorrect) {
        score += 10;
        correctCount++;
      }
    } else {
      if (examState.subjectiveGrading[idx]) {
        score += 10;
        correctCount++;
      }
    }
  });
  examState.score = score;
  examState.correctCount = correctCount;

  // Calculate elapsed time used
  if (examState.startTime) {
    examState.timeUsed = Math.round((Date.now() - examState.startTime) / 1000);
  } else {
    examState.timeUsed = 0;
  }
  
  saveExamState();
  
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
  const adminNav = document.getElementById('nav-admin');
  const role = getCurrentUserRole();
  
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
        if (adminNav) {
          adminNav.style.display = (role === 'admin') ? 'flex' : 'none';
        }
        
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
  if (adminNav) {
    adminNav.style.display = 'none';
  }
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
        if (result.role) {
          localStorage.setItem('dm_user_role', result.role);
        }
        
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
  localStorage.removeItem('dm_user_role');
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
  
  if (currentCategory === 'daily_challenge') {
    checkDailyChallengeCompletion();
  } else {
    saveUserData();
  }

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
    const qObj = QUESTIONS.find(q => getQuestionId(q) === qKey);
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
    
    // Update subtitle if on desktop
    const subtitleEl = document.getElementById('view-subtitle');
    if (subtitleEl && currentCategory === 'daily_challenge') {
      subtitleEl.innerText = `今日挑战进度: 3/3 (已完成今日打卡 🔥)`;
    }
    
    showToast('恭喜！今日挑战全部完成，打卡成功！', 'success');
    
    // Confetti explosion
    if (typeof confetti === 'function') {
      confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } });
    }
  } else {
    saveUserData();
    // Update subtitle if on desktop
    const subtitleEl = document.getElementById('view-subtitle');
    if (subtitleEl && currentCategory === 'daily_challenge') {
      const completedCount = userData.dailyChallenge.questions.filter(qKey => userData.answered[qKey] && userData.answered[qKey].isCorrect).length;
      subtitleEl.innerText = `今日挑战进度: ${completedCount}/3 (答对全部3道题即完成今日打卡)`;
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
      const loggedInProfile = JSON.parse(localStorage.getItem('dm_profile') || '{}');
      const currentUsername = loggedInProfile.username || '';
      let listHtml = "";
      comments.forEach(c => {
        const timeStr = new Date(c.timestamp).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        const isMine = currentUsername && (c.username === currentUsername);
        
        listHtml += `
          <div class="comment-item">
            <div class="comment-user-avatar">${c.username.substring(0, 1).toUpperCase()}</div>
            <div class="comment-bubble" style="flex:1;">
              <div class="comment-meta" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                <div>
                  <span style="color: var(--text-primary); font-weight: 700;">${escapeHtml(c.username)}</span>
                  <span style="margin-left:8px; font-size:11px; color:var(--text-muted);">${timeStr}</span>
                </div>
                ${isMine ? `<button class="desktop-delete-comment-btn" data-timestamp="${c.timestamp}" style="color:var(--error); border:none; background:none; cursor:pointer; font-size:11px; font-weight:700; padding:0;">删除</button>` : ''}
              </div>
              <div class="comment-text">${escapeHtml(c.content)}</div>
            </div>
          </div>
        `;
      });
      commentList.innerHTML = listHtml;
      
      commentList.querySelectorAll('.desktop-delete-comment-btn').forEach(btn => {
        btn.onclick = async () => {
          const timestamp = parseInt(btn.getAttribute('data-timestamp'));
          if (!confirm('确定要删除这条评论吗？')) return;
          const token = localStorage.getItem('dm_jwt_token');
          if (!token) return;

          try {
            const deleteRes = await fetch(`${API_BASE}/comments`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ qId, timestamp })
            });

            if (deleteRes.ok) {
              showToast('评论已删除！', 'success');
              await loadComments(qId, panel);
            } else {
              const errData = await deleteRes.json();
              showToast(errData.error || '删除失败', 'error');
            }
          } catch (e) {
            showToast('删除失败，请检查网络连接', 'error');
          }
        };
      });

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
            <option value="@cf/qwen/qwq-32b" selected>🏆 QwQ-32B (数学推理专项)</option>
            <option value="@cf/deepseek-ai/deepseek-r1-distill-qwen-32b">🧠 DeepSeek R1-32B (超强推理链)</option>
            <option value="@cf/qwen/qwen3-30b-a3b-fp8">⚡ Qwen3-30B MoE (推理+中文)</option>
            <option value="@cf/meta/llama-3.3-70b-instruct-fp8-fast">🦙 Llama 3.3-70B (旗舰通用)</option>
            <option value="@cf/openai/gpt-oss-20b">🤖 GPT-OSS-20B (OpenAI轻量推理)</option>
            <option value="@cf/google/gemma-4-26b-a4b-it">💎 Gemma 4-26B (Google推理)</option>
            <option value="@cf/zhipuai/glm-4.7-flash">🚀 GLM-4.7-Flash (中文快速)</option>
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
  
  const qId = getQuestionId(currentAiQuestion);
  const userRecord = userData.answered[qId];
  
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
          answer: currentAiQuestion.answer,
          userQuery: query,
          model: chosenModel,
          history: aiConversationHistory,
          thinkingIntensity: chosenIntensity,
          stream: true,
          userRecord: userRecord ? { userAns: userRecord.userAns, isCorrect: userRecord.isCorrect } : null
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
          answer: currentAiQuestion.answer,
          userQuery: query,
          model: chosenModel,
          history: aiConversationHistory,
          thinkingIntensity: chosenIntensity,
          stream: false,
          userRecord: userRecord ? { userAns: userRecord.userAns, isCorrect: userRecord.isCorrect } : null
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
          <span>Tokens: Prompt ${usage.prompt_tokens} | Reply ${usage.completion_tokens} | Total ${usage.total_tokens}</span>
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
      <div class="dashboard-card" style="padding: 1.5rem; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 1.25rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg);">
        <h3 style="margin: 0; font-size: 0.95rem; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
          📊 Workers/Pages 请求使用情况
        </h3>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0; line-height:1.45;">
          输入您的 Cloudflare 凭证即可在此直观监测当前账号今日 Workers 与 Pages 的请求额度消耗进度与重置倒计时。
        </p>
        <div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 0.25rem;">
          <div style="display:flex; flex-direction:column; gap:0.35rem;">
            <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Cloudflare Account ID</label>
            <input type="text" id="cf-account-id" placeholder="输入您的 32 位 Account ID..." style="padding: 0.75rem 1rem; font-size: 0.85rem; border-radius: 14px; border: 1.5px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); outline: none; transition: all 0.2s;">
          </div>
          <div style="display:flex; flex-direction:column; gap:0.35rem;">
            <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Cloudflare API Token</label>
            <input type="password" id="cf-api-token" placeholder="输入具有 Account Analytics: Read 权限的 API 令牌..." style="padding: 0.75rem 1rem; font-size: 0.85rem; border-radius: 14px; border: 1.5px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); outline: none; transition: all 0.2s;">
          </div>
          <div style="display:flex; flex-direction:column; gap:0.35rem;">
            <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">账户计划与每日配额</label>
            <select id="cf-quota-select" style="padding: 0.75rem 1rem; font-size: 0.85rem; border-radius: 14px; border: 1.5px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); outline: none; transition: all 0.2s; cursor: pointer;">
              <option value="100000">免费版账户 (每日 100,000 次请求)</option>
              <option value="10000000">付费版账户 (基础额度每月 10,000,000 次，无每日限制)</option>
              <option value="custom">自定义每日限额...</option>
            </select>
          </div>
          <div id="cf-custom-quota-wrapper" style="display:none; flex-direction:column; gap:0.35rem;">
            <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">自定义每日最高请求限额</label>
            <input type="number" id="cf-custom-quota" value="100000" placeholder="例如: 500000" style="padding: 0.75rem 1rem; font-size: 0.85rem; border-radius: 14px; border: 1.5px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); outline: none; transition: all 0.2s;">
          </div>
          <button class="btn btn-primary" id="cf-save-btn" style="padding: 0.75rem; font-size: 0.85rem; font-weight: 700; width: 100%; margin-top: 0.5rem; cursor: pointer; border-radius: 14px; border: none;">
            确认绑定并查询使用进度
          </button>
        </div>
      </div>
    `;

    const quotaSelect = usageContainer.querySelector('#cf-quota-select');
    const customWrapper = usageContainer.querySelector('#cf-custom-quota-wrapper');
    quotaSelect.addEventListener('change', () => {
      if (quotaSelect.value === 'custom') {
        customWrapper.style.display = 'flex';
      } else {
        customWrapper.style.display = 'none';
      }
    });
    
    usageContainer.querySelector('#cf-save-btn').addEventListener('click', () => {
      const idInput = usageContainer.querySelector('#cf-account-id').value.trim();
      const tokenInput = usageContainer.querySelector('#cf-api-token').value.trim();
      const quotaSelectVal = quotaSelect.value;
      
      if (!idInput || !tokenInput) {
        showToast('Account ID 和 API Token 均不能为空！', 'error');
        return;
      }

      let quotaVal = parseInt(quotaSelectVal);
      if (quotaSelectVal === 'custom') {
        quotaVal = parseInt(usageContainer.querySelector('#cf-custom-quota').value) || 100000;
      }
      
      localStorage.setItem('cf_account_id', idInput);
      localStorage.setItem('cf_api_token', tokenInput);
      localStorage.setItem('cf_quota_limit', quotaVal);
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
      body: JSON.stringify({
        accountId,
        apiToken,
        scriptName: getExpectedCfScriptName()
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      
      const workers = result.workersRequests;
      const pages = result.pagesRequests;
      const total = result.totalRequests;
      const quota = parseInt(localStorage.getItem('cf_quota_limit')) || result.quota || 100000;
      const pct = parseFloat(((total / quota) * 100).toFixed(2));
      let secondsLeft = result.secondsRemaining;
      
      // Artificial Workers AI Data
      const aiNeurons = result.aiNeurons || 0;
      const aiQuota = result.aiQuota || 10000; 
      const aiPct = parseFloat(((aiNeurons / aiQuota) * 100).toFixed(2));
      
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      
      // Helper function to format seconds into timer HTML
      function getTimerHtml(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `<span style="color:#d97706; font-weight:700;">${hours}</span>小时<span style="color:#d97706; font-weight:700;">${minutes}</span>分<span style="color:#d97706; font-weight:700;">${secs}</span>秒`;
      }
      
      targetContainer.innerHTML = `
        <!-- Workers/Pages Requests Card -->
        <div class="dashboard-card" style="padding: 1.25rem; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 0.85rem; border: 1px solid var(--border-color); background: var(--bg-card); border-radius: var(--radius-lg); animation: fadeIn 0.4s ease; margin-bottom: 1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin: 0; font-size: 0.85rem; font-weight: 800; color: var(--text-primary); display:flex; align-items:center; gap:0.4rem;">
              📡 Workers/Pages 平台请求配额
            </h3>
            <button class="btn btn-outline" id="cf-reconfig-btn" style="padding: 0.25rem 0.5rem; font-size: 0.72rem; font-weight: 700; border-radius: 8px; cursor:pointer;">⚙️ 重设凭证</button>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size: 0.72rem; color: var(--text-muted); font-weight:700;">
            <span>重置倒计时:</span>
            <span id="cf-countdown-timer">${getTimerHtml(secondsLeft)}</span>
          </div>
 
          <!-- Progress Bar -->
          <div style="background-color: var(--bg-secondary); border-radius: 9999px; height: 20px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; width: 100%; border: 1px solid var(--border-color);">
            <div style="background: linear-gradient(90deg, var(--primary), var(--accent)); height: 100%; position: absolute; left: 0; top: 0; width: ${Math.min(100, pct)}%;"></div>
            <span style="color: var(--text-primary); font-size: 0.75rem; font-weight: 700; z-index: 1; text-shadow: ${isDark ? '0 1px 2px rgba(0,0,0,0.8)' : '0 1px 2px rgba(255,255,255,0.8)'}; user-select:none;">
              本日已用: ${total.toLocaleString()} / ${quota.toLocaleString()} (${pct}%)
            </span>
          </div>
 
          <div style="display:flex; gap:1.5rem; font-size: 0.75rem; color: var(--text-secondary); font-weight: 600;">
            <span>🌐 Pages (项目运行): <strong style="color: var(--primary);">${pages.toLocaleString()}</strong> 次</span>
            <span>⚙️ Workers (其他服务): <strong style="color: var(--success);">${workers.toLocaleString()}</strong> 次</span>
          </div>
        </div>
 
        <!-- Workers AI Neurons Card -->
        <div class="dashboard-card" style="padding: 1.25rem; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 0.85rem; border: 1px solid var(--border-color); background: var(--bg-card); border-radius: var(--radius-lg); animation: fadeIn 0.4s ease;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin: 0; font-size: 0.85rem; font-weight: 800; color: var(--text-primary); display:flex; align-items:center; gap:0.4rem;">
              🔮 Workers AI 智能算力配额
            </h3>
            <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700;">每日免费额度</span>
          </div>
 
          <!-- Progress Bar -->
          <div style="background-color: var(--bg-secondary); border-radius: 9999px; height: 20px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; width: 100%; border: 1px solid var(--border-color);">
            <div style="background: linear-gradient(90deg, #10B981, var(--primary)); height: 100%; position: absolute; left: 0; top: 0; width: ${Math.min(100, aiPct)}%;"></div>
            <span style="color: var(--text-primary); font-size: 0.75rem; font-weight: 700; z-index: 1; text-shadow: ${isDark ? '0 1px 2px rgba(0,0,0,0.8)' : '0 1px 2px rgba(255,255,255,0.8)'}; user-select:none;">
              本日已用: ${aiNeurons.toLocaleString()} / ${aiQuota.toLocaleString()} Neurons (${aiPct}%)
            </span>
          </div>
 
          <div style="display:flex; justify-content:space-between; align-items:center; font-size: 0.75rem; color: var(--text-secondary); font-weight: 600;">
            <span>🧠 AI 助教算力单元: <strong style="color: #10B981;">${aiNeurons.toLocaleString()} Neurons</strong></span>
            <span style="color: var(--text-muted); font-size:0.7rem;">(免费配额重置与请求数同步)</span>
          </div>
        </div>
      `;
      
      // Bind reconfig
      targetContainer.querySelector('#cf-reconfig-btn').addEventListener('click', () => {
        localStorage.removeItem('cf_account_id');
        localStorage.removeItem('cf_api_token');
        localStorage.removeItem('cf_quota_limit');
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


// ============================================================================
//            GLOBAL CLOUDFLARE RESOURCES QUOTA DASHBOARD
// ============================================================================

function loadGlobalCloudQuota() {
  const panel = document.getElementById('global-cf-quota-panel');
  if (!panel) return;

  if (window.innerWidth <= 768) {
    panel.style.display = 'none';
    if (globalCfCountdownInterval) {
      clearInterval(globalCfCountdownInterval);
      globalCfCountdownInterval = null;
    }
    return;
  }

  // Clean up any running timers
  if (globalCfCountdownInterval) {
    clearInterval(globalCfCountdownInterval);
    globalCfCountdownInterval = null;
  }

  const accountId = localStorage.getItem('cf_account_id');
  const apiToken = localStorage.getItem('cf_api_token');
  const body = (accountId && apiToken) ? {
    accountId,
    apiToken,
    scriptName: getExpectedCfScriptName()
  } : {};

  fetch(`${API_BASE}/cf-usage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  .then(res => {
    if (res.ok) return res.json();
    throw new Error('Failed to load global cf quota');
  })
  .then(result => {
    const workers = result.workersRequests || 0;
    const pages = result.pagesRequests || 0;
    const total = result.totalRequests || 0;
    const quota = parseInt(localStorage.getItem('cf_quota_limit')) || result.quota || 100000;
    const pct = parseFloat(((total / quota) * 100).toFixed(2));
    
    const aiNeurons = result.aiNeurons || 0;
    const aiQuota = result.aiQuota || 10000;
    const aiPct = parseFloat(((aiNeurons / aiQuota) * 100).toFixed(2));
    let secondsLeft = result.secondsRemaining || 0;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    function getTimerHtml(seconds) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `<span style="color:#d97706; font-weight:700;">${hours}</span>时<span style="color:#d97706; font-weight:700;">${minutes}</span>分<span style="color:#d97706; font-weight:700;">${secs}</span>秒`;
    }

    panel.innerHTML = `
      <!-- Workers/Pages Requests Card -->
      <div class="dashboard-card" style="padding: 1.25rem; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 0.85rem; border: 1px solid var(--border-color); animation: fadeIn 0.4s ease;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin: 0; font-size: 0.85rem; font-weight: 800; color: var(--text-primary); display:flex; align-items:center; gap:0.4rem;">
            📡 Workers/Pages 平台请求配额
          </h3>
          <span style="font-size: 0.72rem; color: var(--text-muted); font-weight:700;">重置倒计时: <span id="global-cf-reset-timer">${getTimerHtml(secondsLeft)}</span></span>
        </div>

        <!-- Progress Bar -->
        <div style="background-color: var(--bg-secondary); border-radius: 9999px; height: 20px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; width: 100%; border: 1px solid var(--border-color);">
          <div style="background: linear-gradient(90deg, var(--primary), var(--accent)); height: 100%; position: absolute; left: 0; top: 0; width: ${Math.min(100, pct)}%;"></div>
          <span style="color: var(--text-primary); font-size: 0.75rem; font-weight: 700; z-index: 1; text-shadow: ${isDark ? '0 1px 2px rgba(0,0,0,0.8)' : '0 1px 2px rgba(255,255,255,0.8)'}; user-select:none;">
            本日已用: ${total.toLocaleString()} / ${quota.toLocaleString()} (${pct}%)
          </span>
        </div>

        <div style="display:flex; gap:1.5rem; font-size: 0.75rem; color: var(--text-secondary); font-weight: 600;">
          <span>🌐 Pages (项目运行): <strong style="color: var(--primary);">${pages.toLocaleString()}</strong> 次</span>
          <span>⚙️ Workers (其他服务): <strong style="color: var(--success);">${workers.toLocaleString()}</strong> 次</span>
        </div>
      </div>

      <!-- Workers AI Neurons Card -->
      <div class="dashboard-card" style="padding: 1.25rem; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 0.85rem; border: 1px solid var(--border-color); animation: fadeIn 0.4s ease;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin: 0; font-size: 0.85rem; font-weight: 800; color: var(--text-primary); display:flex; align-items:center; gap:0.4rem;">
            🔮 Workers AI 智能算力配额
          </h3>
          <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700;">每日免费额度</span>
        </div>

        <!-- Progress Bar -->
        <div style="background-color: var(--bg-secondary); border-radius: 9999px; height: 20px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; width: 100%; border: 1px solid var(--border-color);">
          <div style="background: linear-gradient(90deg, #10B981, #3B82F6); height: 100%; position: absolute; left: 0; top: 0; width: ${Math.min(100, aiPct)}%;"></div>
          <span style="color: var(--text-primary); font-size: 0.75rem; font-weight: 700; z-index: 1; text-shadow: ${isDark ? '0 1px 2px rgba(0,0,0,0.8)' : '0 1px 2px rgba(255,255,255,0.8)'}; user-select:none;">
            本日已用: ${aiNeurons.toLocaleString()} / ${aiQuota.toLocaleString()} Neurons (${aiPct}%)
          </span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size: 0.75rem; color: var(--text-secondary); font-weight: 600;">
          <span>🧠 AI 助教算力单元: <strong style="color: #10B981;">${aiNeurons.toLocaleString()} Neurons</strong></span>
          <span style="color: var(--text-muted); font-size:0.7rem;">(免费配额重置与请求数同步)</span>
        </div>
      </div>
    `;
    
    panel.style.display = 'grid';

    // Start live clock countdown
    const resetTimerEl = document.getElementById('global-cf-reset-timer');
    globalCfCountdownInterval = setInterval(() => {
      if (secondsLeft > 0) {
        secondsLeft--;
        if (resetTimerEl) {
          resetTimerEl.innerHTML = getTimerHtml(secondsLeft);
        }
      } else {
        clearInterval(globalCfCountdownInterval);
        loadGlobalCloudQuota();
      }
    }, 1000);
  })
  .catch(err => {
    panel.style.display = 'none';
  });
}

// ============================================================================
//            MOBILE APP ADAPTATION HELPERS & INTERACTIVE ROUTERS
// ============================================================================

function animateMobileTransition(direction, action) {
  const viewport = document.getElementById('viewport');
  if (!viewport || window.innerWidth > 768) {
    action();
    return;
  }
  
  const outClass = direction === 'left' ? 'slide-out-left' : 'slide-out-right';
  viewport.classList.add(outClass);
  
  setTimeout(() => {
    viewport.classList.remove(outClass);
    action();
    
    const inClass = direction === 'left' ? 'slide-in-right' : 'slide-in-left';
    viewport.classList.add(inClass);
    
    setTimeout(() => {
      viewport.classList.remove(inClass);
    }, 220);
  }, 170);
}

let currentMobileTab = 'lobby';

function setupMobileSwipeGestures() {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });
  
  document.addEventListener('touchend', (e) => {
    if (e.changedTouches.length !== 1) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const touchEndTime = Date.now();
    
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    const timeDiff = touchEndTime - touchStartTime;
    
    // Swipe horizontal constraints:
    // 1. time < 350ms
    // 2. horizontal distance > 75px
    // 3. vertical deviation < 50px
    if (timeDiff < 350 && Math.abs(diffX) > 75 && Math.abs(diffY) < 50) {
      if (window.innerWidth > 768) return;
      
      const target = e.target;
      if (target.closest('input') || target.closest('textarea') || target.closest('select') || 
          target.closest('.ai-thinking-accordion') || target.closest('#ai-chat-area-floating') || 
          target.closest('.katex') || target.closest('#mobile-question-comments-list') || 
          target.closest('.subjective-textarea')) {
        return;
      }
      
      const isQuestionPage = ((currentMobileTab === 'category' && currentCategory !== 'all') || 
                              (currentMobileTab === 'exam' && examState.isActive));
      const isOtherSecondaryPage = (currentMobileTab === 'lobby_comments' || currentMobileTab === 'quota_details');
                               
      if (isQuestionPage) {
        // Swipe left (finger moves right to left, diffX < 0) -> Next question
        if (diffX < 0) {
          if (currentMobileTab === 'category') {
            const questions = getFilteredQuestions();
            if (currentQuestionIndex < questions.length - 1) {
              animateMobileTransition('left', () => {
                currentQuestionIndex++;
                renderViewport();
              });
            }
          } else {
            if (currentQuestionIndex < examState.questions.length - 1) {
              animateMobileTransition('left', () => {
                currentQuestionIndex++;
                renderViewport();
              });
            }
          }
        } 
        // Swipe right (finger moves left to right, diffX > 0) -> Previous question
        else if (diffX > 0) {
          if (currentQuestionIndex > 0) {
            animateMobileTransition('right', () => {
              currentQuestionIndex--;
              renderViewport();
            });
          }
        }
      } else if (isOtherSecondaryPage) {
        // Swipe right (left to right) returns to lobby
        if (diffX > 0) {
          animateMobileTransition('right', () => {
            currentMobileTab = 'lobby';
            renderViewport();
          });
        }
      } else {
        // Switch between main navigation tabs
        const tabsList = ['lobby', 'category', 'exam', 'leaderboard', 'profile'];
        const currentIndex = tabsList.indexOf(currentMobileTab);
        
        if (currentIndex !== -1) {
          if (diffX < 0) {
            // Swipe left: next tab
            if (currentIndex < tabsList.length - 1) {
              animateMobileTransition('left', () => {
                const nextTab = tabsList[currentIndex + 1];
                currentMobileTab = nextTab;
                
                // Sync state
                if (nextTab === 'lobby' || nextTab === 'category') {
                  currentCategory = 'all';
                  currentMode = 'practice';
                } else if (nextTab === 'exam') {
                  currentMode = 'exam';
                } else if (nextTab === 'leaderboard') {
                  currentCategory = 'leaderboard';
                } else if (nextTab === 'profile') {
                  currentCategory = 'profile';
                }
                
                renderViewport();
              });
            }
          } else if (diffX > 0) {
            // Swipe right: previous tab
            if (currentIndex > 0) {
              animateMobileTransition('right', () => {
                const prevTab = tabsList[currentIndex - 1];
                currentMobileTab = prevTab;
                
                // Sync state
                if (prevTab === 'lobby' || prevTab === 'category') {
                  currentCategory = 'all';
                  currentMode = 'practice';
                } else if (prevTab === 'exam') {
                  currentMode = 'exam';
                } else if (prevTab === 'leaderboard') {
                  currentCategory = 'leaderboard';
                } else if (prevTab === 'profile') {
                  currentCategory = 'profile';
                }
                
                renderViewport();
              });
            }
          }
        }
      }
    }
  });
}

function setupMobileNavigation() {
  const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
  mobileNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (examState.isActive && currentMobileTab !== 'exam') {
        if (!confirm('正在模拟考试中，切换标签将退出考试且不保存当前进度，是否确认退出？')) {
          return;
        }
        exitExam();
      }
      
      const targetTab = btn.getAttribute('data-tab');
      currentMobileTab = targetTab;
      
      // Sync app states
      if (targetTab === 'lobby') {
        currentCategory = 'all';
        currentMode = 'practice';
      } else if (targetTab === 'category') {
        currentCategory = 'all';
        currentMode = 'practice';
      } else if (targetTab === 'exam') {
        currentMode = 'exam';
      } else if (targetTab === 'leaderboard') {
        currentCategory = 'leaderboard';
      } else if (targetTab === 'profile') {
        currentCategory = 'profile';
      }
      
      renderViewport();
    });
  });

  // Bind click for header delegation (bookmark, theme toggle, and practice answer card)
  document.addEventListener('click', (e) => {
    if (e.target.closest('#mobile-header-bookmark-btn')) {
      const questions = getFilteredQuestions();
      const q = questions[currentQuestionIndex];
      if (q) {
        const qId = getQuestionId(q);
        const idx = userData.bookmarks.indexOf(qId);
        if (idx !== -1) {
          userData.bookmarks.splice(idx, 1);
          showToast('已取消收藏该题', 'info');
        } else {
          userData.bookmarks.push(qId);
          showToast('已成功收藏该题', 'success');
        }
        saveUserData();
        
        // Update header star state immediately
        updateMobileNavAndHeader();
      }
      return;
    }
    
    if (e.target.closest('#mobile-header-card-btn')) {
      const openTrigger = document.getElementById('mob-practice-card-btn-trigger');
      if (openTrigger) openTrigger.click();
      return;
    }
    
    if (e.target.closest('#mobile-theme-btn')) {
      const desktopThemeBtn = document.getElementById('theme-toggle');
      if (desktopThemeBtn) desktopThemeBtn.click();
      // Update sun/moon icon state
      setTimeout(updateMobileNavAndHeader, 50);
    }
  });
}

function exitMobileSubView() {
  currentCategory = 'all';
  renderViewport();
}

function goBackToCategories() {
  exitMobileSubView();
}

function updateMobileNavAndHeader() {
  const isMobile = window.innerWidth <= 768;
  const mobileHeader = document.getElementById('mobile-header');
  const mobileNavBar = document.getElementById('mobile-nav-bar');
  const mainContent = document.querySelector('.main-content');
  
  if (!isMobile) {
    if (mobileHeader) mobileHeader.style.display = 'none';
    if (mobileNavBar) mobileNavBar.style.display = 'none';
    if (mainContent) mainContent.classList.remove('no-bottom-nav');
    return;
  }
  
  if (mobileHeader) mobileHeader.style.display = 'flex';
  
  // Hide bottom nav when in secondary pages
  const hideBottomNav = (currentMobileTab === 'lobby_comments' || currentMobileTab === 'quota_details' || 
                         (currentMobileTab === 'category' && currentCategory !== 'all') ||
                         (currentMobileTab === 'exam' && examState.isActive));
  
  if (mobileNavBar) {
    mobileNavBar.style.display = hideBottomNav ? 'none' : 'flex';
  }
  
  if (mainContent) {
    if (hideBottomNav) {
      mainContent.classList.add('no-bottom-nav');
    } else {
      mainContent.classList.remove('no-bottom-nav');
    }
  }
  
  // Render mobile header
  const headerLeft = document.getElementById('mobile-header-left');
  const headerRight = document.getElementById('mobile-header-right');
  
  if (!headerLeft || !headerRight) return;
  
  if (currentMobileTab === 'lobby_comments') {
    headerLeft.innerHTML = `
      <button onclick="currentMobileTab='lobby'; renderViewport();" class="flex items-center justify-center p-1 rounded-full text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-none bg-transparent cursor-pointer mr-2">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
      </button>
      <span class="font-bold text-slate-900 dark:text-white tracking-tight text-base">学术讨论大厅</span>
    `;
    headerRight.innerHTML = '';
  } else if (currentMobileTab === 'quota_details') {
    headerLeft.innerHTML = `
      <button onclick="currentMobileTab='lobby'; renderViewport();" class="flex items-center justify-center p-1 rounded-full text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-none bg-transparent cursor-pointer mr-2">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
      </button>
      <span class="font-bold text-slate-900 dark:text-white tracking-tight text-base">资源配额详情</span>
    `;
    headerRight.innerHTML = '';
  } else if (currentMobileTab === 'category' && currentCategory !== 'all') {
    let catName = '';
    switch(currentCategory) {
      case 'judgment': catName = '判断题'; break;
      case 'single_choice': catName = '单选题'; break;
      case 'fill_blank': catName = '填空题'; break;
      case 'subjective': catName = '主观题'; break;
      case 'wrong_questions': catName = '错题本'; break;
      case 'bookmarks': catName = '收藏夹'; break;
    }
    
    const questions = getFilteredQuestions();
    let catCorrectCount = 0;
    let catIncorrectCount = 0;
    questions.forEach(question => {
      const qKey = getQuestionId(question);
      const record = userData.answered[qKey];
      if (record) {
        if (record.isCorrect) catCorrectCount++;
        else catIncorrectCount++;
      }
    });

    const correctSvg = `<svg class="w-3.5 h-3.5 text-emerald-500 fill-none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const incorrectSvg = `<svg class="w-3.5 h-3.5 text-rose-500 fill-none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    headerLeft.innerHTML = `
      <button onclick="exitMobileSubView();" class="flex items-center justify-center p-1 rounded-full text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-none bg-transparent cursor-pointer mr-1">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
      </button>
      <div class="flex flex-col">
        <span class="font-bold text-slate-900 dark:text-white tracking-tight text-sm leading-tight">${catName}</span>
        <div class="flex items-center gap-2 mt-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-400">
          <span class="flex items-center gap-0.5">${correctSvg} ${catCorrectCount}</span>
          <span class="flex items-center gap-0.5">${incorrectSvg} ${catIncorrectCount}</span>
        </div>
      </div>
    `;
    
    // Header Bookmark Button linked to main bookmark button
    const q = questions[currentQuestionIndex];
    let isStarred = false;
    if (q) {
      const qId = getQuestionId(q);
      isStarred = userData.bookmarks.includes(qId);
    }
    
    headerRight.innerHTML = `
      <div class="flex items-center gap-1">
        <button id="mobile-header-card-btn" class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-none bg-transparent cursor-pointer text-slate-500 dark:text-slate-400" title="答题卡">
          <svg class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17h6M9 12h6M9 7h6"/></svg>
        </button>
        <button id="mobile-header-bookmark-btn" class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-none bg-transparent cursor-pointer ${isStarred ? 'text-amber-500' : 'text-slate-400'}" title="收藏">
          <svg class="w-5.5 h-5.5 ${isStarred ? 'fill-amber-500 text-amber-500' : 'fill-none text-slate-400'}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
        </button>
      </div>
    `;
  } else if (currentMobileTab === 'exam' && examState.isActive) {
    headerLeft.innerHTML = `
      <button onclick="triggerExamSubmission();" class="flex items-center justify-center p-1 rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors border-none bg-transparent cursor-pointer mr-2">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <span class="font-bold text-slate-900 dark:text-white tracking-tight text-base">模拟考试</span>
    `;
    
    headerRight.innerHTML = `
      <div class="bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400 font-bold text-xs px-2.5 py-1 rounded-full" id="mobile-exam-timer">
        --:--
      </div>
    `;
  } else {
    // Standard Logo + Title Header
    headerLeft.innerHTML = `
      <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">Σ</div>
      <span class="font-bold text-slate-900 dark:text-white tracking-tight">离散数学刷题系统</span>
    `;
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const themeIconSvg = isDark ? 
      `<svg class="w-5 h-5 text-slate-600 dark:text-slate-300 fill-none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>` :
      `<svg class="w-5 h-5 text-slate-600 dark:text-slate-300 fill-none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;

    headerRight.innerHTML = `
      <button class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-none bg-transparent cursor-pointer" id="mobile-theme-btn">
        ${themeIconSvg}
      </button>
    `;
    

  }

  // Update navbar active state
  const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
  mobileNavBtns.forEach(b => {
    const tab = b.getAttribute('data-tab');
    if (tab === currentMobileTab) {
      b.classList.remove('text-slate-500', 'dark:text-slate-400');
      b.classList.add('text-indigo-600', 'dark:text-indigo-400');
    } else {
      b.classList.remove('text-indigo-600', 'dark:text-indigo-400');
      b.classList.add('text-slate-500', 'dark:text-slate-400');
    }
  });
}

function renderCategoryGrid(container) {
  const autoNextChecked = practiceSettings.autoNext ? 'checked' : '';
  const randomOrderChecked = practiceSettings.randomOrder ? 'checked' : '';
  const hideCorrectChecked = practiceSettings.hideCorrect ? 'checked' : '';

  // Get correct count by category
  function getProgressPct(cat) {
    let total = 0;
    if (cat === 'logic') {
      total = QUESTIONS.filter(q => q.topic === 'propositional_logic' || q.topic === 'predicate_logic').length;
    } else if (['propositional_logic', 'predicate_logic', 'set_theory', 'binary_relations', 'graph_theory'].includes(cat)) {
      total = QUESTIONS.filter(q => q.topic === cat).length;
    } else if (cat === 'all') {
      total = QUESTIONS.length;
    } else if (cat === 'subjective') {
      total = QUESTIONS.filter(q => ['calculation', 'proof', 'application'].includes(q.category)).length;
    } else {
      total = QUESTIONS.filter(q => q.category === cat).length;
    }

    if (total === 0) return 0;
    
    let correct = 0;
    Object.keys(userData.answered).forEach(key => {
      const q = QUESTIONS.find(qi => getQuestionId(qi) === key);
      if (q) {
        let match = false;
        if (cat === 'logic') match = q.topic === 'propositional_logic' || q.topic === 'predicate_logic';
        else if (['propositional_logic', 'predicate_logic', 'set_theory', 'binary_relations', 'graph_theory'].includes(cat)) match = q.topic === cat;
        else if (cat === 'all') match = true;
        else if (cat === 'subjective') match = ['calculation', 'proof', 'application'].includes(q.category);
        else match = q.category === cat;

        if (match && userData.answered[key].isCorrect) {
          correct++;
        }
      }
    });

    return Math.min(100, Math.round((correct / total) * 100));
  }

  const listCategories = [
    { id: 'logic', title: '逻辑学', desc: '命题逻辑、谓词逻辑、命题联结与等值演算。', total: QUESTIONS.filter(q => q.topic === 'propositional_logic' || q.topic === 'predicate_logic').length, icon: 'account_tree', bg: 'bg-blue-100 dark:bg-blue-950/30', text: 'text-blue-600 dark:text-blue-400' },
    { id: 'propositional_logic', title: '命题逻辑', desc: '命题演算、联结词、真值表与等值式。', total: QUESTIONS.filter(q => q.topic === 'propositional_logic').length, icon: 'functions', bg: 'bg-indigo-100 dark:bg-indigo-950/30', text: 'text-indigo-600 dark:text-indigo-400' },
    { id: 'predicate_logic', title: '谓词逻辑', desc: '量词、个体谓词符号化与前束范式演绎。', total: QUESTIONS.filter(q => q.topic === 'predicate_logic').length, icon: 'join_inner', bg: 'bg-emerald-100 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400' },
    { id: 'judgment', title: '判断题型', desc: '快速检验对离散核心定理与定义的理解。', total: QUESTIONS.filter(q => q.category === 'judgment').length, icon: 'fact_check', bg: 'bg-purple-100 dark:bg-purple-950/30', text: 'text-purple-600 dark:text-purple-400' },
    { id: 'single_choice', title: '单项选择题', desc: '四选一选择最符合要求的逻辑推导或式子。', total: QUESTIONS.filter(q => q.category === 'single_choice').length, icon: 'radio_button_checked', bg: 'bg-amber-100 dark:bg-amber-950/30', text: 'text-amber-600 dark:text-amber-400' },
    { id: 'fill_blank', title: '填空题型', desc: '填入最终计算真值或命题公式简写。', total: QUESTIONS.filter(q => q.category === 'fill_blank').length, icon: 'edit_square', bg: 'bg-rose-100 dark:bg-rose-950/30', text: 'text-rose-600 dark:text-rose-400' },
    { id: 'subjective', title: '主观证明题', desc: '范式展开、演绎推理以及大题综合分析。', total: QUESTIONS.filter(q => ['calculation', 'proof', 'application'].includes(q.category)).length, icon: 'description', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
    { id: 'set_theory', title: '集合论', desc: '集合运算、幂集、等值变换与证明。', total: QUESTIONS.filter(q => q.topic === 'set_theory').length, icon: 'category', bg: 'bg-pink-100 dark:bg-pink-950/30', text: 'text-pink-600 dark:text-pink-400' },
    { id: 'binary_relations', title: '二元关系', desc: '笛卡尔积、关系运算与等价自反偏序性质。', total: QUESTIONS.filter(q => q.topic === 'binary_relations').length, icon: 'join_left', bg: 'bg-orange-100 dark:bg-orange-950/30', text: 'text-orange-600 dark:text-orange-400' },
    { id: 'graph_theory', title: '图论学说', desc: '通路与回路、树以及连通图结构。', total: QUESTIONS.filter(q => q.topic === 'graph_theory').length, icon: 'share', bg: 'bg-teal-100 dark:bg-teal-950/30', text: 'text-teal-600 dark:text-teal-400' }
  ];

  let cardsHtml = '';
  listCategories.forEach(cat => {
    const pct = getProgressPct(cat.id);
    cardsHtml += `
      <div class="mobile-cat-card glass-panel rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group cursor-pointer border border-white/40 bg-white/40 dark:bg-slate-900/40" data-cat="${cat.id}">
        <div class="flex justify-between items-start mb-4">
          <div class="w-12 h-12 rounded-2xl ${cat.bg} flex items-center justify-center ${cat.text} group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-2xl">${cat.icon}</span>
          </div>
          <span class="px-3 py-1 bg-white/60 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 rounded-full text-[10px] font-bold">共 ${cat.total} 题</span>
        </div>
        <h3 class="font-headline-sm text-slate-800 dark:text-slate-100 text-sm mb-1.5 font-bold">${cat.title}</h3>
        <p class="text-outline text-xs leading-normal mb-4 font-medium">${cat.desc}</p>
        <div class="space-y-1.5">
          <div class="flex justify-between text-[10px] font-bold text-outline">
            <span>掌握度进度</span>
            <span>${pct}%</span>
          </div>
          <div class="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full bg-primary rounded-full" style="width: ${pct}%"></div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = `
    <div class="space-y-6" style="animation: fadeIn 0.4s ease; padding-bottom: 100px;">
      <!-- Header & Search -->
      <section class="space-y-4">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">练习题库</h1>
        <div class="relative group">
          <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">search</span>
          <input id="mobile-search-input" class="w-full h-12 pl-12 pr-4 rounded-2xl glass-panel focus:border-primary focus:outline-none transition-all placeholder:text-outline text-slate-900 dark:text-white text-sm bg-white/30 dark:bg-slate-900/30" placeholder="搜索知识点或题型..." type="text"/>
        </div>
      </section>

      <!-- Settings Toggles -->
      <section class="glass-panel rounded-2xl p-4 overflow-x-auto bg-white/40 dark:bg-slate-900/40">
        <div class="flex items-center gap-8 min-w-max">
          <div class="flex items-center gap-2">
            <label class="custom-toggle">
              <input type="checkbox" id="mobile-set-auto-next" ${autoNextChecked}>
              <span class="slider"></span>
            </label>
            <span class="text-xs text-on-surface font-bold">自动下一题</span>
          </div>
          <div class="flex items-center gap-2">
            <label class="custom-toggle">
              <input type="checkbox" id="mobile-set-random-order" ${randomOrderChecked}>
              <span class="slider"></span>
            </label>
            <span class="text-xs text-on-surface font-bold">随机乱序</span>
          </div>
          <div class="flex items-center gap-2">
            <label class="custom-toggle">
              <input type="checkbox" id="mobile-set-hide-correct" ${hideCorrectChecked}>
              <span class="slider"></span>
            </label>
            <span class="text-xs text-on-surface font-bold">隐藏已做对题</span>
          </div>
        </div>
      </section>

      <!-- Category Grid -->
      <section class="grid grid-cols-1 gap-4" id="mobile-category-grid">
        ${cardsHtml}
      </section>
    </div>
  `;

  // Bind settings toggles
  container.querySelector('#mobile-set-auto-next').addEventListener('change', (e) => {
    practiceSettings.autoNext = e.target.checked;
    saveSettings();
    showToast(`已${e.target.checked ? '启用' : '禁用'}自动下一题`, 'info');
  });
  container.querySelector('#mobile-set-random-order').addEventListener('change', (e) => {
    practiceSettings.randomOrder = e.target.checked;
    shuffledQuestionsCache = null;
    saveSettings();
    currentQuestionIndex = 0;
    showToast(`已${e.target.checked ? '启用' : '禁用'}随机乱序`, 'info');
  });
  container.querySelector('#mobile-set-hide-correct').addEventListener('change', (e) => {
    practiceSettings.hideCorrect = e.target.checked;
    saveSettings();
    showToast(`已${e.target.checked ? '启用' : '禁用'}隐藏已做对题`, 'info');
  });

  // Bind category clicks
  container.querySelectorAll('.mobile-cat-card').forEach(card => {
    card.addEventListener('click', () => {
      const selectedCat = card.getAttribute('data-cat');
      currentCategory = selectedCat;
      currentQuestionIndex = 0;
      renderViewport();
    });
  });

  // Search filter
  const searchInput = container.querySelector('#mobile-search-input');
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    const cards = container.querySelectorAll('.mobile-cat-card');
    cards.forEach(card => {
      const title = card.querySelector('h3').innerText.toLowerCase();
      const desc = card.querySelector('p').innerText.toLowerCase();
      if (title.includes(val) || desc.includes(val)) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  });
}


function renderLobbyShortcutCard(container) {
  const card = document.createElement('div');
  card.className = 'w-full mt-4';
  card.innerHTML = `
    <div class="bg-white/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl p-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-all active:scale-[0.98]" id="mobile-lobby-comments-shortcut">
      <div class="flex justify-between items-center mb-3">
        <h2 class="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2">
          <span class="material-symbols-outlined text-indigo-600" style="font-variation-settings: 'FILL' 1;">forum</span>
          学术讨论大厅
        </h2>
        <span class="material-symbols-outlined text-slate-400">chevron_right</span>
      </div>
      <div class="bg-white/40 dark:bg-slate-900/40 rounded-xl p-3 border border-slate-200/20" id="mobile-lobby-shortcut-comment-content">
        <div class="flex items-center gap-2 mb-1.5">
          <div class="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-[10px]" id="mobile-lobby-shortcut-avatar">U</div>
          <span class="text-xs font-semibold text-slate-700 dark:text-slate-300" id="mobile-lobby-shortcut-user">离散学者</span>
          <span class="text-[9px] text-slate-400 ml-auto" id="mobile-lobby-shortcut-time">--</span>
        </div>
        <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed truncate" id="mobile-lobby-shortcut-text">点击进入讨论大厅，与同学分享学习心得与疑问！</p>
      </div>
    </div>
  `;
  container.appendChild(card);
  
  card.querySelector('#mobile-lobby-comments-shortcut').addEventListener('click', () => {
    currentMobileTab = 'lobby_comments';
    renderViewport();
  });
  
  fetchLatestCommentPreview();
}

async function fetchLatestCommentPreview() {
  try {
    const response = await fetch(`${API_BASE}/comments?q=lobby`);
    if (response.ok) {
      const comments = await response.json();
      if (comments && comments.length > 0) {
        const latest = comments[comments.length - 1];
        const timeEl = document.getElementById('mobile-lobby-shortcut-time');
        const userEl = document.getElementById('mobile-lobby-shortcut-user');
        const textEl = document.getElementById('mobile-lobby-shortcut-text');
        const avatarEl = document.getElementById('mobile-lobby-shortcut-avatar');
        
        if (timeEl) timeEl.innerText = formatRelativeTime(latest.timestamp);
        if (userEl) userEl.innerText = latest.username;
        if (textEl) textEl.innerText = latest.content;
        if (avatarEl) avatarEl.innerText = latest.username[0].toUpperCase();
      }
    }
  } catch (err) {
    console.error("Error previewing comments", err);
  }
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return new Date(timestamp).toLocaleDateString();
}

async function renderLobbyComments(container) {
  container.innerHTML = `
    <div class="flex flex-col h-[calc(100vh-140px)]" style="animation: fadeIn 0.4s ease;">
      <!-- Message List Area -->
      <div class="flex-1 overflow-y-auto space-y-4 pr-1" id="mobile-lobby-comments-list" style="padding-bottom: 2rem;">
        <div class="text-center py-8 text-slate-400">
          <span class="inline-block animate-spin mr-2">⏳</span>正在加载讨论留言...
        </div>
      </div>
      
      <!-- Bottom Input Row -->
      <div class="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200/50 dark:border-slate-800/50 pt-3 px-1 flex gap-2 items-center">
        <input type="text" id="mobile-lobby-comment-input" placeholder="说点什么..." class="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2 text-sm focus:border-indigo-600 focus:outline-none placeholder:text-slate-400 text-slate-900 dark:text-white" autocomplete="off">
        <button id="mobile-lobby-comment-send" class="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors shadow-md border-none cursor-pointer">
          <span class="material-symbols-outlined text-sm">send</span>
        </button>
      </div>
    </div>
  `;

  const listContainer = container.querySelector('#mobile-lobby-comments-list');
  const inputField = container.querySelector('#mobile-lobby-comment-input');
  const sendBtn = container.querySelector('#mobile-lobby-comment-send');

  await loadLobbyCommentsList(listContainer);

  sendBtn.addEventListener('click', () => postLobbyComment(listContainer, inputField));
  inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') postLobbyComment(listContainer, inputField);
  });
}

async function loadLobbyCommentsList(listContainer) {
  try {
    const response = await fetch(`${API_BASE}/comments?q=lobby`);
    if (!response.ok) throw new Error("Failed to fetch comments");
    
    const comments = await response.json();
    listContainer.innerHTML = '';
    
    if (comments.length === 0) {
      listContainer.innerHTML = `
        <div class="text-center py-12 text-slate-400 text-sm">
          💬 暂时没有学术讨论，说点什么发布第一条留言吧！
        </div>
      `;
      return;
    }
    
    comments.forEach(c => {
      const card = document.createElement('article');
      card.className = 'bg-white/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl p-4 flex flex-col gap-2 shadow-sm';
      card.innerHTML = `
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
            ${c.username[0].toUpperCase()}
          </div>
          <div class="flex flex-col">
            <span class="text-xs font-bold text-slate-800 dark:text-white">${c.username}</span>
            <span class="text-[9px] text-slate-400">${formatRelativeTime(c.timestamp)}</span>
          </div>
        </div>
        <p class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">${escapeHtml(c.content)}</p>
      `;
      listContainer.appendChild(card);
    });
    
    listContainer.scrollTop = listContainer.scrollHeight;
  } catch (err) {
    listContainer.innerHTML = `
      <div class="text-center py-12 text-red-500 text-sm">
        ⚠️ 无法加载留言板数据，请检查网络或稍后重试
      </div>
    `;
  }
}

async function postLobbyComment(listContainer, inputField) {
  const content = inputField.value.trim();
  if (!content) {
    showToast('留言内容不能为空！', 'error');
    return;
  }
  
  const token = localStorage.getItem('dm_jwt_token');
  if (!token) {
    showToast('请先登录账号以参与讨论！', 'error');
    document.getElementById('login-trigger-btn').click();
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ qId: 'lobby', content })
    });
    
    const result = await response.json();
    if (response.ok) {
      inputField.value = '';
      showToast('发布留言成功！', 'success');
      loadLobbyCommentsList(listContainer);
    } else {
      showToast(result.error || '发布失败，请重试！', 'error');
    }
  } catch (err) {
    showToast('服务器连接失败，请稍后重试！', 'error');
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function renderQuotaDetails(container) {
  container.innerHTML = `
    <div class="space-y-6" id="cf-usage-container" style="animation: fadeIn 0.4s ease; padding-bottom: 80px;">
    </div>
  `;
  
  renderCloudflareUsageCard(container);
}

function renderMobileLobby(container) {
  const answeredKeys = Object.keys(userData.answered);
  const totalAnswered = answeredKeys.length;
  let correctCount = 0;
  answeredKeys.forEach(key => {
    if (userData.answered[key].isCorrect) correctCount++;
  });
  const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
  
  // Topic Mastery counts
  let propCorrect = 0, propAnswered = 0;
  let predCorrect = 0, predAnswered = 0;
  let setCorrect = 0, setAnswered = 0;
  let relationCorrect = 0, relationAnswered = 0;
  let graphCorrect = 0, graphAnswered = 0;
  
  answeredKeys.forEach(key => {
    const q = QUESTIONS.find(qi => getQuestionId(qi) === key);
    if (q) {
      if (q.topic === 'propositional_logic') {
        propAnswered++;
        if (userData.answered[key].isCorrect) propCorrect++;
      } else if (q.topic === 'predicate_logic') {
        predAnswered++;
        if (userData.answered[key].isCorrect) predCorrect++;
      } else if (q.topic === 'set_theory') {
        setAnswered++;
        if (userData.answered[key].isCorrect) setCorrect++;
      } else if (q.topic === 'binary_relations') {
        relationAnswered++;
        if (userData.answered[key].isCorrect) relationCorrect++;
      } else if (q.topic === 'graph_theory') {
        graphAnswered++;
        if (userData.answered[key].isCorrect) graphCorrect++;
      }
    }
  });

  const propTotal = QUESTIONS.filter(q => q.topic === 'propositional_logic').length || 26;
  const predTotal = QUESTIONS.filter(q => q.topic === 'predicate_logic').length || 30;
  const setTotal = QUESTIONS.filter(q => q.topic === 'set_theory').length || 0;
  const relationTotal = QUESTIONS.filter(q => q.topic === 'binary_relations').length || 0;
  const graphTotal = QUESTIONS.filter(q => q.topic === 'graph_theory').length || 0;

  const propMastery = propAnswered > 0 ? Math.round((propCorrect / propTotal) * 100) : 0;
  const predMastery = predAnswered > 0 ? Math.round((predCorrect / predTotal) * 100) : 0;
  const setMastery = setTotal > 0 ? Math.round((setCorrect / setTotal) * 100) : 0;
  const relationMastery = relationTotal > 0 ? Math.round((relationCorrect / relationTotal) * 100) : 0;
  const graphMastery = graphTotal > 0 ? Math.round((graphCorrect / graphTotal) * 100) : 0;

  const completedDailyCount = userData.dailyChallenge && userData.dailyChallenge.questions ? userData.dailyChallenge.questions.filter(qKey => userData.answered[qKey] && userData.answered[qKey].isCorrect).length : 0;
  const isDailyCompleted = userData.dailyChallenge && userData.dailyChallenge.completed;
  
  let dailyProgressText = `今日挑战进度: ${completedDailyCount}/3 (答对全部3道题即完成今日打卡)`;
  let dailyBtnText = '去挑战';
  if (isDailyCompleted) {
    dailyProgressText = '今日挑战已全部完成，打卡成功！ 🔥';
    dailyBtnText = '查看挑战';
  }

  // Render main structure
  container.innerHTML = `
    <div class="space-y-6" style="animation: fadeIn 0.4s ease; padding-bottom: 100px;">
      <!-- Greeting -->
      <div class="flex flex-col gap-1 py-1">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">您好，同学</h1>
        <p class="text-xs text-outline">准备好开始今天的离散数学练习了吗？</p>
      </div>

      <!-- Daily Challenge Card -->
      <section class="glass-panel p-5 relative overflow-hidden rounded-2xl bg-white/40 dark:bg-slate-900/40 cursor-pointer border border-primary/10 hover:border-primary/30 transition-colors" id="mob-lobby-daily-card">
        <div class="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full blur-3xl"></div>
        <div class="relative z-10 flex justify-between items-center">
          <div class="space-y-1">
            <h2 class="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings: 'FILL' 1;">calendar_today</span>
              每日一练 (Daily Challenge)
            </h2>
            <p class="text-[11px] text-outline font-medium">
              ${dailyProgressText}
            </p>
          </div>
          <div class="bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
            <span class="text-[10px] text-primary font-bold">
              ${dailyBtnText}
            </span>
          </div>
        </div>
      </section>

      <!-- Cloud Quota Card -->
      <section class="glass-panel p-5 relative overflow-hidden rounded-2xl bg-white/40 dark:bg-slate-900/40 cursor-pointer" id="mob-lobby-quota-card">
        <div class="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full blur-3xl"></div>
        <div class="relative z-10 space-y-4">
          <div class="flex justify-between items-center">
            <h2 class="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings: 'FILL' 1;">cloud_done</span>
              云端资源配额
            </h2>
            <div class="bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/10">
              <span class="text-[9px] text-primary font-bold" id="mob-lobby-quota-reset">
                重置倒计时: 正在同步...
              </span>
            </div>
          </div>
          
          <div class="space-y-1">
            <span class="text-[10px] text-outline font-bold block mb-1">Workers/Pages 平台请求配额</span>
            <div style="background-color: var(--bg-secondary); border-radius: 9999px; height: 24px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; width: 100%; border: 1px solid var(--border-color);">
              <div id="mob-lobby-workers-pages-progress" style="background: linear-gradient(90deg, var(--primary), var(--accent)); height: 100%; position: absolute; left: 0; top: 0; transition: width 0.6s ease; width: 0%"></div>
              <span id="mob-lobby-workers-pages-requests" style="color: var(--text-primary); font-size: 0.75rem; font-weight: 700; z-index: 1; user-select:none;">
                本日已用: -- / -- (0%)
              </span>
            </div>
          </div>
          
          <div class="space-y-1">
            <span class="text-[10px] text-outline font-bold block mb-1">Workers AI 智能算力配额</span>
            <div style="background-color: var(--bg-secondary); border-radius: 9999px; height: 24px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; width: 100%; border: 1px solid var(--border-color);">
              <div id="mob-lobby-ai-progress" style="background: linear-gradient(90deg, #10B981, var(--primary)); height: 100%; position: absolute; left: 0; top: 0; transition: width 0.6s ease; width: 0%"></div>
              <span id="mob-lobby-ai-neurons" style="color: var(--text-primary); font-size: 0.75rem; font-weight: 700; z-index: 1; user-select:none;">
                本日已用: -- / -- (0%)
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Stats Grid (4 cards) -->
      <section class="grid grid-cols-2 gap-4">
        <div class="glass-panel p-4 flex flex-col gap-1 rounded-2xl bg-white/40 dark:bg-slate-900/40">
          <span class="material-symbols-outlined text-primary/60 mb-1 text-lg">database</span>
          <span class="text-[9px] font-bold text-outline">题库总量</span>
          <span class="text-lg font-extrabold text-slate-800 dark:text-white">${QUESTIONS.length} 题</span>
        </div>
        <div class="glass-panel p-4 flex flex-col gap-1 rounded-2xl bg-white/40 dark:bg-slate-900/40">
          <span class="material-symbols-outlined text-secondary/60 mb-1 text-lg">check_circle</span>
          <span class="text-[9px] font-bold text-outline">已答题数</span>
          <span class="text-lg font-extrabold text-primary">${totalAnswered} 题</span>
        </div>
        <div class="glass-panel p-4 flex flex-col gap-1 rounded-2xl bg-white/40 dark:bg-slate-900/40">
          <span class="material-symbols-outlined text-primary/60 mb-1 text-lg">trending_up</span>
          <span class="text-[9px] font-bold text-outline">平均正确率</span>
          <span class="text-lg font-extrabold text-secondary">${accuracy}%</span>
        </div>
        <div class="glass-panel p-4 flex flex-col gap-1 rounded-2xl bg-white/40 dark:bg-slate-900/40">
          <span class="material-symbols-outlined text-secondary/60 mb-1 text-lg">schedule</span>
          <span class="text-[9px] font-bold text-outline">做题掌握级别</span>
          <span class="text-sm font-extrabold text-slate-800 dark:text-white">${totalAnswered >= 30 ? '离散精英 🎓' : '初学乍练 📖'}</span>
        </div>
      </section>

      <!-- Mastery Panel -->
      <section class="glass-panel p-5 rounded-2xl space-y-4 bg-white/40 dark:bg-slate-900/40">
        <h2 class="text-xs font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-1.5">
          <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings: 'FILL' 1;">bar_chart</span>
          科目掌握度进度
        </h2>
        <div class="space-y-4">
          <div class="space-y-1">
            <div class="flex justify-between items-center text-[10px]">
              <span class="text-slate-800 dark:text-slate-200 font-bold">命题逻辑 (Propositional)</span>
              <span class="font-bold text-primary">${propMastery}%</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div class="bg-primary h-full rounded-full" style="width: ${propMastery}%"></div>
            </div>
          </div>
          <div class="space-y-1">
            <div class="flex justify-between items-center text-[10px]">
              <span class="text-slate-800 dark:text-slate-200 font-bold">谓词逻辑 (Predicate)</span>
              <span class="font-bold text-secondary">${predMastery}%</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div class="bg-secondary h-full rounded-full" style="width: ${predMastery}%"></div>
            </div>
          </div>
          <div class="space-y-1">
            <div class="flex justify-between items-center text-[10px]">
              <span class="text-slate-800 dark:text-slate-200 font-bold">集合论 (Set Theory)</span>
              <span class="font-bold text-emerald-500">${setMastery}%</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div class="bg-emerald-500 h-full rounded-full" style="width: ${setMastery}%"></div>
            </div>
          </div>
          <div class="space-y-1">
            <div class="flex justify-between items-center text-[10px]">
              <span class="text-slate-800 dark:text-slate-200 font-bold">二元关系 (Relations)</span>
              <span class="font-bold text-amber-500">${relationMastery}%</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div class="bg-amber-500 h-full rounded-full" style="width: ${relationMastery}%"></div>
            </div>
          </div>
          <div class="space-y-1">
            <div class="flex justify-between items-center text-[10px]">
              <span class="text-slate-800 dark:text-slate-200 font-bold">图论学说 (Graph Theory)</span>
              <span class="font-bold text-rose-500">${graphMastery}%</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div class="bg-rose-500 h-full rounded-full" style="width: ${graphMastery}%"></div>
            </div>
          </div>
        </div>
      </section>

      <!-- Message Board Shortcut Card -->
      <div id="mobile-lobby-shortcut-container"></div>
    </div>
  `;

  // Render Lobby comments shortcut card
  const shortcutContainer = container.querySelector('#mobile-lobby-shortcut-container');
  renderLobbyShortcutCard(shortcutContainer);

  // Bind clicks
  container.querySelector('#mob-lobby-quota-card').onclick = () => {
    currentMobileTab = 'quota_details';
    renderViewport();
  };

  const mobDailyCard = container.querySelector('#mob-lobby-daily-card');
  if (mobDailyCard) {
    mobDailyCard.onclick = () => {
      currentMobileTab = 'category';
      currentCategory = 'daily_challenge';
      currentQuestionIndex = 0;
      renderViewport();
    };
  }

  // Run async CF fetch to update progress
  fetchLobbyQuotaDetails();
}

async function fetchLobbyQuotaDetails() {
  const accountId = localStorage.getItem('cf_account_id');
  const apiToken = localStorage.getItem('cf_api_token');
  const body = (accountId && apiToken) ? {
    accountId,
    apiToken,
    scriptName: getExpectedCfScriptName()
  } : {};

  try {
    const res = await fetch(`${API_BASE}/cf-usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (res.ok) {
      const result = await res.json();
      const workers = result.workersRequests || 0;
      const pages = result.pagesRequests || 0;
      const total = result.totalRequests || 0;
      const quota = parseInt(localStorage.getItem('cf_quota_limit')) || result.quota || 100000;
      const pct = parseFloat(((total / quota) * 100).toFixed(2));
      
      const aiNeurons = result.aiNeurons || 0;
      const aiQuota = result.aiQuota || 10000;
      const aiPct = parseFloat(((aiNeurons / aiQuota) * 100).toFixed(2));
      let secondsLeft = result.secondsRemaining || 0;

      // Update lobby elements
      const resetEl = document.getElementById('mob-lobby-quota-reset');
      const reqEl = document.getElementById('mob-lobby-workers-pages-requests');
      const reqProg = document.getElementById('mob-lobby-workers-pages-progress');
      const aiEl = document.getElementById('mob-lobby-ai-neurons');
      const aiProg = document.getElementById('mob-lobby-ai-progress');

      if (reqEl) reqEl.innerText = `本日已用: ${total.toLocaleString()} / ${quota.toLocaleString()} (${pct}%)`;
      if (reqProg) reqProg.style.width = `${Math.min(100, pct)}%`;
      if (aiEl) aiEl.innerText = `本日已用: ${aiNeurons.toLocaleString()} / ${aiQuota.toLocaleString()} Neurons (${aiPct}%)`;
      if (aiProg) aiProg.style.width = `${Math.min(100, aiPct)}%`;

      function updateCountdown() {
        if (secondsLeft > 0) {
          const hours = Math.floor(secondsLeft / 3600);
          const minutes = Math.floor((secondsLeft % 3600) / 60);
          const secs = secondsLeft % 60;
          if (resetEl) {
            resetEl.innerText = `距离重置: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
          }
          secondsLeft--;
        } else {
          fetchLobbyQuotaDetails();
        }
      }

      updateCountdown();
      if (window.mobLobbyCountdownInterval) clearInterval(window.mobLobbyCountdownInterval);
      window.mobLobbyCountdownInterval = setInterval(updateCountdown, 1000);
    }
  } catch(e) {
    const resetEl = document.getElementById('mob-lobby-quota-reset');
    if (resetEl) resetEl.innerText = '配额同步失败';
  }
}

function renderMobilePractice(container) {
  const questions = getFilteredQuestions();
  if (questions.length === 0) {
    container.innerHTML = `
      <div class="glass-panel rounded-2xl p-6 text-center my-8 space-y-4 bg-white/40 dark:bg-slate-900/40">
        <div class="text-4xl text-primary font-bold">✓</div>
        <h2 class="text-lg font-bold text-on-surface">这里空空如也</h2>
        <p class="text-sm text-outline">你在这个分类下没有任何题目。如果是错题本，赶紧去做题积累吧！</p>
      </div>
    `;
    return;
  }

  const q = questions[currentQuestionIndex];
  const qId = getQuestionId(q);
  const isBookmarked = userData.bookmarks.includes(qId);
  const userRecord = userData.answered[qId];
  const isLoggedIn = !!localStorage.getItem('dm_jwt_token');

  let catBadgeName = '';
  switch(q.category) {
    case 'judgment': catBadgeName = '判断题'; break;
    case 'single_choice': catBadgeName = '单选题'; break;
    case 'fill_blank': catBadgeName = '填空题'; break;
    case 'calculation': catBadgeName = '计算题'; break;
    case 'proof': catBadgeName = '证明题'; break;
    case 'application': catBadgeName = '应用题'; break;
  }

  container.innerHTML = `
    <div class="space-y-6" style="animation: fadeIn 0.4s ease; padding-bottom: 80px;">
      <!-- Question Card -->
      <section class="glass-panel rounded-2xl p-5 relative overflow-hidden bg-white/40 dark:bg-slate-900/40">
        <div class="absolute top-0 left-0 w-1 h-full bg-primary"></div>
        <div class="flex justify-between items-center mb-3">
          <div class="flex gap-2 items-center">
            <span class="bg-primary/10 text-primary px-3 py-1 rounded-full font-label-md text-xs font-bold">${catBadgeName}</span>
            <button class="btn btn-outline" id="mob-call-ai-btn" style="padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-color: var(--primary); color: var(--primary); display: flex; align-items: center; gap: 0.2rem; border-radius: 12px; cursor: pointer; background: transparent; transition: all 0.2s;">
              🤖 问问助教
            </button>
          </div>
          <span class="text-xs text-outline font-semibold">题号: ${currentQuestionIndex + 1} / ${questions.length}</span>
        </div>
        <h2 class="font-headline-sm text-base text-on-surface mb-4">题目内容</h2>
        <div class="font-math-display text-sm text-on-surface leading-relaxed space-y-4">
          ${renderContent(q.question)}
        </div>
      </section>

      <!-- Options / Interactive Area -->
      <section class="space-y-3" id="mobile-interactive-area">
        <!-- Interactive widgets populated dynamically -->
      </section>

      <!-- Solution Panel (Only visible after answered or toggled) -->
      <section class="glass-panel rounded-2xl p-5 space-y-4 bg-white/40 dark:bg-slate-900/40" id="mobile-solution-panel" style="display: none;">
        <h2 class="font-headline-sm text-base text-on-surface flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <span class="material-symbols-outlined text-amber-500">lightbulb</span>
          参考答案与解析
        </h2>
        <div class="p-3 bg-primary/5 rounded-xl text-sm font-semibold text-primary" id="mobile-solution-answer"></div>
        <div class="text-xs text-on-surface-variant leading-relaxed" id="mobile-solution-analysis"></div>

        <!-- Question Comments Section (Dynamic) -->
        <div class="border-t border-slate-200/50 dark:border-slate-800/50 pt-4 space-y-3">
          <div class="flex justify-between items-center">
            <h3 class="text-xs font-bold text-on-surface">💬 题目讨论区</h3>
            <span class="text-[10px] text-outline" id="mobile-comments-count">正在加载讨论...</span>
          </div>
          <div class="space-y-3 max-h-[220px] overflow-y-auto pr-1" id="mobile-question-comments-list">
            <!-- Dynamic comments list -->
          </div>
          <div class="flex gap-2 items-center mt-2">
            <input type="text" id="mobile-q-comment-input" placeholder="对这道题有什么看法？" class="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5 text-xs focus:border-indigo-600 focus:outline-none placeholder:text-slate-400 text-slate-900 dark:text-white" autocomplete="off">
            <button id="mobile-q-comment-send" class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/95 transition-colors border-none cursor-pointer">
              <span class="material-symbols-outlined text-xs">send</span>
            </button>
          </div>
        </div>
      </section>
      
      <!-- Sticky Bottom Control Row -->
      <div class="fixed bottom-0 left-0 w-full glass-panel border-t border-white/40 p-4 flex justify-between items-center gap-4 z-40 pb-[env(safe-area-inset-bottom,20px)] md:hidden bg-white/70 dark:bg-slate-900/70">
        <button class="flex-1 py-3 px-4 rounded-xl border border-transparent text-slate-700 dark:text-slate-300 font-headline-sm text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-all min-h-[48px] bg-white/60 dark:bg-slate-900/60 cursor-pointer flex items-center justify-center" id="mob-prev-btn" ${currentQuestionIndex === 0 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}>
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          上一题
        </button>
        <button class="flex-[2] py-3 px-4 rounded-xl bg-primary text-white font-headline-sm text-xs hover:bg-primary/95 transition-all shadow-sm min-h-[48px] border-none cursor-pointer font-bold" id="mob-submit-btn">
          提交答案
        </button>
        <button class="flex-1 py-3 px-4 rounded-xl border border-transparent text-slate-700 dark:text-slate-300 font-headline-sm text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-all min-h-[48px] bg-white/60 dark:bg-slate-900/60 cursor-pointer flex items-center justify-center" id="mob-next-btn" ${currentQuestionIndex === questions.length - 1 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}>
          下一题
          <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>

      <!-- Mobile Practice Answer Card Overlay Sheet (Hidden by default) -->
      <div id="mob-practice-overlay" class="fixed inset-0 bg-black/50 z-[2000] hidden transition-opacity duration-300"></div>
      <div id="mob-practice-sheet" class="fixed bottom-0 left-0 w-full bg-white dark:bg-slate-900 rounded-t-3xl z-[2001] p-5 pb-8 transform translate-y-full transition-transform duration-300 shadow-2xl md:hidden border-t border-slate-200/20">
        <div class="w-12 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4"></div>
        <div class="flex justify-between items-center mb-4 border-b border-slate-200/20 pb-3">
          <h2 class="font-headline-sm text-sm text-slate-900 dark:text-white flex items-center gap-2 font-bold">
            <svg class="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17h6M9 12h6M9 7h6"/></svg>
            答题进度卡
          </h2>
          <button class="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors border-none bg-transparent cursor-pointer text-slate-500" id="mob-practice-sheet-close">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="grid grid-cols-5 gap-3 max-h-[220px] overflow-y-auto pr-1" id="mob-practice-dots-grid">
          <!-- Dots list populated dynamically -->
        </div>
        <div class="mt-6 flex justify-around text-[10px] text-outline font-semibold border-t border-slate-200/20 pt-3">
          <div class="flex items-center gap-1.2"><div class="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>正确</div>
          <div class="flex items-center gap-1.2"><div class="w-2.5 h-2.5 rounded-full bg-rose-500"></div>错误</div>
          <div class="flex items-center gap-1.2"><div class="w-2.5 h-2.5 rounded-full bg-primary"></div>当前</div>
          <div class="flex items-center gap-1.2"><div class="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"></div>未做</div>
        </div>
      </div>

      <!-- AI Assistant FAB -->
      <button class="fixed bottom-[100px] right-4 w-14 h-14 rounded-full glass-panel ai-fab-shadow flex items-center justify-center z-50 hover:scale-105 transition-transform bg-white/70 dark:bg-slate-900/70 border border-primary/20 cursor-pointer animate-bounce" id="mob-ai-fab">
        <span class="material-symbols-outlined text-primary text-3xl" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
      </button>
    </div>
  `;

  // Bind Nav buttons
  const mobPrev = container.querySelector('#mob-prev-btn');
  const mobNext = container.querySelector('#mob-next-btn');
  const mobSubmit = container.querySelector('#mob-submit-btn');
  const mobAiFab = container.querySelector('#mob-ai-fab');

  if (mobPrev) {
    mobPrev.onclick = () => {
      animateMobileTransition('right', () => {
        currentQuestionIndex--;
        renderViewport();
      });
    };
  }
  if (mobNext) {
    mobNext.onclick = () => {
      animateMobileTransition('left', () => {
        currentQuestionIndex++;
        renderViewport();
      });
    };
  }

  // Answer card sheet toggles
  const headerCardBtn = document.getElementById('mobile-header-card-btn');
  const practiceOverlay = container.querySelector('#mob-practice-overlay');
  const practiceSheet = container.querySelector('#mob-practice-sheet');
  const practiceSheetClose = container.querySelector('#mob-practice-sheet-close');

  function openPracticeSheet() {
    if (!practiceOverlay || !practiceSheet) return;
    practiceOverlay.classList.remove('hidden');
    practiceSheet.classList.remove('translate-y-full');
    
    // Render sheet dots
    const dotsGrid = container.querySelector('#mob-practice-dots-grid');
    if (dotsGrid) {
      let dotsHtml = '';
      questions.forEach((question, idx) => {
        const qKey = getQuestionId(question);
        const record = userData.answered[qKey];
        
        let cellClass = 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900';
        if (idx === currentQuestionIndex) {
          cellClass = 'bg-primary text-white border-primary font-bold scale-105';
        } else if (record) {
          cellClass = record.isCorrect ? 'bg-emerald-500 text-white border-emerald-500 font-bold' : 'bg-rose-500 text-white border-rose-500 font-bold';
        }
        
        dotsHtml += `
          <button class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold shadow-sm transition-all cursor-pointer ${cellClass}" data-index="${idx}">
            ${idx + 1}
          </button>
        `;
      });
      dotsGrid.innerHTML = dotsHtml;
      
      // Bind dot clicks
      dotsGrid.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
          const targetIdx = parseInt(btn.getAttribute('data-index'));
          currentQuestionIndex = targetIdx;
          closePracticeSheet();
          renderViewport();
        };
      });
    }
  }

  function closePracticeSheet() {
    if (!practiceOverlay || !practiceSheet) return;
    practiceOverlay.classList.add('hidden');
    practiceSheet.classList.add('translate-y-full');
  }

  if (headerCardBtn) {
    headerCardBtn.onclick = openPracticeSheet;
  }
  // Create hidden trigger for global click delegation
  let triggerBtn = container.querySelector('#mob-practice-card-btn-trigger');
  if (!triggerBtn) {
    triggerBtn = document.createElement('button');
    triggerBtn.id = 'mob-practice-card-btn-trigger';
    triggerBtn.style.display = 'none';
    container.appendChild(triggerBtn);
  }
  triggerBtn.onclick = openPracticeSheet;

  if (practiceOverlay) practiceOverlay.onclick = closePracticeSheet;
  if (practiceSheetClose) practiceSheetClose.onclick = closePracticeSheet;

  // AI Assistant FAB action
  mobAiFab.onclick = () => {
    const aiToggle = document.getElementById('ai-floating-toggle');
    if (aiToggle) aiToggle.click();
  };

  const mobCallAi = container.querySelector('#mob-call-ai-btn');
  if (mobCallAi) {
    if (!isLoggedIn) {
      mobCallAi.onclick = (e) => {
        e.stopPropagation();
        showToast('请先登录以召唤 AI 助教！', 'warning');
        document.getElementById('login-trigger-btn').click();
      };
    } else {
      mobCallAi.onclick = () => {
        bindQuestionToAi(q);
      };
    }
  }

  // Render content KaTeX
  renderMath(container);

  // Setup options/inputs
  const interactive = container.querySelector('#mobile-interactive-area');
  const solutionPanel = container.querySelector('#mobile-solution-panel');
  const solutionAnswer = container.querySelector('#mobile-solution-answer');
  const solutionAnalysis = container.querySelector('#mobile-solution-analysis');

  solutionAnswer.innerHTML = `正确答案：${renderContent(q.answer)}`;
  solutionAnalysis.innerHTML = q.analysis ? renderContent(q.analysis) : '该题目暂无详细解析。';

  // Toggle Solution Panel display and load comments
  function showAnswerReveal() {
    solutionPanel.style.display = 'block';
    renderMath(solutionPanel);
    loadMobileQuestionComments(qId, container);
  }

  if (!isLoggedIn) {
    interactive.innerHTML = `
      <div class="glass-panel p-5 text-center flex flex-col items-center gap-3 bg-white/40 dark:bg-slate-900/40">
        <span class="text-2xl">🔒</span>
        <h3 class="text-sm font-bold text-on-surface">答题特权已锁定</h3>
        <p class="text-xs text-outline max-w-[280px]">您需要登录账号才能答题、解锁参考解析与 AI 助教！</p>
        <button class="btn btn-primary" onclick="document.getElementById('login-trigger-btn').click()" style="padding: 0.5rem 1.25rem; font-size: 0.85rem;">
          立即登录 / 注册
        </button>
      </div>
    `;
    mobSubmit.disabled = true;
    mobSubmit.style.opacity = '0.5';
    mobSubmit.innerText = '请先登录';
    return;
  }

  // Answer state variable
  let selectedOptionKey = null;

  if (q.category === 'judgment') {
    interactive.innerHTML = `
      <div class="judgment-wrapper">
        <button class="judgment-btn" id="mob-judge-true" data-val="对">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>对 (True)</span>
        </button>
        <button class="judgment-btn" id="mob-judge-false" data-val="错">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>错 (False)</span>
        </button>
      </div>
    `;

    const trueCard = interactive.querySelector('#mob-judge-true');
    const falseCard = interactive.querySelector('#mob-judge-false');

    if (userRecord) {
      revealJudgmentStatus(trueCard, falseCard, userRecord.userAns, q.answer);
      showAnswerReveal();
      mobSubmit.style.display = 'none';
    } else {
      mobSubmit.style.display = 'none'; // Hide submit button for judgment questions
      [trueCard, falseCard].forEach(card => {
        card.addEventListener('click', () => {
          if (userData.answered[qId]) return;
          const val = card.getAttribute('data-val');
          const isCorrect = (val === q.answer);
          userData.answered[qId] = { userAns: val, isCorrect };
          saveUserData();
          
          revealJudgmentStatus(trueCard, falseCard, val, q.answer);
          showAnswerReveal();
          
          if (isCorrect) {
            showToast('回答正确！', 'success');
          } else {
            showToast('回答错误！', 'error');
          }
          handleAnswerSubmitted(qId, isCorrect);
        });
      });
    }

  } else if (q.category === 'single_choice') {
    let optionsHtml = '<div class="options-list">';
    q.options.forEach(opt => {
      optionsHtml += `
        <div class="option-item" data-key="${opt.key}">
          <div class="option-prefix">${opt.key}</div>
          <div class="option-text">${renderContent(opt.text)}</div>
        </div>
      `;
    });
    optionsHtml += '</div>';
    interactive.innerHTML = optionsHtml;
    renderMath(interactive);

    const optionCards = interactive.querySelectorAll('.option-item');

    if (userRecord) {
      revealChoiceStatus(optionCards, userRecord.userAns, q.answer);
      showAnswerReveal();
      mobSubmit.style.display = 'none';
    } else {
      mobSubmit.style.display = 'none'; // Hide submit button for choice questions
      optionCards.forEach(card => {
        card.addEventListener('click', () => {
          if (userData.answered[qId]) return;
          const key = card.getAttribute('data-key');
          const isCorrect = (key === q.answer);
          userData.answered[qId] = { userAns: key, isCorrect };
          saveUserData();
          
          revealChoiceStatus(optionCards, key, q.answer);
          showAnswerReveal();
          
          if (isCorrect) {
            showToast('回答正确！', 'success');
          } else {
            showToast('回答错误！', 'error');
          }
          handleAnswerSubmitted(qId, isCorrect);
        });
      });
    }

  } else if (q.category === 'fill_blank') {
    const blankCount = q.answer.includes('|') ? q.answer.split('|').length : 1;
    const userAnsParts = userRecord ? userRecord.userAns.split('|') : [];
    
    let inputsHtml = '<div class="space-y-3 bg-white/40 dark:bg-slate-900/40 p-4 rounded-2xl glass-panel">';
    for (let i = 0; i < blankCount; i++) {
      const val = userAnsParts[i] || '';
      inputsHtml += `
        <div class="flex items-center gap-3 bg-white/50 dark:bg-slate-900/50 rounded-xl px-4 py-3 border border-slate-200/50 dark:border-slate-800/50">
          <span class="text-xs font-bold text-slate-400 shrink-0 select-none">第 ${i + 1} 空:</span>
          <input type="text" class="mob-blank-sub-input flex-1 bg-transparent border-none outline-none text-sm text-slate-800 dark:text-slate-100 p-0" placeholder="请输入答案..." value="${val}" ${userRecord ? 'disabled' : ''}>
        </div>
      `;
    }
    inputsHtml += '</div>';
    interactive.innerHTML = inputsHtml;

    if (userRecord) {
      const inputs = interactive.querySelectorAll('.mob-blank-sub-input');
      const correctParts = q.answer.split('|');
      inputs.forEach((input, idx) => {
        const isPartCorrect = checkSinglePart(normalizeAnswer(input.value.trim()), normalizeAnswer(correctParts[idx] || ''));
        input.disabled = true;
        if (isPartCorrect) {
          input.parentElement.style.borderColor = '#10B981';
          input.parentElement.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
          input.style.color = '#10B981';
        } else {
          input.parentElement.style.borderColor = '#EF4444';
          input.parentElement.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
          input.style.color = '#EF4444';
        }
      });
      showAnswerReveal();
      mobSubmit.style.display = 'none';
    } else {
      mobSubmit.addEventListener('click', () => {
        const inputs = Array.from(interactive.querySelectorAll('.mob-blank-sub-input'));
        const vals = inputs.map(input => input.value.trim());
        if (vals.some(v => !v)) {
          showToast('请填满所有空格后提交！', 'warning');
          return;
        }
        
        const combinedAns = vals.join('|');
        const isCorrect = checkBlankCorrectness(combinedAns, q.answer);
        userData.answered[qId] = { userAns: combinedAns, isCorrect };
        saveUserData();
        
        const correctParts = q.answer.split('|');
        inputs.forEach((input, idx) => {
          const isPartCorrect = checkSinglePart(normalizeAnswer(input.value.trim()), normalizeAnswer(correctParts[idx] || ''));
          input.disabled = true;
          if (isPartCorrect) {
            input.parentElement.style.borderColor = '#10B981';
            input.parentElement.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
            input.style.color = '#10B981';
          } else {
            input.parentElement.style.borderColor = '#EF4444';
            input.parentElement.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
            input.style.color = '#EF4444';
          }
        });
        
        showAnswerReveal();
        mobSubmit.style.display = 'none';

        if (isCorrect) {
          showToast('回答正确！', 'success');
        } else {
          showToast('回答错误！', 'error');
        }
        handleAnswerSubmitted(qId, isCorrect);
      });
    }

  } else {
    // Subjective (calculation, proof, application)
    if (userRecord) {
      interactive.innerHTML = `
        <div class="glass-panel p-4 space-y-3 bg-white/40 dark:bg-slate-900/40">
          <textarea id="mob-subjective-input" rows="4" class="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm placeholder:text-slate-400 text-slate-900 dark:text-white" disabled>${userRecord.userAns}</textarea>
          <div class="flex flex-col gap-2 mt-3">
            <div class="text-sm font-bold ${userRecord.isCorrect ? 'text-emerald-500' : 'text-rose-500'}">
              自我评估结果：${userRecord.isCorrect ? '做对了 ✓' : '做错了 / 没做出来 ✗'}
            </div>
            <button class="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold py-2 px-4 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer w-fit" id="mob-change-grade-btn">重新评估</button>
          </div>
        </div>
      `;
      showAnswerReveal();
      mobSubmit.style.display = 'none';

      interactive.querySelector('#mob-change-grade-btn').onclick = () => {
        delete userData.answered[qId];
        saveUserData();
        renderViewport();
      };
    } else {
      interactive.innerHTML = `
        <div class="glass-panel p-4 space-y-3 bg-white/40 dark:bg-slate-900/40" id="mob-subjective-input-container">
          <textarea id="mob-subjective-input" rows="4" class="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:border-indigo-600 focus:outline-none placeholder:text-slate-400 text-slate-900 dark:text-white" placeholder="请在这里草稿您的解题思路（主观证明题需要自主对照解析核对）..."></textarea>
          <div id="mob-subjective-eval-area" class="hidden flex flex-col gap-2 pt-2 border-t border-slate-200/20">
            <p class="text-xs font-bold text-slate-800 dark:text-slate-200">对照参考答案，你做对了吗？</p>
            <div class="flex gap-3">
              <button class="bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-400 text-xs font-bold py-2.5 rounded-xl border border-emerald-500/20 cursor-pointer flex-1" id="mob-grade-correct">做对了</button>
              <button class="bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 text-rose-600 dark:text-rose-400 text-xs font-bold py-2.5 rounded-xl border border-rose-500/20 cursor-pointer flex-1" id="mob-grade-incorrect">做错了 / 没做出来</button>
            </div>
          </div>
        </div>
      `;

      const subInput = interactive.querySelector('#mob-subjective-input');
      const evalArea = interactive.querySelector('#mob-subjective-eval-area');

      mobSubmit.innerText = '核对并看解析';
      mobSubmit.onclick = () => {
        const val = subInput.value.trim();
        subInput.disabled = true;
        showAnswerReveal();
        mobSubmit.style.display = 'none';
        evalArea.classList.remove('hidden');

        interactive.querySelector('#mob-grade-correct').onclick = () => selectGrade(true);
        interactive.querySelector('#mob-grade-incorrect').onclick = () => selectGrade(false);

        function selectGrade(isCorrect) {
          userData.answered[qId] = {
            userAns: val || '已核对自评',
            isCorrect: isCorrect
          };
          
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
          showToast(isCorrect ? '太棒了，继续加油！' : '没关系，看懂解析才是关键', isCorrect ? 'success' : 'info');
          
          // Execute the general completion/navigation logic
          handleAnswerSubmitted(qId, isCorrect);
          
          // Re-render viewport to show the result state
          renderViewport();
        }
      };
    }
  }
}

function revealJudgmentMobile(cards, userAns, standardAns) {
  cards.forEach(card => {
    const val = card.getAttribute('data-val');
    card.classList.remove('option-selected');
    
    if (val === standardAns) {
      card.style.borderColor = '#10B981';
      card.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
    } else if (val === userAns && userAns !== standardAns) {
      card.style.borderColor = '#EF4444';
      card.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
    }
  });
}

function revealChoiceMobile(optionCards, userAns, standardAns) {
  optionCards.forEach(card => {
    const key = card.getAttribute('data-key');
    card.classList.remove('option-selected');
    const ind = card.querySelector('div');
    ind.className = 'w-8 h-8 rounded-full border border-slate-300 dark:border-slate-700 flex items-center justify-center font-bold text-sm shrink-0 select-none';

    if (key === standardAns) {
      card.style.borderColor = '#10B981';
      card.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
      ind.className = 'w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shrink-0 select-none border-none';
    } else if (key === userAns && userAns !== standardAns) {
      card.style.borderColor = '#EF4444';
      card.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
      ind.className = 'w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-sm shrink-0 select-none border-none';
    }
  });
}

async function loadMobileQuestionComments(qId, container) {
  const countBadge = container.querySelector('#mobile-comments-count');
  const list = container.querySelector('#mobile-question-comments-list');
  const input = container.querySelector('#mobile-q-comment-input');
  const send = container.querySelector('#mobile-q-comment-send');

  if (!list || !countBadge) return;

  async function loadList() {
    try {
      const res = await fetch(`${API_BASE}/comments?q=${qId}`);
      if (!res.ok) throw new Error('comments failed');
      const comments = await res.json();
      countBadge.innerText = `共 ${comments.length} 条讨论`;
      
      list.innerHTML = '';
      if (comments.length === 0) {
        list.innerHTML = `<div class="text-[10px] text-outline text-center py-2">💬 暂无讨论，发布第一条留言吧！</div>`;
        return;
      }

      const loggedInProfile = JSON.parse(localStorage.getItem('dm_profile') || '{}');
      const currentUsername = loggedInProfile.username || '';

      comments.forEach(c => {
        const item = document.createElement('div');
        item.className = 'bg-slate-100/50 dark:bg-slate-800/50 rounded-xl p-2.5 space-y-1';
        const isMine = currentUsername && (c.username === currentUsername);
        item.innerHTML = `
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] font-bold text-slate-700 dark:text-slate-300">${c.username}</span>
            <span class="text-[8px] text-slate-400 ml-auto">${formatRelativeTime(c.timestamp)}</span>
            ${isMine ? `<button class="mob-delete-comment-btn text-[9px] text-rose-500 hover:text-rose-700 ml-1.5 border-none bg-transparent cursor-pointer" data-timestamp="${c.timestamp}">删除</button>` : ''}
          </div>
          <p class="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">${escapeHtml(c.content)}</p>
        `;
        list.appendChild(item);
      });

      list.querySelectorAll('.mob-delete-comment-btn').forEach(btn => {
        btn.onclick = async () => {
          const timestamp = parseInt(btn.getAttribute('data-timestamp'));
          if (!confirm('确定要删除这条评论吗？')) return;
          const token = localStorage.getItem('dm_jwt_token');
          if (!token) return;

          try {
            const deleteRes = await fetch(`${API_BASE}/comments`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ qId, timestamp })
            });

            if (deleteRes.ok) {
              showToast('评论已删除！', 'success');
              await loadList();
            } else {
              const errData = await deleteRes.json();
              showToast(errData.error || '删除失败', 'error');
            }
          } catch (e) {
            showToast('删除失败，请检查网络连接', 'error');
          }
        };
      });

      list.scrollTop = list.scrollHeight;
    } catch(err) {
      countBadge.innerText = `加载失败`;
    }
  }

  await loadList();

  // Send action
  send.onclick = async () => {
    const val = input.value.trim();
    if (!val) return;
    const token = localStorage.getItem('dm_jwt_token');
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ qId, content: val })
      });
      if (res.ok) {
        input.value = '';
        await loadList();
        showToast('发布留言成功！', 'success');
      } else {
        const data = await res.json();
        showToast(data.error || '发布失败', 'error');
      }
    } catch(e) {
      showToast('连接失败', 'error');
    }
  };
}

async function renderMobileLeaderboard(container) {
  container.innerHTML = `
    <div class="space-y-6" style="animation: fadeIn 0.4s ease; padding-bottom: 100px;">
      <div class="space-y-1">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">全球荣耀榜</h1>
        <p class="text-xs text-outline">全真模拟考最佳纪录学霸总汇 (Top 50)</p>
      </div>

      <div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
        <button class="flex-1 text-center py-2 text-xs font-bold bg-white dark:bg-slate-900 rounded-xl shadow-sm text-primary" id="mobile-leaderboard-tab-score">
          模拟考高分榜
        </button>
        <button class="flex-1 text-center py-2 text-xs font-bold text-slate-400 cursor-not-allowed" disabled>
          活跃学霸榜 (敬请期待)
        </button>
      </div>

      <section class="space-y-3" id="mobile-leaderboard-list">
        <div class="text-center py-12 text-slate-400 text-sm">
          <span class="inline-block animate-spin mr-2">⏳</span>正在加载数据...
        </div>
      </section>
    </div>
  `;

  const listContainer = container.querySelector('#mobile-leaderboard-list');

  try {
    const response = await fetch(`${API_BASE}/leaderboard`);
    if (!response.ok) throw new Error('api error');
    
    const list = await response.json();
    listContainer.innerHTML = '';
    
    if (list.length === 0) {
      listContainer.innerHTML = `
        <div class="glass-panel rounded-2xl p-8 text-center space-y-4 bg-white/40 dark:bg-slate-900/40">
          <div class="text-4xl">🏆</div>
          <h2 class="text-lg font-bold text-on-surface">排行榜空空如也</h2>
          <p class="text-sm text-outline">赶紧注册登录提交考卷，成为全场第一吧！</p>
        </div>
      `;
      return;
    }
    
    list.forEach((item, idx) => {
      let borderLeftColor = '';
      let rankBadgeClass = '';
      let badgeStyle = '';
      let numColorClass = 'text-slate-400';
      
      if (idx === 0) {
        borderLeftColor = 'bg-[#FFD700]';
        rankBadgeClass = 'text-[#FFD700]';
        badgeStyle = `style="font-variation-settings: 'FILL' 1;"`;
      } else if (idx === 1) {
        borderLeftColor = 'bg-[#C0C0C0]';
        rankBadgeClass = 'text-[#C0C0C0]';
      } else if (idx === 2) {
        borderLeftColor = 'bg-[#CD7F32]';
        rankBadgeClass = 'text-[#CD7F32]';
      }
      
      const isTop3 = idx < 3;
      const rankBadgeHtml = isTop3 
        ? `<span class="material-symbols-outlined text-2xl ${rankBadgeClass}" ${badgeStyle}>military_tech</span>`
        : `<span class="text-sm font-bold ${numColorClass}">${idx + 1}</span>`;
      
      const borderClass = isTop3 ? `relative overflow-hidden` : `border-transparent`;
      const borderStripHtml = isTop3 ? `<div class="absolute top-0 left-0 w-1 h-full ${borderLeftColor}"></div>` : '';
      
      const userCard = document.createElement('div');
      userCard.className = `glass-panel p-4 rounded-2xl flex items-center gap-3 transition-transform hover:scale-[0.99] active:scale-[0.98] duration-200 cursor-pointer ${borderClass} bg-white/40 dark:bg-slate-900/40`;
      userCard.innerHTML = `
        ${borderStripHtml}
        <div class="w-8 flex justify-center items-center">
          ${rankBadgeHtml}
        </div>
        <div class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-primary flex items-center justify-center font-bold text-sm shrink-0">
          ${item.username[0].toUpperCase()}
        </div>
        <div class="flex-1 flex flex-col">
          <span class="text-sm font-semibold text-slate-800 dark:text-slate-100">${escapeHtml(item.username)}</span>
          <span class="text-[10px] text-outline">答题: ${item.answeredCount} | 均准: ${item.correctRate}%</span>
        </div>
        <div class="flex flex-col items-end">
          <span class="text-sm font-bold text-primary">${item.examHighScore} 分</span>
          <span class="text-[9px] text-outline">最高得分</span>
        </div>
      `;
      listContainer.appendChild(userCard);
    });

    // Add current user ranking floating bar
    const savedProfile = localStorage.getItem('dm_user_profile');
    const profile = savedProfile ? JSON.parse(savedProfile) : {};
    const myUsername = profile.username || '同学';
    const myRankIdx = list.findIndex(item => item.username === myUsername);
    
    if (myRankIdx > -1) {
      const myItem = list[myRankIdx];
      const floatingBar = document.createElement('div');
      floatingBar.className = 'fixed bottom-[96px] left-4 right-4 z-40';
      floatingBar.innerHTML = `
        <div class="glass-panel p-4 rounded-2xl shadow-[0_8px_30px_rgba(79,70,229,0.15)] flex items-center gap-3 border border-primary/20 bg-white/95 dark:bg-slate-900/95">
          <div class="w-8 flex justify-center items-center flex-col shrink-0">
            <span class="text-[9px] text-primary font-bold">我的</span>
            <span class="text-sm font-bold text-primary">${myRankIdx + 1}</span>
          </div>
          <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0">
            ${myItem.username[0].toUpperCase()}
          </div>
          <div class="flex-1 flex flex-col">
            <span class="text-xs font-bold text-primary">${myItem.username}</span>
            <span class="text-[9px] text-outline">答题数: ${myItem.answeredCount} | 均准: ${myItem.correctRate}%</span>
          </div>
          <div class="flex flex-col items-end">
            <span class="text-xs font-bold text-primary">${myItem.examHighScore}分</span>
            <span class="text-[9px] text-primary">高分记录</span>
          </div>
        </div>
      `;
      container.appendChild(floatingBar);
    }
  } catch (err) {
    listContainer.innerHTML = `
      <div class="glass-panel rounded-2xl p-8 text-center space-y-4 bg-white/40 dark:bg-slate-900/40">
        <div class="text-4xl text-rose-500">✕</div>
        <h2 class="text-lg font-bold text-on-surface">加载失败</h2>
        <p class="text-sm text-outline">连接超时，请重新加载榜单！</p>
        <button class="btn btn-primary" onclick="renderMobileLeaderboard(document.getElementById('viewport'))" style="padding: 0.5rem 1.25rem; font-size: 0.85rem;">重新加载</button>
      </div>
    `;
  }
}

function renderMobileProfile(container) {
  const isLoggedIn = !!localStorage.getItem('dm_jwt_token');
  if (!isLoggedIn) {
    container.innerHTML = `
      <div class="glass-panel rounded-2xl p-8 text-center space-y-4 my-8 max-w-sm mx-auto bg-white/40 dark:bg-slate-900/40">
        <div class="text-4xl text-primary font-bold">🔒</div>
        <h2 class="text-lg font-bold text-on-surface">个人中心未激活</h2>
        <p class="text-sm text-outline">登录后可解锁个人专属详细页面，查看学习时长、高分榜记录并开启云端实时备份！</p>
        <button class="btn btn-primary" onclick="document.getElementById('login-trigger-btn').click()" style="padding: 0.65rem 1.5rem; margin-top: 0.5rem; align-self: center;">
          立即登录 / 注册
        </button>
      </div>
    `;
    return;
  }

  const answeredKeys = Object.keys(userData.answered);
  const mistakesCount = userData.wrongQuestions.length;
  const bookmarksCount = userData.bookmarks.length;
  
  const savedProfile = localStorage.getItem('dm_user_profile');
  const profile = savedProfile ? JSON.parse(savedProfile) : {};
  const username = profile.username || '同学';

  container.innerHTML = `
    <div class="space-y-6" style="animation: fadeIn 0.4s ease; padding-bottom: 100px;">
      <!-- Profile Card (Bento Style) -->
      <section class="glass-panel p-6 flex items-center gap-4 relative overflow-hidden bg-white/40 dark:bg-slate-900/40">
        <div class="absolute -top-10 -right-10 w-24 h-24 bg-primary/10 rounded-full blur-2xl z-0"></div>
        <div class="relative z-10 w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary text-white flex items-center justify-center font-bold text-2xl shadow-md border-2 border-white shrink-0">
          ${username[0].toUpperCase()}
        </div>
        <div class="relative z-10 flex flex-col">
          <h2 class="text-lg font-bold text-on-surface">${username}</h2>
          <div class="flex items-center gap-1.5 text-xs text-outline mt-1.5 font-semibold">
            <span class="material-symbols-outlined text-xs">calendar_today</span>
            <span>注册时间：2026-06</span>
          </div>
          <div class="flex items-center gap-1 text-xs text-primary mt-1 font-bold">
            <span class="material-symbols-outlined text-xs" style="font-variation-settings: 'FILL' 1;">cloud_done</span>
            <span>云端同步状态：已同步</span>
          </div>
        </div>
      </section>

      <!-- Archive Library Grid -->
      <section class="grid grid-cols-2 gap-4">
        <!-- Mistakes Book -->
        <button class="glass-panel glass-panel-interactive p-4 flex flex-col justify-between text-left hover:border-red-500/30 transition-all cursor-pointer border-none bg-white/40 dark:bg-slate-900/40" id="mob-profile-mistakes">
          <div class="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center text-red-600 mb-4 shrink-0">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">error</span>
          </div>
          <div class="space-y-1">
            <h3 class="text-xs font-bold text-on-surface">我的错题本 🔴</h3>
            <p class="text-[10px] text-outline">复习易错概念</p>
          </div>
          <div class="flex justify-between items-center w-full mt-4">
            <span class="text-base font-bold text-red-600">${mistakesCount}</span>
            <span class="material-symbols-outlined text-sm text-outline">chevron_right</span>
          </div>
        </button>

        <!-- Favorites -->
        <button class="glass-panel glass-panel-interactive p-4 flex flex-col justify-between text-left hover:border-yellow-500/30 transition-all cursor-pointer border-none bg-white/40 dark:bg-slate-900/40" id="mob-profile-favorites">
          <div class="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-950/30 flex items-center justify-center text-yellow-600 mb-4 shrink-0">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">star</span>
          </div>
          <div class="space-y-1">
            <h3 class="text-xs font-bold text-on-surface">我的收藏夹 ⭐️</h3>
            <p class="text-[10px] text-outline">精选经典题型</p>
          </div>
          <div class="flex justify-between items-center w-full mt-4">
            <span class="text-base font-bold text-yellow-600">${bookmarksCount}</span>
            <span class="material-symbols-outlined text-sm text-outline">chevron_right</span>
          </div>
        </button>
      </section>

      <!-- Data Management Settings -->
      <section class="glass-panel overflow-hidden bg-white/40 dark:bg-slate-900/40 mb-6">
        <div class="px-5 py-3 border-b border-slate-200/50 dark:border-slate-800/50">
          <h3 class="text-xs font-bold text-outline tracking-wider">数据管理</h3>
        </div>
        <div class="flex flex-col">
          <!-- Reset Answered (Keep stats) -->
          <button class="flex items-center justify-between p-4 border-b border-slate-200/30 dark:border-slate-800/30 hover:bg-slate-100/30 transition-colors text-left group bg-transparent border-none cursor-pointer" id="mob-btn-reset-answered">
            <div class="flex items-center gap-3 text-on-surface text-sm">
              <span class="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-lg">history</span>
              <span>清空刷题历史（保留统计数据）</span>
            </div>
            <span class="material-symbols-outlined text-outline text-sm">chevron_right</span>
          </button>
          <!-- Reset Wrong Questions -->
          <button class="flex items-center justify-between p-4 border-b border-slate-200/30 dark:border-slate-800/30 hover:bg-slate-100/30 transition-colors text-left group bg-transparent border-none cursor-pointer" id="mob-btn-reset-wrong">
            <div class="flex items-center gap-3 text-on-surface text-sm">
              <span class="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-lg">delete_sweep</span>
              <span>清空错题本</span>
            </div>
            <span class="material-symbols-outlined text-outline text-sm">chevron_right</span>
          </button>
          <!-- Reset Bookmarks -->
          <button class="flex items-center justify-between p-4 hover:bg-slate-100/30 transition-colors text-left group bg-transparent border-none cursor-pointer" id="mob-btn-reset-bookmarks">
            <div class="flex items-center gap-3 text-on-surface text-sm">
              <span class="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-lg">bookmark_remove</span>
              <span>清空收藏夹</span>
            </div>
            <span class="material-symbols-outlined text-outline text-sm">chevron_right</span>
          </button>
        </div>
      </section>

      <!-- Advanced Settings List -->
      <section class="glass-panel overflow-hidden bg-white/40 dark:bg-slate-900/40">
        <div class="px-5 py-3 border-b border-slate-200/50 dark:border-slate-800/50">
          <h3 class="text-xs font-bold text-outline tracking-wider">高级设置</h3>
        </div>
        <div class="flex flex-col">
          <!-- Sync -->
          <button class="flex items-center justify-between p-4 border-b border-slate-200/30 dark:border-slate-800/30 hover:bg-slate-100/30 transition-colors text-left group bg-transparent border-none cursor-pointer" id="mob-btn-sync">
            <div class="flex items-center gap-3 text-on-surface text-sm">
              <span class="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-lg">sync</span>
              <span>云端进度手动强制同步</span>
            </div>
            <span class="material-symbols-outlined text-outline text-sm">chevron_right</span>
          </button>
          <!-- Cloudflare -->
          <button class="flex items-center justify-between p-4 border-b border-slate-200/30 dark:border-slate-800/30 hover:bg-slate-100/30 transition-colors text-left group bg-transparent border-none cursor-pointer" id="mob-btn-cf">
            <div class="flex items-center gap-3 text-on-surface text-sm">
              <span class="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-lg">api</span>
              <span>管理 Cloudflare 开发者凭证</span>
            </div>
            <span class="material-symbols-outlined text-outline text-sm">chevron_right</span>
          </button>
          <!-- Admin Control Button (Show only if admin) -->
          ${getCurrentUserRole() === 'admin' ? `
          <button class="flex items-center justify-between p-4 border-b border-slate-200/30 dark:border-slate-800/30 hover:bg-slate-100/30 transition-colors text-left group bg-transparent border-none cursor-pointer" id="mob-btn-admin">
            <div class="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 text-sm font-bold">
              <span class="material-symbols-outlined text-indigo-500 text-lg">settings</span>
              <span>进入管理员后台面板</span>
            </div>
            <span class="material-symbols-outlined text-indigo-500 text-sm">chevron_right</span>
          </button>
          ` : ''}
          <!-- Logout -->
          <button class="flex items-center justify-between p-4 border-b border-slate-200/30 dark:border-slate-800/30 hover:bg-slate-100/30 transition-colors text-left group bg-transparent border-none cursor-pointer" id="mob-btn-logout">
            <div class="flex items-center gap-3 text-on-surface text-sm">
              <span class="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-lg">logout</span>
              <span>退出登录</span>
            </div>
            <span class="material-symbols-outlined text-outline text-sm">chevron_right</span>
          </button>
          <!-- Danger Zone -->
          <button class="flex items-center justify-between p-4 hover:bg-red-50/20 dark:hover:bg-red-950/20 transition-colors text-left group bg-transparent border-none cursor-pointer" id="mob-btn-wipe">
            <div class="flex items-center gap-3 text-red-600 text-sm">
              <span class="material-symbols-outlined text-red-500 text-lg">delete_forever</span>
              <span class="font-medium">注销并永久抹除账户</span>
            </div>
            <span class="material-symbols-outlined text-red-500/70 text-sm">chevron_right</span>
          </button>
        </div>
      </section>
    </div>
  `;

  // Bind Actions
  container.querySelector('#mob-profile-mistakes').onclick = () => {
    currentCategory = 'wrong_questions';
    currentMobileTab = 'category';
    currentQuestionIndex = 0;
    renderViewport();
  };
  container.querySelector('#mob-profile-favorites').onclick = () => {
    currentCategory = 'bookmarks';
    currentMobileTab = 'category';
    currentQuestionIndex = 0;
    renderViewport();
  };

  container.querySelector('#mob-btn-sync').onclick = () => {
    const desktopSyncBtn = document.getElementById('sync-trigger-btn');
    if (desktopSyncBtn) desktopSyncBtn.click();
  };

  container.querySelector('#mob-btn-cf').onclick = () => {
    currentMobileTab = 'quota_details';
    renderViewport();
  };

  const mobBtnAdmin = container.querySelector('#mob-btn-admin');
  if (mobBtnAdmin) {
    mobBtnAdmin.onclick = () => {
      currentCategory = 'admin';
      currentMobileTab = 'admin';
      renderViewport();
    };
  }

  container.querySelector('#mob-btn-logout').onclick = () => {
    logout();
  };

  // Data Cleansers
  container.querySelector('#mob-btn-reset-answered').onclick = () => {
    if (confirm('⚠️ 警告：是否确定要清空您所有的刷题与答题记录？（此操作将保留打卡天数和模考成绩等个人统计数据）该操作无法撤销！如果已登录，云端备份也将同步清空。')) {
      userData.answered = {};
      saveUserData(true);
      showToast('刷题历史记录已成功清空！', 'success');
      currentQuestionIndex = 0;
      renderViewport();
    }
  };

  container.querySelector('#mob-btn-reset-wrong').onclick = () => {
    if (confirm('⚠️ 警告：是否确定要清空您的整个错题本？此操作将无法撤销！如果已登录，云端记录也将同步清空。')) {
      userData.wrongQuestions = [];
      saveUserData(true);
      showToast('错题本已成功清空！', 'success');
      currentQuestionIndex = 0;
      renderViewport();
    }
  };

  container.querySelector('#mob-btn-reset-bookmarks').onclick = () => {
    if (confirm('⚠️ 警告：是否确定要清空收藏夹中的所有题目？此操作将无法撤销！如果已登录，云端收藏夹也将同步清空。')) {
      userData.bookmarks = [];
      saveUserData(true);
      showToast('收藏夹已成功清空！', 'success');
      currentQuestionIndex = 0;
      renderViewport();
    }
  };

  // Account Deletion
  container.querySelector('#mob-btn-wipe').onclick = async () => {
    const firstConfirm = confirm('⚠️ 警告：您正在请求注销该离散数学刷题账户！\n\n注销后：\n1. 您的用户名与账户将被立即注销释放。\n2. 您的云端刷题进度、打卡天数和错题藏书将被永久彻底抹除。\n\n您确定要继续吗？');
    if (!firstConfirm) return;
    
    const secondConfirm = confirm('⚠️ 再次确认：此操作不可撤销，云端数据将彻底被粉碎！\n\n您真的确定要彻底注销此账号吗？');
    if (!secondConfirm) return;
    
    const token = localStorage.getItem('dm_jwt_token');
    if (!token) {
      showToast('未检测到登录凭证，无法注销云端账号！', 'error');
      return;
    }
    
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
        userData.wrongQuestions = [];
        userData.streak = 0;
        userData.lastStudyDate = "";
        userData.examHistory = [];
        userData.examHighScore = 0;
        saveUserData();
        
        showToast('账号注销成功，所有本地及云端数据已彻底擦除！', 'success');
        currentMobileTab = 'lobby';
        renderViewport();
      } else {
        showToast(result.error || '注销失败，请重试！', 'error');
      }
    } catch (err) {
      showToast('服务器连接失败，请稍后重试！', 'error');
    }
  };
}

// Mobile stepper helper functions
window.decrementVal = function(id, min = 0) {
  const el = document.getElementById(id);
  if (el) {
    let val = parseInt(el.value) || 0;
    if (val > min) {
      el.value = val - 1;
      el.dispatchEvent(new Event('change'));
      if (window.updateMobileExamTotalCount) window.updateMobileExamTotalCount();
    }
  }
};
window.incrementVal = function(id) {
  const el = document.getElementById(id);
  if (el) {
    const max = parseInt(el.getAttribute('max')) || 10;
    let val = parseInt(el.value) || 0;
    if (val < max) {
      el.value = val + 1;
      el.dispatchEvent(new Event('change'));
      if (window.updateMobileExamTotalCount) window.updateMobileExamTotalCount();
    }
  }
};
window.updateMobileExamTotalCount = function() {
  const cntJudg = parseInt(document.getElementById('mob-cnt-judgment').value) || 0;
  const cntChoi = parseInt(document.getElementById('mob-cnt-choice').value) || 0;
  const cntBlan = parseInt(document.getElementById('mob-cnt-blank').value) || 0;
  const cntSubj = parseInt(document.getElementById('mob-cnt-subjective').value) || 0;
  const total = cntJudg + cntChoi + cntBlan + cntSubj;
  
  const badge = document.getElementById('mob-exam-total-badge');
  if (badge) {
    badge.innerText = `已选 ${total} 题 (共 ${total * 10} 分)`;
  }
};
window.updateMobileExamMaxLimits = function() {
  const topicSelect = document.getElementById('mob-exam-topic');
  if (!topicSelect) return;
  const selectedTopic = topicSelect.value;
  
  let pool = QUESTIONS;
  if (selectedTopic !== 'all') {
    pool = QUESTIONS.filter(q => q.topic === selectedTopic);
  }
  
  const maxJudg = pool.filter(q => q.category === 'judgment').length;
  const maxChoi = pool.filter(q => q.category === 'single_choice').length;
  const maxBlan = pool.filter(q => q.category === 'fill_blank').length;
  const maxSubj = pool.filter(q => ['calculation', 'proof', 'application'].includes(q.category)).length;
  
  const elJudg = document.getElementById('mob-cnt-judgment');
  const elChoi = document.getElementById('mob-cnt-choice');
  const elBlan = document.getElementById('mob-cnt-blank');
  const elSubj = document.getElementById('mob-cnt-subjective');
  
  if (elJudg) {
    elJudg.setAttribute('max', maxJudg);
    if (parseInt(elJudg.value) > maxJudg) {
      elJudg.value = maxJudg;
      elJudg.dispatchEvent(new Event('change'));
    }
  }
  if (elChoi) {
    elChoi.setAttribute('max', maxChoi);
    if (parseInt(elChoi.value) > maxChoi) {
      elChoi.value = maxChoi;
      elChoi.dispatchEvent(new Event('change'));
    }
  }
  if (elBlan) {
    elBlan.setAttribute('max', maxBlan);
    if (parseInt(elBlan.value) > maxBlan) {
      elBlan.value = maxBlan;
      elBlan.dispatchEvent(new Event('change'));
    }
  }
  if (elSubj) {
    elSubj.setAttribute('max', maxSubj);
    if (parseInt(elSubj.value) > maxSubj) {
      elSubj.value = maxSubj;
      elSubj.dispatchEvent(new Event('change'));
    }
  }
  
  if (window.updateMobileExamTotalCount) window.updateMobileExamTotalCount();
};


function renderMobileExam(container) {
  const isLoggedIn = !!localStorage.getItem('dm_jwt_token');
  if (!isLoggedIn) {
    container.innerHTML = `
      <div class="glass-panel rounded-2xl p-8 text-center space-y-4 my-8 max-w-sm mx-auto bg-white/40 dark:bg-slate-900/40">
        <div class="text-4xl text-primary font-bold">🔒</div>
        <h2 class="text-lg font-bold text-on-surface">模拟考试功能已锁定</h2>
        <p class="text-sm text-outline">模拟考试需要登录账号以保存考试成绩高分榜、记录错题库并计算答题正确率。</p>
        <button class="btn btn-primary" onclick="document.getElementById('login-trigger-btn').click()" style="padding: 0.65rem 1.5rem; margin-top: 0.5rem; align-self: center;">
          立即登录 / 注册
        </button>
      </div>
    `;
    return;
  }

  if (!examState.isActive) {
    renderMobileExamLobby(container);
  } else {
    renderMobileExamRunner(container);
  }
}

function renderMobileExamLobby(container) {
  const examHighScore = userData.examHighScore || 0;
  
  // Calculate average score and total count
  const examLogs = userData.examLogs || [];
  const examCount = examLogs.length;
  let avgScore = 0;
  if (examCount > 0) {
    const totalScore = examLogs.reduce((sum, log) => sum + (log.score || 0), 0);
    avgScore = Math.round(totalScore / examCount);
  }

  container.innerHTML = `
    <div class="space-y-6" style="animation: fadeIn 0.4s ease; padding-bottom: 100px;">
      <div class="space-y-1">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">模拟考试</h1>
        <p class="text-xs text-outline">全真模拟环境，检测离散学习成果</p>
      </div>

      <!-- Rule Description Card (Glassmorphism) -->
      <div class="glass-panel rounded-2xl p-5 flex gap-4 items-center bg-white/40 dark:bg-slate-900/40">
        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary">
          <span class="material-symbols-outlined text-2xl" style="font-variation-settings: 'FILL' 1;">assignment</span>
        </div>
        <div class="space-y-1.5 flex-1">
          <h3 class="text-xs font-bold text-on-surface">考场规则说明</h3>
          <ul class="text-[10px] text-outline space-y-1 pl-0 list-none m-0">
            <li class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[10px] text-primary">check_circle</span>根据自定义题量，随机抽选题目组卷</li>
            <li class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[10px] text-primary">check_circle</span>满分 100 分，客观题系统自动判分</li>
            <li class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[10px] text-primary">check_circle</span>考试在设定时间内必须交卷，超时自动锁卷</li>
          </ul>
        </div>
      </div>

      <!-- History Stats Grid (Bento Grid Style) -->
      <div class="grid grid-cols-3 gap-3">
        <div class="glass-panel rounded-2xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden group bg-white/40 dark:bg-slate-900/40">
          <span class="material-symbols-outlined text-primary mb-1 text-2xl">emoji_events</span>
          <span class="text-[9px] text-outline uppercase tracking-wider mb-1">最高分</span>
          <div class="text-base font-bold text-primary">${examHighScore}<span class="text-[9px]">分</span></div>
        </div>
        <div class="glass-panel rounded-2xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden group bg-white/40 dark:bg-slate-900/40">
          <span class="material-symbols-outlined text-secondary mb-1 text-2xl">analytics</span>
          <span class="text-[9px] text-outline uppercase tracking-wider mb-1">平均分</span>
          <div class="text-base font-bold text-secondary">${avgScore}<span class="text-[9px]">分</span></div>
        </div>
        <div class="glass-panel rounded-2xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden group bg-white/40 dark:bg-slate-900/40">
          <span class="material-symbols-outlined text-slate-500 mb-1 text-2xl">history</span>
          <span class="text-[9px] text-outline uppercase tracking-wider mb-1">考试次数</span>
          <div class="text-base font-bold text-slate-700 dark:text-slate-300">${examCount}<span class="text-[9px]">次</span></div>
        </div>
      </div>

      <!-- Custom Settings Card -->
      <div class="glass-panel rounded-2xl p-5 space-y-4 bg-white/40 dark:bg-slate-900/40">
        <h3 class="text-xs font-bold text-on-surface flex items-center gap-1.5">
          <span class="material-symbols-outlined text-primary text-sm">settings</span>自定义考卷配置
        </h3>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-outline">知识考察范围</label>
            <select id="mob-exam-topic" class="w-full text-xs font-semibold text-on-surface bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none">
              <option value="all">全部知识范围</option>
              <option value="propositional_logic">仅命题逻辑</option>
              <option value="predicate_logic">仅谓词逻辑</option>
            </select>
          </div>
          
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-outline">答题限时</label>
            <select id="mob-exam-time" class="w-full text-xs font-semibold text-on-surface bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none">
              <option value="900">15 分钟</option>
              <option value="1800" selected>30 分钟</option>
              <option value="2700">45 分钟</option>
              <option value="3600">60 分钟</option>
              <option value="0">不限时</option>
            </select>
          </div>
        </div>

        <div class="space-y-2 pt-2 border-t border-slate-200/20">
          <div class="flex justify-between items-center mb-1">
            <h4 class="text-[10px] font-bold text-outline uppercase m-0">题型数量配置 (每题 10 分)</h4>
            <span class="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full font-sans" id="mob-exam-total-badge">已选 10 题 (共 100 分)</span>
          </div>
          
          <div class="grid grid-cols-2 gap-3">
            <!-- Stepper 1 -->
            <div class="flex flex-col gap-1 items-center bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-200/30">
              <span class="text-xs text-outline font-bold">判断题</span>
              <div class="flex items-center justify-between w-full mt-2 bg-white/30 dark:bg-slate-900/30 rounded-xl p-1 border border-slate-200/10">
                <button type="button" class="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-slate-700/80 flex items-center justify-center border-none text-slate-800 dark:text-white font-bold cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-650 active:scale-95 transition-all select-none text-sm" onclick="decrementVal('mob-cnt-judgment', 0)">−</button>
                <input type="number" id="mob-cnt-judgment" value="5" min="0" max="15" class="w-12 text-center text-sm font-extrabold bg-transparent border-none focus:outline-none p-0 text-slate-850 dark:text-slate-100" readonly>
                <button type="button" class="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-slate-700/80 flex items-center justify-center border-none text-slate-800 dark:text-white font-bold cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-650 active:scale-95 transition-all select-none text-sm" onclick="incrementVal('mob-cnt-judgment', 15)">+</button>
              </div>
            </div>

            <!-- Stepper 2 -->
            <div class="flex flex-col gap-1 items-center bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-200/30">
              <span class="text-xs text-outline font-bold">单选题</span>
              <div class="flex items-center justify-between w-full mt-2 bg-white/30 dark:bg-slate-900/30 rounded-xl p-1 border border-slate-200/10">
                <button type="button" class="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-slate-700/80 flex items-center justify-center border-none text-slate-800 dark:text-white font-bold cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-650 active:scale-95 transition-all select-none text-sm" onclick="decrementVal('mob-cnt-choice', 0)">−</button>
                <input type="number" id="mob-cnt-choice" value="3" min="0" max="15" class="w-12 text-center text-sm font-extrabold bg-transparent border-none focus:outline-none p-0 text-slate-850 dark:text-slate-100" readonly>
                <button type="button" class="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-slate-700/80 flex items-center justify-center border-none text-slate-800 dark:text-white font-bold cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-650 active:scale-95 transition-all select-none text-sm" onclick="incrementVal('mob-cnt-choice', 15)">+</button>
              </div>
            </div>

            <!-- Stepper 3 -->
            <div class="flex flex-col gap-1 items-center bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-200/30">
              <span class="text-xs text-outline font-bold">填空题</span>
              <div class="flex items-center justify-between w-full mt-2 bg-white/30 dark:bg-slate-900/30 rounded-xl p-1 border border-slate-200/10">
                <button type="button" class="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-slate-700/80 flex items-center justify-center border-none text-slate-800 dark:text-white font-bold cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-650 active:scale-95 transition-all select-none text-sm" onclick="decrementVal('mob-cnt-blank', 0)">−</button>
                <input type="number" id="mob-cnt-blank" value="2" min="0" max="15" class="w-12 text-center text-sm font-extrabold bg-transparent border-none focus:outline-none p-0 text-slate-850 dark:text-slate-100" readonly>
                <button type="button" class="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-slate-700/80 flex items-center justify-center border-none text-slate-800 dark:text-white font-bold cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-650 active:scale-95 transition-all select-none text-sm" onclick="incrementVal('mob-cnt-blank', 15)">+</button>
              </div>
            </div>

            <!-- Stepper 4 -->
            <div class="flex flex-col gap-1 items-center bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-200/30">
              <span class="text-xs text-outline font-bold">主观题</span>
              <div class="flex items-center justify-between w-full mt-2 bg-white/30 dark:bg-slate-900/30 rounded-xl p-1 border border-slate-200/10">
                <button type="button" class="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-slate-700/80 flex items-center justify-center border-none text-slate-800 dark:text-white font-bold cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-650 active:scale-95 transition-all select-none text-sm" onclick="decrementVal('mob-cnt-subjective', 0)">−</button>
                <input type="number" id="mob-cnt-subjective" value="0" min="0" max="10" class="w-12 text-center text-sm font-extrabold bg-transparent border-none focus:outline-none p-0 text-slate-850 dark:text-slate-100" readonly>
                <button type="button" class="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-slate-700/80 flex items-center justify-center border-none text-slate-800 dark:text-white font-bold cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-650 active:scale-95 transition-all select-none text-sm" onclick="incrementVal('mob-cnt-subjective', 10)">+</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Start Button -->
      <div class="flex justify-center pt-2">
        <button class="bg-primary text-on-primary font-headline-sm text-sm py-4 px-12 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-3 w-full justify-center border-none cursor-pointer font-bold uppercase tracking-wider active:scale-[0.98]" id="mob-start-exam-btn">
          <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
          开始组卷并考试
        </button>
      </div>
    </div>
  `;

  // Start exam listener
  container.querySelector('#mob-start-exam-btn').onclick = () => {
    // Read selections
    const topic = container.querySelector('#mob-exam-topic').value;
    const timeLimit = parseInt(container.querySelector('#mob-exam-time').value);
    const cntJudg = parseInt(container.querySelector('#mob-cnt-judgment').value) || 0;
    const cntChoi = parseInt(container.querySelector('#mob-cnt-choice').value) || 0;
    const cntBlan = parseInt(container.querySelector('#mob-cnt-blank').value) || 0;
    const cntSubj = parseInt(container.querySelector('#mob-cnt-subjective').value) || 0;

    const totalQuestions = cntJudg + cntChoi + cntBlan + cntSubj;
    if (totalQuestions <= 0) {
      showToast('试卷总题目数不能为 0！', 'warning');
      return;
    }

    // Call internal build exam
    buildCustomExam(topic, timeLimit, cntJudg, cntChoi, cntBlan, cntSubj);
  };
  
  // Bind change handler on topic selection to dynamically update limits
  container.querySelector('#mob-exam-topic').onchange = () => {
    window.updateMobileExamMaxLimits();
  };

  // Initialize limits and total count displays
  window.updateMobileExamMaxLimits();
}

function renderMobileExamRunner(container) {
  if (examState.completed) {
    renderMobileExamResults(container);
    return;
  }

  const q = examState.questions[currentQuestionIndex];
  let catBadgeName = '';
  switch(q.category) {
    case 'judgment': catBadgeName = '判断题'; break;
    case 'single_choice': catBadgeName = '单选题'; break;
    case 'fill_blank': catBadgeName = '填空题'; break;
    case 'calculation': catBadgeName = '计算题'; break;
    case 'proof': catBadgeName = '证明题'; break;
    case 'application': catBadgeName = '应用题'; break;
  }

  // Answer state
  const userAns = examState.answers[currentQuestionIndex] || '';

  // Get total progress percentage
  const answeredCount = Object.keys(examState.answers).filter(k => examState.answers[k] !== undefined && examState.answers[k] !== '').length;
  const pct = Math.round((answeredCount / examState.questions.length) * 100);

  container.innerHTML = `
    <div class="space-y-6" style="animation: fadeIn 0.4s ease; padding-bottom: 120px;">
      <!-- Progress row -->
      <section class="glass-panel rounded-2xl p-4 flex justify-between items-center gap-4 bg-white/40 dark:bg-slate-900/40">
        <div class="flex-1 space-y-1">
          <div class="flex justify-between items-center text-[10px] text-outline font-bold">
            <span>答题进度</span>
            <span>已答 ${answeredCount} / ${examState.questions.length} 题 (${pct}%)</span>
          </div>
          <div class="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div class="bg-primary h-full rounded-full transition-all" style="width: ${pct}%"></div>
          </div>
        </div>
        <button class="bg-rose-100 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-bold px-4 py-2 rounded-xl border-none cursor-pointer shrink-0 hover:bg-rose-200" id="mob-submit-exam-trigger">交卷</button>
      </section>

      <!-- Question Card -->
      <section class="glass-panel rounded-2xl p-5 relative overflow-hidden bg-white/40 dark:bg-slate-900/40">
        <div class="absolute top-0 left-0 w-1 h-full bg-primary"></div>
        <div class="flex gap-2 mb-3 items-center">
          <span class="bg-primary/10 text-primary px-3 py-1 rounded-full font-label-md text-xs font-bold">${catBadgeName}</span>
          <button class="btn btn-outline" id="mob-exam-call-ai-btn" style="padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-color: var(--primary); color: var(--primary); display: flex; align-items: center; gap: 0.2rem; border-radius: 12px; cursor: pointer; background: transparent; transition: all 0.2s;">
            🤖 问问助教
          </button>
          <span class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full font-label-md text-xs font-bold ml-auto">考题号: ${currentQuestionIndex + 1}</span>
        </div>
        <div class="font-math-display text-sm text-on-surface leading-relaxed space-y-4">
          ${renderContent(q.question)}
        </div>
      </section>

      <!-- Interactive Area -->
      <section class="space-y-3" id="mob-exam-interactive">
        <!-- Input Widgets -->
      </section>
      
      <!-- Bottom Control Bar -->
      <div class="fixed bottom-0 left-0 w-full glass-panel border-t border-white/40 p-4 flex justify-between items-center gap-4 z-40 pb-[env(safe-area-inset-bottom,20px)] md:hidden bg-white/70 dark:bg-slate-900/70">
        <button class="flex-1 py-3 px-4 rounded-xl border border-transparent text-slate-700 dark:text-slate-300 font-headline-sm text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-all min-h-[48px] bg-white/60 dark:bg-slate-900/60 cursor-pointer flex items-center justify-center" id="mob-exam-prev" ${currentQuestionIndex === 0 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}>
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          上一题
        </button>
        <button class="flex-1 py-3 px-4 rounded-xl bg-indigo-50/70 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-headline-sm text-xs hover:bg-indigo-100/70 transition-colors shadow-sm min-h-[48px] border border-indigo-100 dark:border-indigo-900 cursor-pointer font-bold" id="mob-exam-card-btn">
          答题卡
        </button>
        <button class="flex-1 py-3 px-4 rounded-xl border border-transparent text-slate-700 dark:text-slate-300 font-headline-sm text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-all min-h-[48px] bg-white/60 dark:bg-slate-900/60 cursor-pointer flex items-center justify-center" id="mob-exam-next" ${currentQuestionIndex === examState.questions.length - 1 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}>
          下一题
          <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>

      <!-- AI Assistant FAB -->
      <button class="fixed bottom-[100px] right-4 w-14 h-14 rounded-full glass-panel ai-fab-shadow flex items-center justify-center z-50 bg-white/70 dark:bg-slate-900/70 border border-primary/20 cursor-pointer animate-bounce" id="mob-exam-ai-fab">
        <span class="material-symbols-outlined text-primary text-3xl" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
      </button>

      <!-- Mobile Answer Card Overlay Sheet (Hidden by default) -->
      <div class="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[1000] hidden" id="mob-exam-overlay"></div>
      <div class="fixed bottom-0 left-0 right-0 z-[1001] glass-panel rounded-t-[24px] shadow-2xl p-5 pb-10 transition-transform duration-300 translate-y-full" id="mob-exam-sheet">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-bold text-on-surface flex items-center gap-1.5">
            <span class="material-symbols-outlined text-primary">analytics</span>答题卡状态
          </h2>
          <button class="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors border-none bg-transparent cursor-pointer text-slate-500" id="mob-exam-sheet-close">
            <span class="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
        <div class="grid grid-cols-5 gap-3 max-h-[200px] overflow-y-auto pr-1" id="mob-exam-dots-grid">
          <!-- Dots list populated dynamically -->
        </div>
        <div class="mt-6 flex gap-4 text-[10px] text-outline font-semibold border-t border-slate-200/20 pt-3">
          <div class="flex items-center gap-1.5"><div class="w-2.5 h-2.5 rounded bg-primary"></div>已填</div>
          <div class="flex items-center gap-1.5"><div class="w-2.5 h-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"></div>当前/未做</div>
        </div>
      </div>
    </div>
  `;

  renderMath(container);

  // Bind buttons
  const prevBtn = container.querySelector('#mob-exam-prev');
  const nextBtn = container.querySelector('#mob-exam-next');
  const cardBtn = container.querySelector('#mob-exam-card-btn');
  const overlay = container.querySelector('#mob-exam-overlay');
  const sheet = container.querySelector('#mob-exam-sheet');
  const sheetClose = container.querySelector('#mob-exam-sheet-close');
  const submitTrigger = container.querySelector('#mob-submit-exam-trigger');
  const aiFab = container.querySelector('#mob-exam-ai-fab');

  if (prevBtn) {
    prevBtn.onclick = () => {
      animateMobileTransition('right', () => {
        currentQuestionIndex--;
        renderViewport();
      });
    };
  }
  if (nextBtn) {
    nextBtn.onclick = () => {
      animateMobileTransition('left', () => {
        currentQuestionIndex++;
        renderViewport();
      });
    };
  }
  
  if (submitTrigger) {
    submitTrigger.onclick = () => {
      triggerExamSubmission();
    };
  }

  aiFab.onclick = () => {
    const aiToggle = document.getElementById('ai-floating-toggle');
    if (aiToggle) aiToggle.click();
  };

  const mobExamCallAi = container.querySelector('#mob-exam-call-ai-btn');
  if (mobExamCallAi) {
    mobExamCallAi.onclick = () => {
      bindQuestionToAi(q);
    };
  }

  // Toggle sheet overlay
  function openSheet() {
    overlay.classList.remove('hidden');
    sheet.classList.remove('translate-y-full');
    
    // Render sheet dots
    const dotsGrid = container.querySelector('#mob-exam-dots-grid');
    dotsGrid.innerHTML = '';
    for (let idx = 0; idx < examState.questions.length; idx++) {
      const isAns = examState.answers[idx] !== undefined && examState.answers[idx] !== '';
      const isCur = idx === currentQuestionIndex;
      let dotStyle = 'border border-slate-300 dark:border-slate-700 text-slate-500 bg-white dark:bg-slate-900';
      if (isAns) {
        dotStyle = 'bg-primary text-white border-none';
      }
      if (isCur) {
        dotStyle += ' ring-2 ring-indigo-500 ring-offset-2';
      }
      dotsGrid.innerHTML += `
        <button class="flex items-center justify-center w-10 h-10 rounded-xl font-bold text-xs cursor-pointer select-none ${dotStyle}" data-idx="${idx}">
          ${idx + 1}
        </button>
      `;
    }
    
    // Bind dot clicks
    dotsGrid.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        currentQuestionIndex = parseInt(btn.getAttribute('data-idx'));
        closeSheet();
        renderViewport();
      };
    });
  }

  function closeSheet() {
    overlay.classList.add('hidden');
    sheet.classList.add('translate-y-full');
  }

  cardBtn.onclick = openSheet;
  overlay.onclick = closeSheet;
  sheetClose.onclick = closeSheet;

  // Render question interactive details
  const interactive = container.querySelector('#mob-exam-interactive');
  if (q.category === 'judgment') {
    interactive.innerHTML = `
      <div class="judgment-wrapper">
        <button class="judgment-btn ${userAns === '对' ? 'selected-true' : ''}" id="mob-exam-true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>对 (True)</span>
        </button>
        <button class="judgment-btn ${userAns === '错' ? 'selected-true' : ''}" id="mob-exam-false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>错 (False)</span>
        </button>
      </div>
    `;

    interactive.querySelector('#mob-exam-true').onclick = () => saveMobileExamAnswer('对');
    interactive.querySelector('#mob-exam-false').onclick = () => saveMobileExamAnswer('错');

  } else if (q.category === 'single_choice') {
    let optionsHtml = '<div class="options-list">';
    q.options.forEach(opt => {
      const isSelected = userAns === opt.key;
      optionsHtml += `
        <div class="option-item ${isSelected ? 'selected' : ''}" data-key="${opt.key}">
          <div class="option-prefix">${opt.key}</div>
          <div class="option-text">${renderContent(opt.text)}</div>
        </div>
      `;
    });
    optionsHtml += '</div>';
    interactive.innerHTML = optionsHtml;
    renderMath(interactive);

    interactive.querySelectorAll('.option-item').forEach(card => {
      card.onclick = () => {
        const key = card.getAttribute('data-key');
        saveMobileExamAnswer(key);
      };
    });

  } else if (q.category === 'fill_blank') {
    const blankCount = q.answer.includes('|') ? q.answer.split('|').length : 1;
    const userAnsParts = userAns ? userAns.split('|') : [];
    
    let inputsHtml = '<div class="space-y-3 bg-white/40 dark:bg-slate-900/40 p-4 rounded-2xl glass-panel">';
    for (let i = 0; i < blankCount; i++) {
      const val = userAnsParts[i] || '';
      inputsHtml += `
        <div class="flex items-center gap-3 bg-white/50 dark:bg-slate-900/50 rounded-xl px-4 py-3 border border-slate-200/50 dark:border-slate-800/50">
          <span class="text-xs font-bold text-slate-400 shrink-0 select-none">第 ${i + 1} 空:</span>
          <input type="text" class="mob-exam-blank-sub-input flex-1 bg-transparent border-none outline-none text-sm text-slate-800 dark:text-slate-100 p-0" placeholder="请输入答案..." value="${val}">
        </div>
      `;
    }
    inputsHtml += `
        <button class="btn btn-primary w-full mt-2" id="mob-exam-blank-save">暂存答案</button>
      </div>
    `;
    interactive.innerHTML = inputsHtml;

    interactive.querySelector('#mob-exam-blank-save').onclick = () => {
      const inputs = Array.from(interactive.querySelectorAll('.mob-exam-blank-sub-input'));
      const vals = inputs.map(input => input.value.trim());
      if (vals.some(v => !v)) {
        showToast('请填满所有空格后暂存！', 'warning');
        return;
      }
      const combined = vals.join('|');
      saveMobileExamAnswer(combined);
      showToast('答案已暂存！', 'success');
    };
  } else {
    // Subjective
    interactive.innerHTML = `
      <div class="glass-panel p-4 space-y-3 bg-white/40 dark:bg-slate-900/40">
        <textarea id="mob-exam-sub-input" rows="4" class="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:border-indigo-600 focus:outline-none placeholder:text-slate-400 text-slate-900 dark:text-white" placeholder="请在这里草稿记录您的论证细节..."></textarea>
        <button class="btn btn-primary w-full" id="mob-exam-sub-save" style="margin-top:0.25rem;">暂存并保存</button>
      </div>
    `;

    const subInput = interactive.querySelector('#mob-exam-sub-input');
    subInput.value = userAns;
    interactive.querySelector('#mob-exam-sub-save').onclick = () => {
      const val = subInput.value.trim();
      saveMobileExamAnswer(val || '已解答草稿');
      showToast('草稿细节已保存！', 'success');
    };
  }

  function saveMobileExamAnswer(val) {
    examState.answers[currentQuestionIndex] = val;
    saveExamState();
    renderViewport();
  }
}

function renderMobileExamResults(container) {
  const totalScore = examState.score || 0;
  const timeUsedMins = Math.floor(examState.timeUsed / 60);
  const timeUsedSecs = examState.timeUsed % 60;
  const correctCount = examState.correctCount || 0;
  const totalCount = examState.questions.length;
  
  let scoreColorClass = 'text-primary';
  let badgeText = '学海无涯';
  if (totalScore >= 90) {
    scoreColorClass = 'text-emerald-500';
    badgeText = '离散学神 👑';
  } else if (totalScore >= 60) {
    scoreColorClass = 'text-indigo-600';
    badgeText = '及格通过 📖';
  } else {
    scoreColorClass = 'text-red-500';
    badgeText = '仍需努力 ❌';
  }

  container.innerHTML = `
    <div class="space-y-6" style="animation: fadeIn 0.4s ease; padding-bottom: 100px;">
      <div class="glass-panel p-6 text-center space-y-4 bg-white/40 dark:bg-slate-900/40">
        <h2 class="text-base font-bold text-slate-500 uppercase tracking-widest">考试已结束</h2>
        <div class="text-5xl font-extrabold ${scoreColorClass} tracking-tight">${totalScore} <span class="text-sm font-semibold">分</span></div>
        <div class="bg-indigo-50 dark:bg-indigo-950/20 text-primary dark:text-indigo-400 text-xs font-bold px-3 py-1 rounded-full w-fit mx-auto">${badgeText}</div>
      </div>

      <!-- Stats Bento row -->
      <div class="grid grid-cols-2 gap-4">
        <div class="glass-panel p-4 text-center bg-white/40 dark:bg-slate-900/40">
          <span class="material-symbols-outlined text-primary mb-1 text-2xl">timer</span>
          <p class="text-[10px] text-outline mb-1">做题用时</p>
          <p class="text-sm font-bold text-on-surface">${timeUsedMins}分${timeUsedSecs}秒</p>
        </div>
        <div class="glass-panel p-4 text-center bg-white/40 dark:bg-slate-900/40">
          <span class="material-symbols-outlined text-secondary mb-1 text-2xl">done_all</span>
          <p class="text-[10px] text-outline mb-1">答对题数</p>
          <p class="text-sm font-bold text-on-surface">${correctCount} / ${totalCount} 题</p>
        </div>
      </div>

      <!-- Bottom controls -->
      <button class="bg-primary text-on-primary font-headline-sm text-sm py-4 rounded-xl shadow-md w-full border-none cursor-pointer font-bold active:scale-[0.98]" id="mob-exam-result-close">
        返回考场主页
      </button>
    </div>
  `;

  container.querySelector('#mob-exam-result-close').onclick = () => {
    // Clear exam state
    examState.isActive = false;
    examState.completed = false;
    examState.questions = [];
    examState.answers = {};
    examState.score = 0;
    saveExamState();
    
    // Sync header timer display reset
    const mobTimer = document.getElementById('mobile-exam-timer');
    if (mobTimer) mobTimer.style.display = 'none';
    
    renderViewport();
  };
}


// ============================================================================
//                         ADMIN DASHBOARD HANDLERS
// ============================================================================

let adminActiveTab = 'users'; // 'users', 'questions', 'system'

async function renderAdminView(container) {
  const token = localStorage.getItem('dm_jwt_token');
  const role = getCurrentUserRole();
  
  if (!token || role !== 'admin') {
    container.innerHTML = `
      <div class="empty-bookmarks-card" style="max-width: 600px; text-align: center; gap: 1.25rem; margin: 2rem auto;">
        <div class="empty-icon" style="background-color: var(--error-light); color: var(--error); margin: 0 auto;">🔒</div>
        <h2>未授权访问</h2>
        <p style="color: var(--text-secondary); max-width: 420px; margin: 0 auto;">
          本区域仅面向系统管理员开放，请确认您已登录管理员账户。
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="admin-dashboard-container" style="display:flex; flex-direction:column; gap:1.5rem; animation:fadeIn 0.4s ease; padding-bottom:3rem; max-width:1000px; margin:0 auto; width:100%;">
      <!-- Tab Header Segmented Controls -->
      <div style="display:flex; background:var(--bg-secondary); padding:0.3rem; border-radius:16px; border:1px solid var(--border-color); gap:0.3rem; width:100%; box-sizing:border-box;">
        <button class="segment-btn ${adminActiveTab === 'users' ? 'active' : ''}" data-admin-tab="users" style="flex:1; border:none; padding:0.7rem; font-size:0.85rem; font-weight:700; border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:0.4rem; transition:all 0.2s;">
          👥 用户账户管理
        </button>
        <button class="segment-btn ${adminActiveTab === 'questions' ? 'active' : ''}" data-admin-tab="questions" style="flex:1; border:none; padding:0.7rem; font-size:0.85rem; font-weight:700; border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:0.4rem; transition:all 0.2s;">
          📚 题库动态配置
        </button>
        <button class="segment-btn ${adminActiveTab === 'system' ? 'active' : ''}" data-admin-tab="system" style="flex:1; border:none; padding:0.7rem; font-size:0.85rem; font-weight:700; border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:0.4rem; transition:all 0.2s;">
          ⚙️ 全局与AI设置
        </button>
      </div>

      <!-- Active Content Area -->
      <div id="admin-active-tab-content"></div>
    </div>
  `;

  // Bind Tab Click Handlers
  const tabContent = container.querySelector('#admin-active-tab-content');
  const tabs = container.querySelectorAll('[data-admin-tab]');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      adminActiveTab = tab.getAttribute('data-admin-tab');
      renderActiveAdminTab(tabContent);
    });
  });

  // Render initial active tab
  renderActiveAdminTab(tabContent);
}

async function renderActiveAdminTab(container) {
  if (adminActiveTab === 'users') {
    await renderAdminUsersTab(container);
  } else if (adminActiveTab === 'questions') {
    await renderAdminQuestionsTab(container);
  } else if (adminActiveTab === 'system') {
    await renderAdminSystemTab(container);
  }
}

// ---------------- USER MANAGEMENT TAB ----------------
async function renderAdminUsersTab(container) {
  container.innerHTML = `
    <div class="dashboard-card" style="padding:1.5rem; display:flex; flex-direction:column; gap:1.25rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
        <h3 style="margin:0; font-size:1rem; font-weight:800; color:var(--text-primary);">👥 全站注册用户画像列表</h3>
        <span style="font-size:0.75rem; color:var(--primary); background:var(--primary-light); padding:0.25rem 0.6rem; border-radius:99px; font-weight:700;" id="admin-user-count">加载中...</span>
      </div>
      <div style="position:relative; width:100%;">
        <input type="text" id="admin-user-search" placeholder="输入用户名模糊检索过滤..." style="width:100%; padding:0.75rem 1rem; border-radius:14px; border:1.5px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); outline:none; font-size:0.85rem; box-sizing:border-box;">
      </div>
      <div style="overflow-x:auto; width:100%; border-radius:14px; border:1px solid var(--border-color); background:var(--bg-card);">
        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem;">
          <thead>
            <tr style="background:var(--bg-secondary); border-bottom:1px solid var(--border-color);">
              <th style="padding:0.75rem 1rem; font-weight:700; color:var(--text-secondary);">用户名</th>
              <th style="padding:0.75rem 1rem; font-weight:700; color:var(--text-secondary);">角色身份</th>
              <th style="padding:0.75rem 1rem; font-weight:700; color:var(--text-secondary);">已答题数</th>
              <th style="padding:0.75rem 1rem; font-weight:700; color:var(--text-secondary);">答题正确率</th>
              <th style="padding:0.75rem 1rem; font-weight:700; color:var(--text-secondary);">模考最高分</th>
              <th style="padding:0.75rem 1rem; font-weight:700; color:var(--text-secondary); text-align:right;">操作动作</th>
            </tr>
          </thead>
          <tbody id="admin-users-table-body">
            <tr>
              <td colspan="6" style="padding:3rem; text-align:center; color:var(--text-muted);">正在拉取全局用户数据库信息...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  const token = localStorage.getItem('dm_jwt_token');
  let allUsers = [];

  const loadUsersList = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        allUsers = await res.json();
        const userCountEl = container.querySelector('#admin-user-count');
        if (userCountEl) {
          userCountEl.innerText = `共 ${allUsers.length} 位注册用户`;
        }
        renderUsersTable(allUsers);
      } else {
        const errData = await res.json();
        showToast(errData.error || '获取用户列表失败', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('无法连接用户管理 API！', 'error');
    }
  };

  const renderUsersTable = (users) => {
    const tbody = container.querySelector('#admin-users-table-body');
    if (!tbody) return;
    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:3rem; text-align:center; color:var(--text-muted);">暂无匹配的用户记录</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    users.forEach(user => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color)';
      
      const roleBadge = user.role === 'admin' 
        ? `<span style="background-color:#FEF3C7; color:#D97706; padding:0.15rem 0.4rem; border-radius:6px; font-size:0.7rem; font-weight:800;">管理员</span>`
        : `<span style="background-color:#E0F2FE; color:#0284C7; padding:0.15rem 0.4rem; border-radius:6px; font-size:0.7rem; font-weight:800;">学生</span>`;
      
      const accuracyText = user.answeredCount > 0 ? `${user.correctRate}%` : 'N/A';
      const examHighScoreText = user.examHighScore > 0 ? `${user.examHighScore} 分` : '暂无记录';
      
      tr.innerHTML = `
        <td style="padding:0.75rem 1rem; font-weight:700; color:var(--text-primary);">${user.username}</td>
        <td style="padding:0.75rem 1rem;">${roleBadge}</td>
        <td style="padding:0.75rem 1rem; font-weight:700;">${user.answeredCount || 0} 题</td>
        <td style="padding:0.75rem 1rem; font-weight:700; color:var(--success);">${accuracyText}</td>
        <td style="padding:0.75rem 1rem; font-weight:700; color:var(--warning);">${examHighScoreText}</td>
        <td style="padding:0.75rem 1rem; text-align:right; display:flex; gap:0.5rem; justify-content:flex-end; align-items:center;">
          <button class="btn btn-outline admin-change-role-btn" data-username="${user.username}" data-role="${user.role || 'user'}" style="padding:0.35rem 0.6rem; font-size:0.7rem; font-weight:700; cursor:pointer;">
            🔄 ${user.role === 'admin' ? '设为学生' : '设为管理员'}
          </button>
          <button class="btn btn-outline admin-delete-user-btn" data-userid="${user.userId}" data-username="${user.username}" style="padding:0.35rem 0.6rem; font-size:0.7rem; font-weight:700; color:var(--error); border-color:rgba(239,68,68,0.25); cursor:pointer;">
            🗑️ 销户
          </button>
        </td>
      `;

      // Change Role Event
      tr.querySelector('.admin-change-role-btn').onclick = async (e) => {
        const username = e.currentTarget.getAttribute('data-username');
        const currentRole = e.currentTarget.getAttribute('data-role');
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        
        if (username.toLowerCase() === 'admin' && newRole === 'user') {
          showToast('无法降低系统创始管理员 (admin) 的权限！', 'error');
          return;
        }

        if (!confirm(`确认要将用户 ${username} 的权限修改为 ${newRole === 'admin' ? '管理员' : '普通学生'} 吗？`)) {
          return;
        }

        try {
          const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ action: 'changeRole', targetUsername: username, newRole })
          });
          if (res.ok) {
            showToast('权限角色更新成功！', 'success');
            loadUsersList();
          } else {
            const errData = await res.json();
            showToast(errData.error || '修改失败', 'error');
          }
        } catch (err) {
          showToast('修改失败，网络异常', 'error');
        }
      };

      // Delete User Event
      tr.querySelector('.admin-delete-user-btn').onclick = async (e) => {
        const userId = e.currentTarget.getAttribute('data-userid');
        const username = e.currentTarget.getAttribute('data-username');
        
        if (username.toLowerCase() === 'admin') {
          showToast('禁止注销创始管理员 (admin) 账号！', 'error');
          return;
        }

        const firstConfirm = confirm(`⚠️ 警告：您正在强行销户用户 "${username}"！\n\n该操作将永久抹除其云端全部进度、做题历史、模考记录以及账号凭证。是否继续？`);
        if (!firstConfirm) return;
        const secondConfirm = confirm(`⚠️ 销户确认：用户 "${username}" 的所有数据将直接被粉碎。是否进行最终销户？`);
        if (!secondConfirm) return;

        try {
          const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ action: 'delete', targetUserId: userId, targetUsername: username })
          });
          if (res.ok) {
            showToast(`用户 ${username} 的账号已被彻底强制注销销户！`, 'success');
            loadUsersList();
          } else {
            const errData = await res.json();
            showToast(errData.error || '销户失败', 'error');
          }
        } catch (err) {
          showToast('销户失败，网络异常', 'error');
        }
      };

      tbody.appendChild(tr);
    });
  };

  // Search logic
  const searchInput = container.querySelector('#admin-user-search');
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = allUsers.filter(u => u.username.toLowerCase().includes(query));
    renderUsersTable(filtered);
  });

  // Load initially
  loadUsersList();
}

// ---------------- QUESTIONS MANAGEMENT TAB ----------------
async function renderAdminQuestionsTab(container) {
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:1.25rem;">
      <!-- Editor Container (Hidden by default) -->
      <div id="admin-q-editor-container" style="display:none;"></div>

      <!-- Markdown Import Panel (Hidden by default) -->
      <div id="admin-q-import-panel" style="display:none;"></div>

      <!-- List Wrapper (Hidden when editor/import is open) -->
      <div id="admin-q-list-wrapper" style="display:flex; flex-direction:column; gap:1.25rem;">
        <!-- Controls Bar -->
        <div class="admin-q-controls">
        <!-- Filter row: 3 columns, collapses on mobile -->
        <div class="admin-q-filter-row">
          <select id="admin-q-category-filter" style="padding:0.6rem 0.8rem; border-radius:12px; border:1.5px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.8rem; cursor:pointer; width:100%;">
            <option value="all">所有题型</option>
            <option value="judgment">判断题</option>
            <option value="single_choice">单选题</option>
            <option value="fill_blank">填空题</option>
            <option value="calculation">计算题</option>
            <option value="proof">证明题</option>
            <option value="application">应用题</option>
          </select>
          <select id="admin-q-topic-filter" style="padding:0.6rem 0.8rem; border-radius:12px; border:1.5px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.8rem; cursor:pointer; width:100%;">
            <option value="all">所有专题科目</option>
            <option value="propositional_logic">命题逻辑</option>
            <option value="predicate_logic">谓词逻辑</option>
            <option value="set_theory">集合论</option>
            <option value="binary_relations">二元关系</option>
            <option value="graph_theory">图论</option>
          </select>
          <input type="text" id="admin-q-search" class="admin-q-search" placeholder="🔍 搜索题干关键字..." style="padding:0.6rem 0.8rem; border-radius:12px; border:1.5px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.8rem; outline:none; box-sizing:border-box; width:100%;">
        </div>
        <!-- Action buttons row -->
        <div class="admin-q-action-row">
          <button class="btn btn-primary" id="admin-q-add-btn" style="padding:0.6rem 1.1rem; font-size:0.8rem; font-weight:700; border-radius:12px; cursor:pointer; flex:1; min-width:140px; display:flex; align-items:center; justify-content:center; gap:0.35rem;">
            ➕ 手动新增题目
          </button>
          <button class="btn btn-outline" id="admin-q-import-md-btn" style="padding:0.6rem 1.1rem; font-size:0.8rem; font-weight:700; border-radius:12px; cursor:pointer; flex:1; min-width:160px; display:flex; align-items:center; justify-content:center; gap:0.35rem; color:var(--primary); border-color:var(--primary);">
            📄 批量导入题目
          </button>
          <input type="file" id="admin-q-md-file-input" accept=".md,.txt" style="display:none;">
        </div>
      </div>

      <!-- Question Pool List -->
      <div class="dashboard-card" style="padding:1.5rem; display:flex; flex-direction:column; gap:1rem;">
        <h3 style="margin:0; font-size:0.95rem; font-weight:800; color:var(--text-primary);" id="admin-q-count">动态题库：加载中...</h3>
        <div style="display:flex; flex-direction:column; gap:0.75rem;" id="admin-questions-list-container"></div>
      </div>
      </div>
    </div>
  `;

  const token = localStorage.getItem('dm_jwt_token');
  const editorContainer = container.querySelector('#admin-q-editor-container');
  const listWrapper = container.querySelector('#admin-q-list-wrapper');
  const questionsListContainer = container.querySelector('#admin-questions-list-container');
  const qCountHeader = container.querySelector('#admin-q-count');
  
  const filterCat = container.querySelector('#admin-q-category-filter');
  const filterTopic = container.querySelector('#admin-q-topic-filter');
  const searchInput = container.querySelector('#admin-q-search');

  let currentPage = 1;
  const itemsPerPage = 10;

  const renderQuestionsList = () => {
    const selectedCat = filterCat.value;
    const selectedTopic = filterTopic.value;
    const query = searchInput.value.toLowerCase().trim();

    let filtered = QUESTIONS;
    if (selectedCat !== 'all') {
      if (selectedCat === 'subjective') {
        filtered = filtered.filter(q => ['calculation', 'proof', 'application'].includes(q.category));
      } else {
        filtered = filtered.filter(q => q.category === selectedCat);
      }
    }
    if (selectedTopic !== 'all') {
      filtered = filtered.filter(q => q.topic === selectedTopic);
    }
    if (query) {
      filtered = filtered.filter(q => q.question.toLowerCase().includes(query));
    }

    qCountHeader.innerText = `动态题库：共收录 ${QUESTIONS.length} 题 (已筛选展示 ${filtered.length} 题)`;

    if (filtered.length === 0) {
      questionsListContainer.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--text-muted);">暂无匹配的题目记录</div>`;
      return;
    }

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages) {
      currentPage = totalPages || 1;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = filtered.slice(startIndex, endIndex);

    questionsListContainer.innerHTML = '';
    
    // Render only the items for the current page
    pageItems.forEach((q) => {
      const qDiv = document.createElement('div');
      qDiv.className = 'admin-q-card';

      const qId = getQuestionId(q);
      const TOPIC_LABELS = {
        propositional_logic: '命题逻辑', predicate_logic: '谓词逻辑',
        set_theory: '集合论', binary_relations: '二元关系', graph_theory: '图论'
      };
      const CAT_COLORS = {
        judgment: 'background:rgba(99,102,241,0.1);color:var(--primary)',
        single_choice: 'background:rgba(245,158,11,0.1);color:#D97706',
        fill_blank: 'background:rgba(239,68,68,0.1);color:#DC2626',
        calculation: 'background:rgba(16,185,129,0.1);color:#059669',
        proof: 'background:rgba(139,92,246,0.1);color:#7C3AED',
        application: 'background:rgba(20,184,166,0.1);color:#0D9488',
      };
      
      qDiv.innerHTML = `
        <div class="admin-q-card-header">
          <div class="admin-q-badges">
            <span style="${CAT_COLORS[q.category] || 'background:var(--bg-secondary);color:var(--text-secondary)'}; padding:0.15rem 0.45rem; border-radius:6px;">${q.category}</span>
            <span style="background:rgba(16,185,129,0.1);color:#10B981; padding:0.15rem 0.45rem; border-radius:6px;">${TOPIC_LABELS[q.topic] || q.topic}</span>
            <span style="color:var(--text-muted); font-weight:400;">#${q.original_num}</span>
          </div>
          <div class="admin-q-actions">
            <button class="btn btn-outline edit-q-btn" style="padding:0.3rem 0.65rem; font-size:0.72rem; font-weight:700; cursor:pointer; border-radius:8px;">✏️ 编辑</button>
            <button class="btn btn-outline delete-q-btn" style="padding:0.3rem 0.65rem; font-size:0.72rem; font-weight:700; color:var(--error); border-color:rgba(239,68,68,0.25); cursor:pointer; border-radius:8px;">🗑️ 删除</button>
          </div>
        </div>
        <div class="latex-q-content" style="font-size:0.85rem; line-height:1.55; color:var(--text-primary);"></div>
        <div style="font-size:0.75rem; color:var(--success); font-weight:700;">答案：${q.answer || '无'}</div>
        <div class="latex-a-content" style="font-size:0.75rem; color:var(--text-secondary); line-height:1.4; border-top:1px dashed var(--border-color); padding-top:0.4rem;"></div>
      `;

      // Render math formula content safely
      qDiv.querySelector('.latex-q-content').innerHTML = marked.parse(q.question);
      qDiv.querySelector('.latex-a-content').innerHTML = `解析：` + marked.parse(q.analysis || '暂无参考解析。');
      renderMath(qDiv);

      // Edit action
      qDiv.querySelector('.edit-q-btn').onclick = () => {
        openEditor(q, false);
      };

      // Delete action
      qDiv.querySelector('.delete-q-btn').onclick = async () => {
        if (!confirm(`⚠️ 二次警告：您确定要在全站动态题库中永久删除这道序号为 #${q.original_num} 的 [${q.category}] 题目吗？`)) return;
        const qIdx = QUESTIONS.findIndex(qi => getQuestionId(qi) === qId);
        if (qIdx !== -1) {
          QUESTIONS.splice(qIdx, 1);
          await saveQuestionsToCloud();
        }
      };

      questionsListContainer.appendChild(qDiv);
    });

    // Render Pagination Controls at the bottom
    const paginationDiv = document.createElement('div');
    paginationDiv.style.display = 'flex';
    paginationDiv.style.justifyContent = 'center';
    paginationDiv.style.alignItems = 'center';
    paginationDiv.style.gap = '1.25rem';
    paginationDiv.style.marginTop = '1.25rem';
    paginationDiv.style.fontSize = '0.82rem';
    
    paginationDiv.innerHTML = `
      <button class="btn btn-outline" id="admin-q-prev-btn" ${currentPage === 1 ? 'disabled' : ''} style="padding:0.45rem 1rem; cursor:pointer; font-weight:700; border-radius:10px;">◀ 上一页</button>
      <span style="font-weight:800; color:var(--text-secondary);">第 ${currentPage} / ${totalPages || 1} 页</span>
      <button class="btn btn-outline" id="admin-q-next-btn" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:0.45rem 1rem; cursor:pointer; font-weight:700; border-radius:10px;">下一页 ▶</button>
    `;

    paginationDiv.querySelector('#admin-q-prev-btn').onclick = () => {
      currentPage--;
      renderQuestionsList();
      container.scrollIntoView({ behavior: 'smooth' });
    };

    paginationDiv.querySelector('#admin-q-next-btn').onclick = () => {
      currentPage++;
      renderQuestionsList();
      container.scrollIntoView({ behavior: 'smooth' });
    };

    questionsListContainer.appendChild(paginationDiv);
  };

  const openEditor = (q, isNew = false) => {
    if (listWrapper) listWrapper.style.display = 'none';
    editorContainer.style.display = 'block';
    editorContainer.scrollIntoView({ behavior: 'smooth' });

    editorContainer.innerHTML = `
      <div class="dashboard-card" style="padding:1.5rem; display:flex; flex-direction:column; gap:1.25rem; border:2.5px solid var(--primary); background:var(--bg-card); width:100%; box-sizing:border-box;">
        <div style="display:flex; align-items:center; gap:0.5rem; border-bottom: 1.5px solid var(--border-color); padding-bottom:0.75rem; width:100%;">
          <button id="edit-q-back-btn" class="btn btn-outline" style="padding:0.35rem 0.75rem; font-size:0.75rem; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:0.25rem;">
            ← 返回题库列表
          </button>
          <h3 style="margin:0; font-size:1.05rem; font-weight:800; color:var(--primary); margin-left:0.5rem;" id="editor-title">${isNew ? "➕ 新增离散数学题目" : "✏️ 编辑离散题目资料"}</h3>
        </div>
        <!-- Meta fields: responsive flex row -->
        <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
          <div style="display:flex; flex-direction:column; gap:0.35rem; flex:1; min-width:160px;">
            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">题型类别 (Category)</label>
            <select id="edit-q-category" style="padding:0.75rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; cursor:pointer; width:100%;">
              <option value="judgment" ${q.category === 'judgment' ? 'selected' : ''}>判断题</option>
              <option value="single_choice" ${q.category === 'single_choice' ? 'selected' : ''}>单选题</option>
              <option value="fill_blank" ${q.category === 'fill_blank' ? 'selected' : ''}>填空题</option>
              <option value="calculation" ${q.category === 'calculation' ? 'selected' : ''}>计算/简答题</option>
              <option value="proof" ${q.category === 'proof' ? 'selected' : ''}>证明题</option>
              <option value="application" ${q.category === 'application' ? 'selected' : ''}>应用题</option>
            </select>
          </div>
          <div style="display:flex; flex-direction:column; gap:0.35rem; flex:1; min-width:160px;">
            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">学科专题 (Topic)</label>
            <select id="edit-q-topic" style="padding:0.75rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; cursor:pointer; width:100%;">
              <option value="propositional_logic" ${q.topic === 'propositional_logic' ? 'selected' : ''}>命题逻辑</option>
              <option value="predicate_logic" ${q.topic === 'predicate_logic' ? 'selected' : ''}>谓词逻辑</option>
              <option value="set_theory" ${q.topic === 'set_theory' ? 'selected' : ''}>集合论</option>
              <option value="binary_relations" ${q.topic === 'binary_relations' ? 'selected' : ''}>二元关系</option>
              <option value="graph_theory" ${q.topic === 'graph_theory' ? 'selected' : ''}>图论</option>
            </select>
          </div>
        </div>

        <!-- Main content: CSS Grid two-columns, stacks on narrow screens -->
        <div class="admin-editor-grid">
          <!-- Left: Input fields -->
          <div style="display:flex; flex-direction:column; gap:0.85rem; min-width:0;">
            <div style="display:flex; flex-direction:column; gap:0.35rem;">
              <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">题干内容 (支持 LaTeX $公式$ 包裹)</label>
              <textarea id="edit-q-text" rows="6" placeholder="例如：$p \\wedge q$ 的真值为对。（ ）" style="padding:0.75rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; font-family:monospace; outline:none; resize:vertical; box-sizing:border-box; width:100%;">${q.question || ""}</textarea>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.35rem;">
              <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">标准答案 (Answer)</label>
              <div id="edit-q-answer-wrapper">
                <input type="text" id="edit-q-answer" value="${q.answer || ""}" placeholder="例如：对 / A / $p \\vee q$" style="padding:0.75rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; box-sizing:border-box; width:100%;">
              </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.35rem;">
              <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">详细解析 (Analysis)</label>
              <textarea id="edit-q-analysis" rows="6" placeholder="请在此输入这道题目的详尽公式推算和逻辑推导过程..." style="padding:0.75rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; font-family:monospace; outline:none; resize:vertical; box-sizing:border-box; width:100%;">${q.analysis || ""}</textarea>
            </div>
          </div>

          <!-- Right: Sticky Preview Column -->
          <div class="admin-editor-preview-col">
            <label style="font-size:0.75rem; font-weight:800; color:var(--primary); display:flex; align-items:center; gap:0.25rem;">✨ 实时公式渲染预览 (LaTeX Preview)</label>
            <div style="border:1.5px solid rgba(99,102,241,0.25); border-radius:12px; padding:1rem 1.1rem; background:rgba(99,102,241,0.03); overflow-y:auto; font-size:0.85rem; min-height:300px; box-sizing:border-box;" id="edit-q-preview-box">
              <div style="font-size:0.72rem; font-weight:700; color:var(--primary); margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.05em;">题干预览</div>
              <div id="preview-question" style="line-height:1.65; margin-bottom:1.5rem; min-height:2rem;"></div>
              <div style="font-size:0.72rem; font-weight:700; color:var(--primary); margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.05em; border-top:1px dashed var(--border-color); padding-top:0.6rem;">解析预览</div>
              <div id="preview-analysis" style="line-height:1.65; color:var(--text-secondary); min-height:2rem;"></div>
            </div>
          </div>
        </div>

        <!-- Options Configuration (Only for choice) -->
        <div id="edit-q-options-wrapper" style="display:${q.category === 'single_choice' ? 'flex' : 'none'}; flex-direction:column; gap:0.65rem;">
          <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">单选题选项配置 (每行一个选项，会自动生成 A, B, C, D 前缀)</label>
          <div id="edit-q-options-list" style="display:flex; flex-direction:column; gap:0.5rem;"></div>
          <button class="btn btn-outline" id="edit-q-add-opt" style="padding:0.4rem 0.8rem; font-size:0.75rem; font-weight:700; margin-top:0.25rem; align-self:flex-start; cursor:pointer;">
            ➕ 添加选项
          </button>
        </div>

        <!-- Confirm controls -->
        <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:0.5rem;">
          <button class="btn btn-outline" id="edit-q-cancel" style="padding:0.65rem 1.25rem; font-size:0.85rem; font-weight:700; cursor:pointer;">
            取消
          </button>
          <button class="btn btn-primary" id="edit-q-save" style="padding:0.65rem 1.5rem; font-size:0.85rem; font-weight:700; cursor:pointer;">
            💾 保存题目并同步云端
          </button>
        </div>
      </div>
    `;

    const catSelect = editorContainer.querySelector('#edit-q-category');
    const optionsWrapper = editorContainer.querySelector('#edit-q-options-wrapper');
    const optionsList = editorContainer.querySelector('#edit-q-options-list');
    const answerWrapper = editorContainer.querySelector('#edit-q-answer-wrapper');

    const updateAnswerUI = () => {
      const category = catSelect.value;
      // Prefer the current live value in the DOM over the stale q.answer from closure
      const liveAnswerEl = answerWrapper.querySelector('#edit-q-answer');
      const currentAns = liveAnswerEl ? liveAnswerEl.value : (q.answer || "");

      if (category === 'judgment') {
        answerWrapper.innerHTML = `
          <select id="edit-q-answer" style="padding:0.75rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; cursor:pointer; width:100%;">
            <option value="对" ${currentAns === '对' ? 'selected' : ''}>对</option>
            <option value="错" ${currentAns === '错' ? 'selected' : ''}>错</option>
          </select>
        `;
      } else if (category === 'single_choice') {
        // Count currently rendered option rows to build the answer dropdown
        const currentOptRows = Array.from(optionsList.querySelectorAll('.edit-q-opt-input'));
        const currentOpts = currentOptRows.map((_, idx) => String.fromCharCode(65 + idx));
        if (currentOpts.length === 0) {
          currentOpts.push('A', 'B', 'C', 'D');
        }
        let optsHtml = currentOpts.map(opt => `
          <option value="${opt}" ${currentAns.toUpperCase() === opt ? 'selected' : ''}>${opt}</option>
        `).join('');
        answerWrapper.innerHTML = `
          <select id="edit-q-answer" style="padding:0.75rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; cursor:pointer; width:100%;">
            ${optsHtml}
          </select>
        `;
      } else {
        answerWrapper.innerHTML = `
          <input type="text" id="edit-q-answer" value="${currentAns}" placeholder="例如：对 / A / $p \\vee q$" style="padding:0.75rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; box-sizing:border-box; width:100%;">
        `;
      }
    };
    
    catSelect.addEventListener('change', () => {
      const newCat = catSelect.value;
      optionsWrapper.style.display = (newCat === 'single_choice') ? 'flex' : 'none';
      // When switching TO single_choice with no existing option rows, auto-fill 4 default rows
      if (newCat === 'single_choice' && optionsList.querySelectorAll('.edit-q-opt-input').length === 0) {
        renderOptionsRows(['', '', '', '']);
      }
      updateAnswerUI();
    });

    const renderOptionsRows = (opts) => {
      optionsList.innerHTML = '';
      opts.forEach((opt, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '0.5rem';
        row.style.alignItems = 'center';
        row.innerHTML = `
          <span style="font-weight:800; font-size:0.85rem; width:1.5rem;">${String.fromCharCode(65 + idx)}.</span>
          <input type="text" class="edit-q-opt-input" value="${opt}" placeholder="输入选项内容..." style="flex:1; padding:0.65rem; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; box-sizing:border-box;">
          <button class="btn btn-outline remove-opt-btn" style="color:var(--error); border-color:rgba(239,68,68,0.25); padding:0.5rem; cursor:pointer;">🗑️</button>
        `;
        row.querySelector('.remove-opt-btn').onclick = () => {
          row.remove();
          // Recalculate prefixes A, B, C...
          const rows = optionsList.querySelectorAll('div');
          rows.forEach((r, i) => {
            r.querySelector('span').innerText = `${String.fromCharCode(65 + i)}.`;
          });
          updateAnswerUI();
        };
        optionsList.appendChild(row);
      });
    };

    renderOptionsRows(q.options || []);

    editorContainer.querySelector('#edit-q-add-opt').onclick = () => {
      const currentOpts = Array.from(optionsList.querySelectorAll('.edit-q-opt-input')).map(i => i.value);
      currentOpts.push("");
      renderOptionsRows(currentOpts);
      updateAnswerUI();
    };

    // Live preview update
    const updatePreview = () => {
      const qText = editorContainer.querySelector('#edit-q-text').value;
      const aText = editorContainer.querySelector('#edit-q-analysis').value;
      editorContainer.querySelector('#preview-question').innerHTML = marked.parse(qText || "_输入题干可查看预览_");
      editorContainer.querySelector('#preview-analysis').innerHTML = marked.parse(aText || "_输入解析可查看预览_");
      renderMath(editorContainer.querySelector('#edit-q-preview-box'));
    };

    editorContainer.querySelector('#edit-q-text').addEventListener('input', updatePreview);
    editorContainer.querySelector('#edit-q-analysis').addEventListener('input', updatePreview);
    updatePreview();
    updateAnswerUI();

    // Cancel / Back to List
    const closeEditorAction = () => {
      editorContainer.style.display = 'none';
      if (listWrapper) listWrapper.style.display = 'flex';
      renderQuestionsList();
    };

    editorContainer.querySelector('#edit-q-cancel').onclick = closeEditorAction;
    const backBtn = editorContainer.querySelector('#edit-q-back-btn');
    if (backBtn) backBtn.onclick = closeEditorAction;

    // Save Question Click
    editorContainer.querySelector('#edit-q-save').onclick = async () => {
      const category = catSelect.value;
      const topic = editorContainer.querySelector('#edit-q-topic').value;
      const questionText = editorContainer.querySelector('#edit-q-text').value.trim();

      // Safely read the answer element (it's dynamically re-rendered by updateAnswerUI)
      const answerEl = answerWrapper.querySelector('#edit-q-answer');
      if (!answerEl) {
        showToast('答案组件渲染异常，请刷新后重试！', 'error');
        return;
      }
      const answer = answerEl.value.trim();
      const analysis = editorContainer.querySelector('#edit-q-analysis').value.trim();

      let options = [];
      if (category === 'single_choice') {
        options = Array.from(optionsList.querySelectorAll('.edit-q-opt-input')).map(i => i.value.trim()).filter(v => v !== '');
        if (options.length < 2) {
          showToast('单选题至少需要填写 2 个选项内容！', 'error');
          return;
        }
      }

      if (!questionText) {
        showToast('题干内容不能为空！', 'error');
        return;
      }
      if (!answer) {
        showToast('标准答案不能为空！', 'error');
        return;
      }

      if (isNew) {
        // Calculate max original_num in this category
        const inCat = QUESTIONS.filter(qi => qi.category === category);
        const nextNum = inCat.length > 0 ? Math.max(...inCat.map(qi => qi.original_num)) + 1 : 1;

        const newQObj = {
          category,
          original_num: nextNum,
          question: questionText,
          options,
          answer,
          analysis,
          topic
        };

        QUESTIONS.push(newQObj);
      } else {
        // Find existing index using the ORIGINAL category & num captured in q at edit-open time
        const origCategory = q.category;
        const origNum = q.original_num;
        const qIdx = QUESTIONS.findIndex(qi => qi.category === origCategory && qi.original_num === origNum);
        if (qIdx !== -1) {
          // If the category changed, renumber within the new category
          if (QUESTIONS[qIdx].category !== category) {
            const inNewCat = QUESTIONS.filter((qi, i) => qi.category === category && i !== qIdx);
            const nextNum = inNewCat.length > 0 ? Math.max(...inNewCat.map(qi => qi.original_num)) + 1 : 1;
            QUESTIONS[qIdx].original_num = nextNum;
          }
          QUESTIONS[qIdx].category = category;
          QUESTIONS[qIdx].question = questionText;
          QUESTIONS[qIdx].options = options;
          QUESTIONS[qIdx].answer = answer;
          QUESTIONS[qIdx].analysis = analysis;
          QUESTIONS[qIdx].topic = topic;
          // Update q reference so subsequent edits without re-opening still work
          q.category = category;
          q.original_num = QUESTIONS[qIdx].original_num;
        } else {
          showToast('未找到原题目记录，保存失败！请刷新后重试。', 'error');
          return;
        }
      }

      await saveQuestionsToCloud();
      editorContainer.style.display = 'none';
      if (listWrapper) listWrapper.style.display = 'flex';
    };
  };

  const saveQuestionsToCloud = async () => {
    try {
      const res = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'saveAll', questions: QUESTIONS })
      });
      if (res.ok) {
        showToast('全站题库已成功同步并写入云端！', 'success');
        // Reload list UI
        renderQuestionsList();
      } else {
        const errData = await res.json();
        showToast(errData.error || '保存失败', 'error');
      }
    } catch (err) {
      showToast('同步题库网络错误！', 'error');
    }
  };

  // Bind new question button
  container.querySelector('#admin-q-add-btn').onclick = () => {
    openEditor({ category: 'judgment', options: [], question: "", answer: "", analysis: "", topic: "propositional_logic" }, true);
  };

  // Bind markdown import button → open live split-screen import editor
  const mdImportBtn = container.querySelector('#admin-q-import-md-btn');
  const importPanel = container.querySelector('#admin-q-import-panel');

  mdImportBtn.onclick = () => {
    if (listWrapper) listWrapper.style.display = 'none';
    openMarkdownImportPanel(importPanel, "", saveQuestionsToCloud, renderQuestionsList);
  };

  // Bind filter events
  filterCat.onchange = () => { currentPage = 1; renderQuestionsList(); };
  filterTopic.onchange = () => { currentPage = 1; renderQuestionsList(); };
  searchInput.oninput = () => { currentPage = 1; renderQuestionsList(); };

  // Load initially
  renderQuestionsList();
}


// =================== MARKDOWN QUESTION PARSER V2 ===================
/**
 * Robust parser supporting multiple question formats:
 * - Question numbers: 1. 1、 1） （1） Q1:
 * - Section headings: # 判断题, **单选题**, etc.
 * - Options: A. A、 (A) A）
 * - Answer lines: 答案：, 【答案】, Answer:
 * - Analysis lines: 解析：, 【解析】, 分析：
 */
function parseMarkdownQuestions(text) {
  const results = [];

  const JUDGMENT_ANSWERS = new Set(['正确', '对', '错', '错误', '√', '×', 'true', 'false', 'yes', 'no']);

  const typeMap = {
    '单选题': 'single_choice', '多选题': 'single_choice',
    '判断题': 'judgment', '判断': 'judgment',
    '填空题': 'fill_blank', '单空填空题': 'fill_blank',
    '简答题': 'calculation', '计算题': 'calculation', '简答/计算题': 'calculation',
    '证明题': 'proof', '应用题': 'application', '综合题': 'application',
  };

  // Normalize line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Flexible question-start patterns
  const qStartPatterns = [
    /^（(\d+)）\s*(.*)/,          // （1）题目
    /^\((\d+)\)\s*(.*)/,           // (1) 题目
    /^Q(\d+)[:.：]\s*(.*)/i,       // Q1: 题目
    /^(\d+)[.．、)）]\s*(.*)/,     // 1. 1、 1) 题目
  ];

  // Flexible option patterns
  const optionPatterns = [
    /^（([A-Ea-e])）\s*(.*)/,       // （A）选项
    /^\(([A-Ea-e])\)\s*(.*)/,       // (A) 选项
    /^([A-Ea-e])[.．、)）]\s*(.*)/,  // A. A、 A) 选项
  ];

  // Answer & analysis patterns (multi-format)
  const answerPatterns = [
    /^(?:答案|【答案】|answer)[：:]\s*(.*)/i,
    /^【答案】\s*(.*)/,
    /^\[答案\]\s*(.*)/,
  ];
  const analysisPatterns = [
    /^(?:解析|【解析】|分析|解题过程)[：:]\s*(.*)/i,
    /^【解析】\s*(.*)/,
    /^\[解析\]\s*(.*)/,
  ];

  // Section heading (marks type for following questions)
  const headingRegex = /^[#*＃\s]*(?:\d+[.、）)]\s*)?(单选题|多选题|判断题|判断|填空题|单空填空题|简答题|计算题|简答\/计算题|证明题|应用题|综合题)[#*＃\s]*$/i;

  const matchQStart = (line) => {
    for (const p of qStartPatterns) {
      const m = p.exec(line);
      if (m) return { num: parseInt(m[1]), rest: m[2].trim() };
    }
    return null;
  };
  const matchOption = (line) => {
    for (const p of optionPatterns) {
      const m = p.exec(line);
      if (m) return { letter: m[1].toUpperCase(), text: m[2].trim() };
    }
    return null;
  };
  const matchAnswer = (line) => {
    for (const p of answerPatterns) {
      const m = p.exec(line);
      if (m) return m[1].trim();
    }
    return null;
  };
  const matchAnalysis = (line) => {
    for (const p of analysisPatterns) {
      const m = p.exec(line);
      if (m) return m[1].trim();
    }
    return null;
  };

  // Collect question blocks
  const blocks = [];
  let currentBlock = null;
  let pendingType = 'calculation';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentBlock) { blocks.push(currentBlock); currentBlock = null; }
      continue;
    }

    // Heading check
    const hm = headingRegex.exec(trimmed);
    if (hm) {
      if (currentBlock) { blocks.push(currentBlock); currentBlock = null; }
      pendingType = typeMap[hm[1]] || 'calculation';
      continue;
    }

    // Question start
    const qm = matchQStart(trimmed);
    if (qm) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { typeHint: pendingType, lines: [trimmed] };
      continue;
    }

    if (currentBlock) currentBlock.lines.push(trimmed);
  }
  if (currentBlock) blocks.push(currentBlock);

  // Parse blocks
  for (const block of blocks) {
    const { typeHint, lines: blines } = block;
    if (!blines.length) continue;

    const qm = matchQStart(blines[0]);
    if (!qm) continue;

    let questionText = qm.rest;
    let forceCategory = typeHint;

    // Inline category markers - Detect but DO NOT strip 【填空题】 so it is preserved in the question text
    if (/【填空题】/.test(questionText)) { forceCategory = 'fill_blank'; }
    if (/【判断题】/.test(questionText)) { questionText = questionText.replace(/【判断题】/, '').trim(); forceCategory = 'judgment'; }
    if (/【单选题】/.test(questionText)) { questionText = questionText.replace(/【单选题】/, '').trim(); forceCategory = 'single_choice'; }

    const options = [];
    let answer = '';
    let analysis = '';
    let inQuestion = true;
    let inAnalysis = false;

    for (let i = 1; i < blines.length; i++) {
      const bl = blines[i].trim();

      // Answer
      const ans = matchAnswer(bl);
      if (ans !== null) { answer = ans; inQuestion = false; inAnalysis = false; continue; }

      // Analysis
      const ana = matchAnalysis(bl);
      if (ana !== null) { analysis = ana; inQuestion = false; inAnalysis = true; continue; }

      // Option
      const opt = matchOption(bl);
      if (opt) { options.push(opt.text); inQuestion = false; inAnalysis = false; continue; }

      // Continuation
      if (inQuestion) {
        questionText += '\n' + bl;
      } else if (inAnalysis) {
        analysis += '\n' + bl;
      }
    }

    if (!questionText.trim()) continue;

    // Fallback: try extracting answer from trailing parentheses in question
    if (!answer) {
      const bracketMatch = questionText.match(/（\s*([^（）\s]{1,10})\s*）\s*$/);
      if (bracketMatch) {
        answer = bracketMatch[1].trim();
        questionText = questionText.replace(/（\s*[^（）\s]{1,10}\s*）\s*$/, '').trim();
      }
    }

    if (!answer) continue; // skip if still no answer

    // Auto-detect category
    let category = forceCategory;
    if (JUDGMENT_ANSWERS.has(answer) && options.length === 0) {
      category = 'judgment';
      if (['正确', '对', '√', 'true', 'yes'].includes(answer.toLowerCase())) answer = '对';
      else if (['错误', '错', '×', 'false', 'no'].includes(answer.toLowerCase())) answer = '错';
    } else if (options.length > 0) {
      category = 'single_choice';
    }

    // Rule: 如果填空题只有一个答案 则在题号/题干前面加上 "【填空题】"
    if (category === 'fill_blank' && !answer.includes('|')) {
      if (!questionText.startsWith('【填空题】')) {
        questionText = '【填空题】' + questionText;
      }
    }

    const inCat = QUESTIONS.filter(qi => qi.category === category);
    const nextNum = inCat.length > 0 ? Math.max(...inCat.map(qi => qi.original_num)) + 1 : 1;

    results.push({
      _parsed: true,
      category,
      original_num: nextNum,
      question: questionText.trim(),
      options,
      answer,
      analysis: analysis.trim() || '',
      topic: 'propositional_logic', // default; user can change per-question
    });
  }

  return results;
}

function openMarkdownImportPanel(panelEl, initialText, saveQuestionsToCloud, renderQuestionsList) {
  const listWrapper = panelEl.parentNode.querySelector('#admin-q-list-wrapper');
  if (listWrapper) listWrapper.style.display = 'none';
  panelEl.style.display = 'block';
  panelEl.scrollIntoView({ behavior: 'smooth' });

  // Render the split-screen shell
  panelEl.innerHTML = `
    <div class="admin-import-split-grid">
      <!-- Left Pane: Batch Input Area -->
      <div class="admin-import-left-pane">
        <div class="admin-import-header-row">
          <h3 class="admin-import-pane-title">📝 批量输入框</h3>
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <button id="panel-import-file-btn" class="btn btn-outline" style="padding:0.35rem 0.75rem; font-size:0.75rem; border-radius:8px; cursor:pointer;">📁 导入文件</button>
            <button id="panel-show-example-btn" class="btn btn-outline" style="padding:0.35rem 0.75rem; font-size:0.75rem; border-radius:8px; cursor:pointer; color:var(--primary); border-color:var(--primary);">查看案例</button>
            <input type="file" id="panel-file-input" accept=".md,.txt" style="display:none;">
          </div>
        </div>
        <div class="admin-import-textarea-wrap">
          <textarea id="panel-import-textarea" class="admin-import-textarea" placeholder="在此输入或粘贴 Markdown 格式的试题..."></textarea>
        </div>
      </div>

      <!-- Right Pane: Real-time Preview Area -->
      <div class="admin-import-right-pane">
        <div class="admin-import-header-row">
          <h3 class="admin-import-pane-title">👁️ 预览题目</h3>
          <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;">
            <span style="font-size:0.75rem; color:var(--text-secondary);">错误：</span>
            <span class="admin-import-badge-red" id="panel-error-count">0</span>
            <span style="font-size:0.75rem; color:var(--text-secondary); margin-left:0.3rem;">总数：</span>
            <span class="admin-import-badge-blue" id="panel-total-count">0</span>
            <button id="panel-submit-btn" class="btn btn-primary" style="padding:0.35rem 1rem; font-size:0.75rem; border-radius:8px; cursor:pointer; margin-left:0.3rem;">提交</button>
            <button id="panel-close-btn" class="btn btn-outline" style="padding:0.35rem 0.75rem; font-size:0.75rem; border-radius:8px; cursor:pointer; color:var(--error); border-color:rgba(239,68,68,0.3);">关闭</button>
          </div>
        </div>

        <!-- Category counts bar -->
        <div class="admin-import-stats-bar" id="panel-stats-bar">
          暂无解析题目数据
        </div>

        <!-- Preview list area -->
        <div class="admin-import-list" id="panel-preview-list" style="flex:1; min-height:400px; display:flex; flex-direction:column; gap:0.75rem; overflow-y:auto; padding-right:0.25rem;">
          <!-- Questions will render here dynamically -->
        </div>
      </div>
    </div>

    <!-- Case Example Modal -->
    <div id="panel-example-modal" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.4); z-index:9999; justify-content:center; align-items:center; padding:1.5rem; box-sizing:border-box;">
      <div style="background:var(--bg-card); border-radius:16px; padding:1.5rem; max-width:650px; width:100%; max-height:85vh; display:flex; flex-direction:column; gap:1rem; box-shadow:0 10px 25px rgba(0,0,0,0.15); box-sizing:border-box;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
          <h4 style="margin:0; font-size:0.95rem; font-weight:800; color:var(--text-primary);">📝 标准试题 Markdown 模板</h4>
          <button id="panel-modal-close" style="background:transparent; border:none; font-size:1.2rem; cursor:pointer; color:var(--text-secondary);">&times;</button>
        </div>
        <div style="flex:1; overflow-y:auto; font-size:0.78rem; line-height:1.5; color:var(--text-secondary);">
          <p>请按以下示例格式编写（支持各种公式，单空填空题前面请带上【填空题】）：</p>
          <pre style="background:var(--bg-secondary); border-radius:8px; padding:0.75rem; font-family:monospace; font-size:0.74rem; overflow-x:auto; border:1px solid var(--border-color); margin:0.5rem 0; white-space:pre-wrap; word-break:break-all;">
## 单选题
1. 命题 $p \\wedge q$ 为对。驾驶人有下列哪种违法行为一次记6分？
A. 使用其他车辆行驶证
B. 饮酒后驾驶机动车
C. 车速超过规定时速50%以上
D. 违法占用应急车道行驶
答案:D
解析:请仔细阅读交规

## 判断题
1. 国际象棋起源于英国吗？
答案:对
解析:起源于印度，后传入欧洲。

## 填空题
1. 我国古典四大名著是（）（）（）（）
答案:红楼梦|水浒传|三国演义|西游记
解析:无

## 单空填空题
1. 【填空题】我国第一个社会主义国家是哪个？
答案:苏联
解析:无
          </pre>
        </div>
      </div>
    </div>
  `;

  // Get elements
  const textarea = panelEl.querySelector('#panel-import-textarea');
  const errorCountBadge = panelEl.querySelector('#panel-error-count');
  const totalCountBadge = panelEl.querySelector('#panel-total-count');
  const statsBar = panelEl.querySelector('#panel-stats-bar');
  const previewList = panelEl.querySelector('#panel-preview-list');
  const submitBtn = panelEl.querySelector('#panel-submit-btn');
  const closeBtn = panelEl.querySelector('#panel-close-btn');

  const importFileBtn = panelEl.querySelector('#panel-import-file-btn');
  const fileInput = panelEl.querySelector('#panel-file-input');
  const showExampleBtn = panelEl.querySelector('#panel-show-example-btn');
  const exampleModal = panelEl.querySelector('#panel-example-modal');
  const modalCloseBtn = panelEl.querySelector('#panel-modal-close');

  const TOPIC_OPTIONS = [
    { value: 'propositional_logic', label: '命题逻辑' },
    { value: 'predicate_logic', label: '谓词逻辑' },
    { value: 'set_theory', label: '集合论' },
    { value: 'binary_relations', label: '二元关系' },
    { value: 'graph_theory', label: '图论' },
  ];

  const CAT_LABELS = {
    judgment: '判断题',
    single_choice: '单选题',
    fill_blank: '填空题',
    calculation: '计算/简答题',
    proof: '证明题',
    application: '应用题'
  };

  let currentlyParsed = [];
  let editingIndices = new Set();

  // Live parsing implementation
  const runLiveParse = () => {
    const text = textarea.value;
    const parsed = parseMarkdownQuestions(text);
    currentlyParsed = parsed;
    editingIndices.clear(); // Reset editing state on new import text input
    updateCountsAndPreview();
  };

  const updateCountsAndPreview = () => {
    // 1. Calculate categories and errors
    const counts = { judgment: 0, single_choice: 0, fill_blank: 0, calculation: 0, proof: 0, application: 0 };
    let errors = 0;

    currentlyParsed.forEach(q => {
      if (counts[q.category] !== undefined) {
        counts[q.category]++;
      }
      if (!q.question.trim() || !q.answer.trim()) {
        errors++;
      }
    });

    // 2. Update badges
    errorCountBadge.textContent = errors;
    if (errors > 0) {
      errorCountBadge.style.background = '#ef4444';
      errorCountBadge.style.color = 'white';
    } else {
      errorCountBadge.style.background = '#fef2f2';
      errorCountBadge.style.color = '#ef4444';
    }
    totalCountBadge.textContent = currentlyParsed.length;

    // 3. Render stats bar
    const statsHtml = Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([cat, count]) => `${CAT_LABELS[cat]}: <span class="admin-import-stat-badge">(${count})</span>`)
      .join('  ');
    statsBar.innerHTML = statsHtml || '暂无解析题目数据';

    // 4. Render Preview list
    renderPreviewList();
  };

  const renderPreviewList = () => {
    previewList.innerHTML = '';
    if (currentlyParsed.length === 0) {
      previewList.innerHTML = `
        <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; color:var(--text-muted); font-size:0.85rem; height:100%; gap:0.5rem; min-height:300px;">
          <span>📝 左侧输入框输入题目，右侧将实时渲染预览。</span>
        </div>
      `;
      return;
    }

    currentlyParsed.forEach((q, idx) => {
      const card = document.createElement('div');
      card.className = 'import-preview-q-card';
      card.dataset.idx = idx;

      if (editingIndices.has(idx)) {
        // Edit mode HTML
        const topicOptsHtml = TOPIC_OPTIONS.map(t => 
          `<option value="${t.value}" ${t.value === (q.topic || 'propositional_logic') ? 'selected' : ''}>${t.label}</option>`
        ).join('');
        
        const catOptsHtml = Object.entries(CAT_LABELS).map(([v, l]) =>
          `<option value="${v}" ${v === q.category ? 'selected' : ''}>${l}</option>`
        ).join('');

        const optionsText = (q.options || []).map((o, i) => {
          if (typeof o === 'object' && o !== null && o.text) return o.text;
          return typeof o === 'object' ? (o.text || '') : o;
        }).join('\n');

        card.innerHTML = `
          <div class="import-preview-q-header" style="justify-content:space-between; align-items:center; width:100%;">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="import-preview-q-index" style="color:var(--primary); font-weight:800;">${idx + 1}、</span>
              <span class="import-preview-q-cat" style="background:var(--primary); color:white;">编辑中</span>
            </div>
            <div style="display:flex; gap:0.35rem;">
              <button class="btn btn-outline card-ai-btn" style="padding:0.25rem 0.5rem; font-size:0.7rem; border-radius:6px; cursor:pointer;">✨ AI 优化</button>
              <button class="btn btn-primary card-save-btn" style="padding:0.25rem 0.5rem; font-size:0.7rem; border-radius:6px; cursor:pointer;">保存</button>
            </div>
          </div>

          <div style="display:flex; gap:0.5rem; margin-top:0.4rem; width:100%; flex-wrap:wrap;">
            <div style="flex:1; min-width:120px; display:flex; flex-direction:column; gap:0.2rem;">
              <label style="font-size:0.7rem; font-weight:700; color:var(--text-secondary);">专题科目</label>
              <select class="card-edit-topic" style="padding:0.3rem; font-size:0.75rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); outline:none;">${topicOptsHtml}</select>
            </div>
            <div style="flex:1; min-width:120px; display:flex; flex-direction:column; gap:0.2rem;">
              <label style="font-size:0.7rem; font-weight:700; color:var(--text-secondary);">题目类型</label>
              <select class="card-edit-cat" style="padding:0.3rem; font-size:0.75rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); outline:none;">${catOptsHtml}</select>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:0.2rem; margin-top:0.4rem; width:100%;">
            <label style="font-size:0.7rem; font-weight:700; color:var(--text-secondary);">题干（支持 Markdown & LaTeX）</label>
            <textarea class="card-edit-question" rows="3" style="padding:0.4rem; font-size:0.8rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); resize:vertical; outline:none; font-family:monospace; box-sizing:border-box; width:100%;">${q.question || ''}</textarea>
          </div>

          <div class="card-edit-options-wrapper" style="display:${q.category === 'single_choice' ? 'flex' : 'none'}; flex-direction:column; gap:0.2rem; margin-top:0.4rem; width:100%;">
            <label style="font-size:0.7rem; font-weight:700; color:var(--text-secondary);">选项（每行一个选项，不带A. B.前缀）</label>
            <textarea class="card-edit-options" rows="3" style="padding:0.4rem; font-size:0.8rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); resize:vertical; outline:none; font-family:monospace; box-sizing:border-box; width:100%;" placeholder="选项A\n选项B\n选项C\n选项D">${optionsText}</textarea>
          </div>

          <div style="display:flex; flex-direction:column; gap:0.2rem; margin-top:0.4rem; width:100%;">
            <label style="font-size:0.7rem; font-weight:700; color:var(--text-secondary);">标准答案</label>
            <input type="text" class="card-edit-answer" value="${q.answer || ''}" style="padding:0.4rem; font-size:0.8rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); outline:none; box-sizing:border-box; width:100%;">
          </div>

          <div style="display:flex; flex-direction:column; gap:0.2rem; margin-top:0.4rem; width:100%;">
            <label style="font-size:0.7rem; font-weight:700; color:var(--text-secondary);">解析（支持 Markdown & LaTeX）</label>
            <textarea class="card-edit-analysis" rows="2" style="padding:0.4rem; font-size:0.8rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); resize:vertical; outline:none; font-family:monospace; box-sizing:border-box; width:100%;">${q.analysis || ''}</textarea>
          </div>
        `;

        // Switch options visibility dynamically if category changes
        const catSelect = card.querySelector('.card-edit-cat');
        const optsWrapper = card.querySelector('.card-edit-options-wrapper');
        catSelect.onchange = () => {
          if (catSelect.value === 'single_choice') {
            optsWrapper.style.display = 'flex';
          } else {
            optsWrapper.style.display = 'none';
          }
        };

        // Save action
        card.querySelector('.card-save-btn').onclick = () => {
          const topic = card.querySelector('.card-edit-topic').value;
          const category = card.querySelector('.card-edit-cat').value;
          const question = card.querySelector('.card-edit-question').value;
          const answer = card.querySelector('.card-edit-answer').value;
          const analysis = card.querySelector('.card-edit-analysis').value;

          q.topic = topic;
          q.category = category;
          q.question = question;
          q.answer = answer;
          q.analysis = analysis;

          if (category === 'single_choice') {
            const optsText = card.querySelector('.card-edit-options').value;
            q.options = optsText.split('\n').map(o => o.trim()).filter(o => o !== '');
          } else {
            q.options = [];
          }

          editingIndices.delete(idx);
          updateCountsAndPreview();
        };

        // AI single optimize inside card
        card.querySelector('.card-ai-btn').onclick = async () => {
          const btn = card.querySelector('.card-ai-btn');
          btn.disabled = true;
          btn.textContent = '⏳ 优化中...';

          const topic = card.querySelector('.card-edit-topic').value;
          const category = card.querySelector('.card-edit-cat').value;
          const question = card.querySelector('.card-edit-question').value;
          const answer = card.querySelector('.card-edit-answer').value;
          const analysis = card.querySelector('.card-edit-analysis').value;
          
          let options = [];
          if (category === 'single_choice') {
            const optsText = card.querySelector('.card-edit-options').value;
            options = optsText.split('\n').map(o => o.trim()).filter(o => o !== '');
          }

          try {
            const res = await fetch('/api/ai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mode: 'enhance_question',
                question,
                answer,
                analysis,
                category,
                topic,
                options
              })
            });
            const result = await res.json();
            if (res.ok && result.question) {
              card.querySelector('.card-edit-question').value = result.question;
              card.querySelector('.card-edit-answer').value = result.answer || answer;
              card.querySelector('.card-edit-analysis').value = result.analysis || analysis;

              if (category === 'single_choice' && result.options) {
                card.querySelector('.card-edit-options').value = result.options.join('\n');
              }
              showToast('🤖 AI 优化成功！已回填至表单。', 'success');
            } else {
              showToast('AI 优化失败：' + (result.error || '未知错误'), 'error');
            }
          } catch (err) {
            showToast('无法连接 AI 接口！', 'error');
          }
          btn.disabled = false;
          btn.textContent = '✨ AI 优化';
        };

      } else {
        // Preview mode HTML
        const optHtml = q.options && q.options.length > 0
          ? `<div class="import-preview-q-opts">
              ${q.options.map((o, i) => {
                const text = typeof o === 'object' ? (o.text || '') : o;
                return `<div class="import-preview-q-opt">${String.fromCharCode(65 + i)}、${text}</div>`;
              }).join('')}
             </div>`
          : '';

        card.innerHTML = `
          <div class="import-preview-q-header" style="justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="import-preview-q-index">${idx + 1}、</span>
              <span class="import-preview-q-cat">${CAT_LABELS[q.category] || q.category}</span>
            </div>
            <button class="btn btn-outline card-edit-btn" style="padding:0.25rem 0.5rem; font-size:0.7rem; border-radius:6px; cursor:pointer; color:var(--primary); border-color:var(--primary);">✍️ 编辑</button>
          </div>
          <div class="import-preview-q-stem"></div>
          ${optHtml}
          <div class="import-preview-q-ans-box">答案：${q.answer}</div>
          ${q.analysis ? `<div class="import-preview-q-analysis-box">解析：${q.analysis}</div>` : ''}
        `;

        // Safely parse Markdown and LaTeX formulas
        const stemEl = card.querySelector('.import-preview-q-stem');
        if (stemEl) {
          stemEl.innerHTML = marked.parse(q.question || '');
          renderMath(stemEl);
        }

        const analysisEl = card.querySelector('.import-preview-q-analysis-box');
        if (analysisEl) {
          analysisEl.innerHTML = marked.parse('解析：' + q.analysis);
          renderMath(analysisEl);
        }

        // Toggle edit mode click
        card.querySelector('.card-edit-btn').onclick = () => {
          editingIndices.add(idx);
          renderPreviewList();
        };
      }

      previewList.appendChild(card);
    });
  };

  // Wire initial parsing & bindings
  textarea.value = initialText || "";
  runLiveParse();

  textarea.oninput = () => runLiveParse();

  // File loading triggers
  importFileBtn.onclick = () => fileInput.click();
  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      textarea.value = ev.target.result;
      runLiveParse();
      showToast(`📁 成功读取文件: ${file.name}`, 'success');
    };
    reader.readAsText(file, 'utf-8');
    fileInput.value = '';
  };

  // Case Modal triggers
  showExampleBtn.onclick = () => exampleModal.style.display = 'flex';
  modalCloseBtn.onclick = () => exampleModal.style.display = 'none';
  exampleModal.onclick = (e) => { if (e.target === exampleModal) exampleModal.style.display = 'none'; };

  // Submit trigger
  submitBtn.onclick = async () => {
    if (currentlyParsed.length === 0) {
      showToast('没有识别出有效的题目，请先在左侧输入！', 'error');
      return;
    }

    let errors = 0;
    currentlyParsed.forEach(q => {
      if (!q.question.trim() || !q.answer.trim()) errors++;
    });

    if (errors > 0) {
      if (!confirm(`当前有 ${errors} 道题目信息不完整（缺少题干或答案），确定要忽略并导入其它 ${currentlyParsed.length - errors} 道正确的题目吗？`)) {
        return;
      }
    }

    let importedCount = 0;
    for (const q of currentlyParsed) {
      if (!q.question.trim() || !q.answer.trim()) continue;

      const category = q.category;
      const topic = q.topic || 'propositional_logic';
      const question = q.question.trim();
      const answer = q.answer.trim();
      const analysis = q.analysis.trim();

      // Format options to match database structure { key, text }
      const formattedOptions = (q.options || []).map((opt, i) => {
        if (typeof opt === 'object' && opt !== null && opt.key && opt.text) {
          return opt;
        }
        const key = String.fromCharCode(65 + i);
        const text = typeof opt === 'object' ? (opt.text || '') : opt;
        return { key, text };
      });

      const inCat = QUESTIONS.filter(qi => qi.category === category);
      const nextNum = inCat.length > 0 ? Math.max(...inCat.map(qi => qi.original_num)) + 1 : 1;

      QUESTIONS.push({
        category,
        original_num: nextNum,
        question,
        options: formattedOptions,
        answer,
        analysis: analysis || '',
        topic
      });
      importedCount++;
    }

    if (importedCount === 0) {
      showToast('没有有效题目可导入！', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ 导入中...';
    try {
      await saveQuestionsToCloud();
      panelEl.style.display = 'none';
      panelEl.innerHTML = '';
      if (listWrapper) listWrapper.style.display = 'flex';
      showToast(`🎉 成功导入 ${importedCount} 道题目并同步至云端！`, 'success');
      renderQuestionsList();
    } catch (err) {
      showToast('导入同步失败！', 'error');
    }
    submitBtn.disabled = false;
    submitBtn.textContent = '提交';
  };

  // Close trigger
  closeBtn.onclick = () => {
    if (textarea.value.trim() && !confirm('确定要关闭吗？输入的内容将不会被保存。')) {
      return;
    }
    panelEl.style.display = 'none';
    panelEl.innerHTML = '';
    if (listWrapper) listWrapper.style.display = 'flex';
  };
}
// ---------------- SYSTEM AND AI CONFIG TAB ----------------
async function renderAdminSystemTab(container) {
  container.innerHTML = `
    <div class="admin-system-grid">
      <!-- Left: Configuration Form -->
      <div class="admin-card admin-card-left">
        <h3 style="margin:0; font-size:1rem; font-weight:800; border-bottom:1px solid var(--border-color); padding-bottom:0.6rem; color:var(--text-primary);">⚙️ 全局系统参数设置</h3>
        
        <div style="display:flex; flex-direction:column; gap:1rem;">
          <div style="display:flex; flex-direction:column; gap:0.35rem;">
            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">默认 AI 助教语言模型 (Workers AI)</label>
            <select id="sys-default-model" style="padding:0.75rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; cursor:pointer; width:100%; max-width:100%; box-sizing:border-box; text-overflow:ellipsis;">
              <option value="@cf/qwen/qwq-32b">🏆 QwQ-32B — 数学推理专项 (Reasoning, 32B)</option>
              <option value="@cf/deepseek-ai/deepseek-r1-distill-qwen-32b">🧠 DeepSeek R1-Distill-32B — 超强推理链 (Reasoning, 32B)</option>
              <option value="@cf/qwen/qwen3-30b-a3b-fp8">⚡ Qwen3-30B MoE — 推理+中文优化 (Reasoning, MoE)</option>
              <option value="@cf/meta/llama-3.3-70b-instruct-fp8-fast">🦙 Llama 3.3-70B-FP8 — 旗舰通用高速 (General, 70B)</option>
              <option value="@cf/openai/gpt-oss-20b">🤖 GPT-OSS-20B — OpenAI轻量推理 (Reasoning, 20B)</option>
              <option value="@cf/google/gemma-4-26b-a4b-it">💎 Gemma 4-26B MoE — Google推理 (Reasoning, MoE)</option>
              <option value="@cf/zhipuai/glm-4.7-flash">🚀 GLM-4.7-Flash — 中文极速响应 (131k ctx)</option>
            </select>
          </div>
 
          <div style="display:flex; flex-direction:column; gap:0.35rem;">
            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">默认思考链强度 (Thinking Intensity)</label>
            <select id="sys-default-intensity" style="padding:0.75rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; cursor:pointer; width:100%; max-width:100%; box-sizing:border-box;">
              <option value="low">低强度 (直接简短回复)</option>
              <option value="medium">中等强度 (分析详细思路)</option>
              <option value="high">高强度 (极严谨逻辑证论)</option>
            </select>
          </div>
 
          <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.25rem;">
            <input type="checkbox" id="sys-force-thinking" style="cursor:pointer; width:16px; height:16px;">
            <label for="sys-force-thinking" style="font-size:0.8rem; font-weight:700; color:var(--text-primary); cursor:pointer;">强制在首位展开展示思考过程</label>
          </div>
          
          <button class="btn btn-primary" id="sys-save-btn" style="padding:0.75rem; font-size:0.85rem; font-weight:700; width:100%; margin-top:0.5rem; cursor:pointer; box-sizing:border-box;">
            💾 保存配置至云端
          </button>
        </div>
      </div>
 
      <!-- Right: AI Tutor Deep Testing Console -->
      <div class="admin-card admin-card-right">
        <h3 style="margin:0; font-size:1rem; font-weight:800; border-bottom:1px solid var(--border-color); padding-bottom:0.6rem; color:var(--text-primary);">🧪 AI 助教接口深度联调沙箱</h3>
        <p style="font-size:0.78rem; color:var(--text-muted); margin:0; line-height:1.45;">
          管理员可在此任选一道现有离散题目，向配置的 AI 模型发送对话提问，直接观察其推理链条和 LaTeX 公式排版输出，调试 Socratic 启发式回复质量。
        </p>
        
        <div style="display:flex; flex-direction:column; gap:0.85rem;">
          <div style="display:flex; flex-direction:column; gap:0.35rem;">
            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">选择联调绑定题目</label>
            <select id="ai-test-q-select" style="padding:0.75rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; cursor:pointer; width:100%; max-width:100%; box-sizing:border-box; text-overflow:ellipsis;">
              <!-- Load dynamically -->
            </select>
          </div>
 
          <div style="display:flex; flex-direction:column; gap:0.35rem;">
            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">输入调试学生提问 (Query)</label>
            <input type="text" id="ai-test-query" value="请问这道题目的参考解析是什么意思？我不太明白是怎么推理出来的。" style="padding:0.75rem; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:0.85rem; width:100%; box-sizing:border-box;">
          </div>
 
          <button class="btn btn-outline" id="ai-test-btn" style="padding:0.7rem; font-size:0.85rem; font-weight:700; color:var(--primary); border-color:var(--primary); cursor:pointer; width:100%; box-sizing:border-box;">
            ⚡ 启动 AI 实时推演测试
          </button>
 
          <!-- Test Response Output -->
          <div style="display:none; flex-direction:column; gap:0.5rem; margin-top:0.25rem;" id="ai-test-result-wrapper">
            <label style="font-size:0.75rem; font-weight:800; color:var(--success);">📟 AI 实时调试响应输出</label>
            <div style="border:1px solid var(--border-color); border-radius:10px; padding:1rem; background:rgba(0,0,0,0.02); min-height:6rem; max-height:22rem; overflow-y:auto; font-size:0.85rem; line-height:1.6; box-sizing:border-box; width:100%;" id="ai-test-result-box"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const token = localStorage.getItem('dm_jwt_token');

  // Load config initially
  const loadSystemConfig = async () => {
    try {
      const res = await fetch('/api/admin/system', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const config = await res.json();
        const modelEl = container.querySelector('#sys-default-model');
        if (modelEl) modelEl.value = config.defaultModel;
        const intensityEl = container.querySelector('#sys-default-intensity');
        if (intensityEl) intensityEl.value = config.defaultIntensity;
        const forceEl = container.querySelector('#sys-force-thinking');
        if (forceEl) forceEl.checked = config.forceShowThinking;
      }
    } catch (err) {
      console.error("System config loading error:", err);
    }
  };

  // Save config
  container.querySelector('#sys-save-btn').onclick = async () => {
    const defaultModel = container.querySelector('#sys-default-model').value;
    const defaultIntensity = container.querySelector('#sys-default-intensity').value;
    const forceShowThinking = container.querySelector('#sys-force-thinking').checked;

    try {
      const res = await fetch('/api/admin/system', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ defaultModel, defaultIntensity, forceShowThinking })
      });
      if (res.ok) {
        showToast('全局系统与AI配置更新成功并写入云端！', 'success');
      } else {
        const errData = await res.json();
        showToast(errData.error || '保存失败', 'error');
      }
    } catch (err) {
      showToast('更新网络异常！', 'error');
    }
  };

  // Load test questions list
  const qSelect = container.querySelector('#ai-test-q-select');
  qSelect.innerHTML = '';
  QUESTIONS.forEach((q) => {
    const opt = document.createElement('option');
    opt.value = `${q.category}_${q.original_num}`;
    // Truncate text for select
    const text = q.question.replace(/\$/g, '').substring(0, 50) + "...";
    opt.innerText = `[${q.category.toUpperCase()}] #${q.original_num} - ${text}`;
    qSelect.appendChild(opt);
  });

  // AI Testing Action
  const testBtn = container.querySelector('#ai-test-btn');
  const resultWrapper = container.querySelector('#ai-test-result-wrapper');
  const resultBox = container.querySelector('#ai-test-result-box');

  testBtn.onclick = async () => {
    const qKey = qSelect.value;
    const query = container.querySelector('#ai-test-query').value.trim();
    const chosenModel = container.querySelector('#sys-default-model').value;
    const intensity = container.querySelector('#sys-default-intensity').value;

    const qObj = QUESTIONS.find(q => `${q.category}_${q.original_num}` === qKey);
    if (!qObj) return;

    if (!query) {
      showToast('请输入提问测试Query！', 'error');
      return;
    }

    resultWrapper.style.display = 'flex';
    resultBox.innerHTML = `<span style="color:var(--text-muted);">📡 连接 AI 端点推演中 (非流式响应测试)...</span>`;
    testBtn.disabled = true;

    try {
      const response = await fetch(`/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: qObj.question,
          analysis: qObj.analysis,
          answer: qObj.answer,
          userQuery: query,
          model: chosenModel,
          thinkingIntensity: intensity,
          stream: false
        })
      });
      const result = await response.json();
      testBtn.disabled = false;

      if (response.ok) {
        let rawText = result.response;
        let thinkingText = "";
        
        const thinkRegex = /<think>([\s\S]*?)<\/think>/i;
        const match = rawText.match(thinkRegex);
        if (match) {
          thinkingText = match[1].trim();
          rawText = rawText.replace(thinkRegex, "").trim();
        }

        let thinkingHtml = "";
        if (thinkingText) {
          thinkingHtml = `
            <div style="padding:0.6rem; border:1px solid var(--border-color); border-radius:8px; background:rgba(0,0,0,0.015); margin-bottom:0.75rem; font-size:0.78rem; color:var(--text-muted); line-height:1.45; white-space:pre-wrap;">
              💡 思考过程：\n${thinkingText}
            </div>
          `;
        }

        resultBox.innerHTML = thinkingHtml + marked.parse(rawText);
        renderMath(resultBox);
      } else {
        resultBox.innerHTML = `<span style="color:var(--error);">✕ 联调测试失败: ${result.error || '未响应'}</span>`;
      }
    } catch (err) {
      testBtn.disabled = false;
      resultBox.innerHTML = `<span style="color:var(--error);">✕ 无法连接 AI 接口！</span>`;
    }
  };

  // Initial load
  loadSystemConfig();
}
