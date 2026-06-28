// --- GSAP and ScrollTrigger Animation System for Discrete Math Quiz ---

// Register GSAP ScrollTrigger Plugin
gsap.registerPlugin(ScrollTrigger);

// Initialize all animations when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Create progress bar element at the top of the body
  createScrollProgressBar();
  
  // Set up global scroll-linked animations
  initGlobalScrollAnimations();
  
  // Wrap core functions in app.js to hook animations
  wrapAppFunctions();
  
  // Trigger initial animations for the current page
  triggerPageTransitionAnimations();
});

// 1. Create a top scroll progress bar
function createScrollProgressBar() {
  if (document.getElementById('scroll-progress-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'scroll-progress-bar';
  bar.style.position = 'fixed';
  bar.style.top = '0';
  bar.style.left = '0';
  bar.style.width = '100%';
  bar.style.height = '3px';
  bar.style.transformOrigin = 'left';
  bar.style.transform = 'scaleX(0)';
  bar.style.zIndex = '9999';
  bar.style.pointerEvents = 'none';
  document.body.appendChild(bar);
  
  // ScrollTrigger to scale the bar based on .main-content scroll progress
  gsap.to(bar, {
    scaleX: 1,
    ease: "none",
    scrollTrigger: {
      trigger: ".main-content",
      scroller: ".main-content",
      start: "top top",
      end: "bottom bottom",
      scrub: true
    }
  });
}

// 2. Global scroll-linked animations (header shrink/shadow)
let desktopHeaderTrigger = null;
let mobileHeaderTrigger = null;
let practiceSheetTrigger = null;

function initGlobalScrollAnimations() {
  // Clean up existing triggers if any
  if (desktopHeaderTrigger) desktopHeaderTrigger.kill();
  if (mobileHeaderTrigger) mobileHeaderTrigger.kill();
  
  // Desktop header scroll behavior
  const desktopHeader = document.querySelector('.content-header');
  if (desktopHeader) {
    // Add CSS properties to make header sticky
    desktopHeader.style.position = 'sticky';
    desktopHeader.style.top = '0';
    desktopHeader.style.zIndex = '100';
    desktopHeader.style.transition = 'background-color var(--transition-normal), border-color var(--transition-normal)';
    
    // Adjust main-content padding-top to 0 and move it to header for seamless stick
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.style.paddingTop = '0';
      desktopHeader.style.paddingTop = '2rem';
      desktopHeader.style.paddingBottom = '1.5rem';
      desktopHeader.style.backgroundColor = 'var(--bg-primary)';
      desktopHeader.style.borderBottom = '1px solid transparent';
    }
    
    desktopHeaderTrigger = ScrollTrigger.create({
      trigger: ".main-content",
      scroller: ".main-content",
      start: "top+=10 top",
      onEnter: () => {
        gsap.to(desktopHeader, {
          paddingTop: "1rem",
          paddingBottom: "1rem",
          backgroundColor: "var(--bg-primary-fade)",
          backdropFilter: "blur(12px)",
          webkitBackdropFilter: "blur(12px)",
          borderBottomColor: "var(--border-color)",
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.03), 0 4px 6px -4px rgba(0, 0, 0, 0.03)",
          duration: 0.3,
          overwrite: "auto"
        });
      },
      onLeaveBack: () => {
        gsap.to(desktopHeader, {
          paddingTop: "2rem",
          paddingBottom: "1.5rem",
          backgroundColor: "var(--bg-primary)",
          backdropFilter: "none",
          webkitBackdropFilter: "none",
          borderBottomColor: "transparent",
          boxShadow: "none",
          duration: 0.3,
          overwrite: "auto"
        });
      }
    });
  }
  
  // Mobile header scroll behavior
  const mobileHeader = document.getElementById('mobile-header');
  if (mobileHeader) {
    mobileHeaderTrigger = ScrollTrigger.create({
      trigger: ".main-content",
      scroller: ".main-content",
      start: "top+=10 top",
      onEnter: () => {
        gsap.to(mobileHeader, {
          height: "52px",
          backgroundColor: "var(--bg-primary-fade)",
          backdropFilter: "blur(12px)",
          webkitBackdropFilter: "blur(12px)",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
          duration: 0.3,
          overwrite: "auto"
        });
      },
      onLeaveBack: () => {
        gsap.to(mobileHeader, {
          height: "64px",
          backgroundColor: "var(--bg-secondary)",
          backdropFilter: "none",
          webkitBackdropFilter: "none",
          boxShadow: "none",
          duration: 0.3,
          overwrite: "auto"
        });
      }
    });
  }
}

// 3. Wrap core functions in app.js to hook animations
function wrapAppFunctions() {
  // Wrap renderViewport
  if (window.renderViewport) {
    const originalRenderViewport = window.renderViewport;
    window.renderViewport = function(...args) {
      originalRenderViewport(...args);
      // Wait for DOM to update and render math, etc.
      setTimeout(() => {
        setupLayoutModifications();
        triggerPageTransitionAnimations();
        ScrollTrigger.refresh();
      }, 50);
    };
  }

  // Wrap updateMasteryPanel
  if (window.updateMasteryPanel) {
    const originalUpdateMasteryPanel = window.updateMasteryPanel;
    window.updateMasteryPanel = function(...args) {
      originalUpdateMasteryPanel(...args);
      // Custom progress bar animation with GSAP
      animateMasteryProgress();
    };
  }
}

// 4. Modify DOM structure for two-column desktop layouts dynamically
function setupLayoutModifications() {
  const viewport = document.getElementById('viewport');
  if (!viewport) return;
  
  const isDesktop = window.innerWidth > 768;
  
  // A. Practice Mode Two-Column Layout
  if (practiceSheetTrigger) {
    practiceSheetTrigger.kill();
    practiceSheetTrigger = null;
  }
  
  const isPracticeMode = currentMode === 'practice' && !['leaderboard', 'profile', 'bookmarks_retake'].includes(currentCategory);
  const practiceCard = viewport.querySelector('.question-card');
  const sheetCard = viewport.querySelector('.practice-answer-sheet-card');
  
  if (isDesktop && isPracticeMode && practiceCard && sheetCard) {
    viewport.classList.add('practice-two-col');
    
    // Create ScrollTrigger to apply visual style change when pinned
    practiceSheetTrigger = ScrollTrigger.create({
      trigger: sheetCard,
      scroller: ".main-content",
      start: "top top+=110px",
      endTrigger: practiceCard,
      end: "bottom top+=110px",
      toggleClass: "pinned",
      invalidateOnRefresh: true
    });
  } else {
    viewport.classList.remove('practice-two-col');
  }

  // B. Exam Mode Two-Column Layout
  const isExamActive = currentMode === 'exam' && typeof examState !== 'undefined' && examState.isActive && !examState.completed;
  
  if (isDesktop && isExamActive) {
    let sidebar = viewport.querySelector('.exam-sidebar-container');
    const examHeader = viewport.querySelector('.exam-header-widget');
    const examNavGrid = viewport.querySelector('.question-nav-grid');
    const examCard = viewport.querySelector('.question-card');
    
    if (examHeader && examNavGrid && examCard && !sidebar) {
      // Create sidebar container
      sidebar = document.createElement('div');
      sidebar.className = 'exam-sidebar-container';
      
      // Move elements into sidebar (preserves DOM event listeners)
      sidebar.appendChild(examHeader);
      sidebar.appendChild(examNavGrid);
      
      // Re-order inside viewport: Left Question Card, Right Sidebar
      viewport.appendChild(examCard);
      viewport.appendChild(sidebar);
    }
    viewport.classList.add('exam-two-col');
  } else {
    viewport.classList.remove('exam-two-col');
  }
}

// 5. Page / View transition entrance animations
let radarPinTrigger = null;

function triggerPageTransitionAnimations() {
  // A. Animate Stats Dashboard Cards (staggered bounce/fade)
  const statsPanel = document.getElementById('stats-panel');
  if (statsPanel && statsPanel.style.display !== 'none') {
    const cards = statsPanel.querySelectorAll('.stat-card');
    // Kill existing card tweens to prevent overlaps
    gsap.killTweensOf(cards);
    gsap.fromTo(cards, 
      { opacity: 0, y: 25, scale: 0.95 },
      { 
        opacity: 1, 
        y: 0, 
        scale: 1, 
        duration: 0.55, 
        stagger: 0.06, 
        ease: "back.out(1.2)", 
        overwrite: "auto" 
      }
    );
  }

  // B. Animate Mastery Panel
  const masteryPanel = document.getElementById('mastery-panel');
  if (masteryPanel && masteryPanel.style.display !== 'none') {
    // Left side: Radar chart card 3D tilt-in
    const radarCard = masteryPanel.querySelector('.mastery-card:first-child');
    if (radarCard) {
      gsap.killTweensOf(radarCard);
      gsap.fromTo(radarCard,
        { opacity: 0, x: -30, rotationY: -10, transformPerspective: 1000 },
        { opacity: 1, x: 0, rotationY: 0, duration: 0.65, ease: "power2.out", overwrite: "auto" }
      );
    }
    
    // Right side: Progress cards slide in
    const progressCards = masteryPanel.querySelectorAll('div[style*="flex-direction:column"] > .mastery-card');
    if (progressCards.length > 0) {
      gsap.killTweensOf(progressCards);
      gsap.fromTo(progressCards,
        { opacity: 0, x: 30 },
        { opacity: 1, x: 0, duration: 0.65, stagger: 0.1, ease: "power2.out", overwrite: "auto" }
      );
    }
    
    // Trigger progress animations
    animateMasteryProgress();
    
    // Pin Radar Chart on Desktop
    initRadarChartPinning();
  }

  // C. Animate main rendered viewport cards
  const questionCard = document.querySelector('.question-card');
  const sheetCard = document.querySelector('.practice-answer-sheet-card');
  const leaderboardCard = document.querySelector('.leaderboard-container');
  const profileContainer = document.querySelector('.profile-container');
  const emptyCard = document.querySelector('.empty-bookmarks-card');
  const cfQuotaPanel = document.getElementById('global-cf-quota-panel');
  
  const animTargets = [];
  if (questionCard) animTargets.push(questionCard);
  if (sheetCard && (window.innerWidth <= 768 || currentMode !== 'practice')) animTargets.push(sheetCard);
  if (leaderboardCard) animTargets.push(leaderboardCard);
  if (profileContainer) animTargets.push(profileContainer);
  if (emptyCard) animTargets.push(emptyCard);
  if (cfQuotaPanel && cfQuotaPanel.style.display !== 'none') {
    const quotaCards = cfQuotaPanel.querySelectorAll('.dashboard-card');
    if (quotaCards.length > 0) animTargets.push(...quotaCards);
  }
  
  if (animTargets.length > 0) {
    gsap.killTweensOf(animTargets);
    gsap.fromTo(animTargets,
      { opacity: 0, y: 35 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power3.out", overwrite: "auto" }
    );
  }

  // D. Stagger choice options / judgment buttons
  const options = document.querySelectorAll('.option-item');
  if (options.length > 0) {
    gsap.killTweensOf(options);
    gsap.fromTo(options,
      { opacity: 0, x: -15 },
      { opacity: 1, x: 0, duration: 0.45, stagger: 0.06, ease: "power2.out", overwrite: "auto" }
    );
  }
  
  const judgmentBtns = document.querySelectorAll('.judgment-btn');
  if (judgmentBtns.length > 0) {
    gsap.killTweensOf(judgmentBtns);
    gsap.fromTo(judgmentBtns,
      { opacity: 0, scale: 0.9, y: 10 },
      { opacity: 1, scale: 1, y: 0, duration: 0.4, stagger: 0.08, ease: "back.out(1.4)", overwrite: "auto" }
    );
  }

  // E. Set up MutationObserver for smooth solution panel reveal
  setupSolutionObserver();
}

// 6. Pin Radar Chart on Desktop
function initRadarChartPinning() {
  if (radarPinTrigger) {
    radarPinTrigger.kill();
    radarPinTrigger = null;
  }
  
  // Desktop only
  if (window.innerWidth <= 768) return;
  
  const masteryPanel = document.getElementById('mastery-panel');
  if (!masteryPanel) return;
  
  const radarCard = masteryPanel.querySelector('.mastery-card:first-child');
  const rightColumn = masteryPanel.querySelector('div[style*="flex-direction:column"]');
  if (!radarCard || !rightColumn) return;
  
  // Pin radar card inside mastery panel container
  radarPinTrigger = ScrollTrigger.create({
    trigger: masteryPanel,
    scroller: ".main-content",
    start: "top top+=110px",
    end: "bottom bottom-=20px",
    pin: radarCard,
    pinSpacing: false,
    invalidateOnRefresh: true
  });
}

// 7. Custom progress bar and percentage numbers count up tween
function animateMasteryProgress() {
  const propBar = document.getElementById('mastery-prop-bar');
  const propPctEl = document.getElementById('mastery-prop-pct');
  const predBar = document.getElementById('mastery-pred-bar');
  const predPctEl = document.getElementById('mastery-pred-pct');
  
  if (propBar && propPctEl) {
    const targetVal = parseInt(propPctEl.innerText, 10) || 0;
    
    // Disable native CSS transitions to let GSAP handle it smoothly
    propBar.style.transition = 'none';
    propBar.style.width = '0%';
    
    gsap.killTweensOf(propBar);
    gsap.to(propBar, {
      width: `${targetVal}%`,
      duration: 1.2,
      ease: "power2.out",
      overwrite: "auto"
    });
    
    const countObj = { val: 0 };
    gsap.killTweensOf(countObj);
    gsap.to(countObj, {
      val: targetVal,
      duration: 1.2,
      ease: "power2.out",
      onUpdate: () => {
        propPctEl.innerText = `${Math.round(countObj.val)}%`;
      },
      overwrite: "auto"
    });
  }
  
  if (predBar && predPctEl) {
    const targetVal = parseInt(predPctEl.innerText, 10) || 0;
    
    predBar.style.transition = 'none';
    predBar.style.width = '0%';
    
    gsap.killTweensOf(predBar);
    gsap.to(predBar, {
      width: `${targetVal}%`,
      duration: 1.2,
      ease: "power2.out",
      overwrite: "auto"
    });
    
    const countObj = { val: 0 };
    gsap.killTweensOf(countObj);
    gsap.to(countObj, {
      val: targetVal,
      duration: 1.2,
      ease: "power2.out",
      onUpdate: () => {
        predPctEl.innerText = `${Math.round(countObj.val)}%`;
      },
      overwrite: "auto"
    });
  }
}

// 8. Observe solution panel and animate dynamic height changes
function setupSolutionObserver() {
  const panel = document.getElementById('solution-panel');
  if (panel && !panel.dataset.observed) {
    panel.dataset.observed = 'true';
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'style') {
          const display = panel.style.display;
          if (display === 'flex' && !panel.classList.contains('animating')) {
            panel.classList.add('animating');
            
            // Kill active tweens
            gsap.killTweensOf(panel);
            
            // Set styles to extract scroll height
            panel.style.height = 'auto';
            panel.style.opacity = '1';
            const targetHeight = panel.scrollHeight;
            
            // Animate layout expand
            gsap.fromTo(panel,
              { height: 0, opacity: 0 },
              { 
                height: targetHeight, 
                opacity: 1, 
                duration: 0.45, 
                ease: "power2.out",
                onComplete: () => {
                  panel.style.height = '';
                  panel.style.opacity = '';
                  panel.classList.remove('animating');
                  ScrollTrigger.refresh(); // Refresh ScrollTriggers for layout shift
                }
              }
            );
          }
        }
      });
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['style'] });
  }
}
