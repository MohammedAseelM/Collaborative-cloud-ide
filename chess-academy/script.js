// ==========================================================================
// VANGUARD CHESS ACADEMY - CLIENT-SIDE INTERACTIVITY & VALIDATION
// Vanilla ES6 JavaScript (No frameworks, packages, or build tools required)
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  initSmoothScroll();
  initCourseFilters();
  initCourseEnrollButtons();
  initHeroBoardAnimation();
  initDailyPuzzle();
  initRegistrationForm();
  initFaqAccordion();
});

/* ==========================================================================
   1. MOBILE NAVIGATION MENU
   ========================================================================== */
function initMobileMenu() {
  const menuBtn = document.getElementById("mobileMenuBtn");
  const drawer = document.getElementById("mobileDrawer");
  const mobileLinks = document.querySelectorAll(".mobile-nav-link, .mobile-cta");

  if (!menuBtn || !drawer) return;

  function toggleMenu(open) {
    const isOpen = open !== undefined ? open : !drawer.classList.contains("open");
    drawer.classList.toggle("open", isOpen);
    menuBtn.classList.toggle("open", isOpen);
    menuBtn.setAttribute("aria-expanded", String(isOpen));
    drawer.setAttribute("aria-hidden", String(!isOpen));
    document.body.style.overflow = isOpen ? "hidden" : "";
  }

  menuBtn.addEventListener("click", () => toggleMenu());

  mobileLinks.forEach((link) => {
    link.addEventListener("click", () => {
      toggleMenu(false);
    });
  });

  // Close when pressing Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("open")) {
      toggleMenu(false);
    }
  });
}

/* ==========================================================================
   2. SMOOTH SCROLL & ACTIVE LINK HIGHLIGHTING
   ========================================================================== */
function initSmoothScroll() {
  const navLinks = document.querySelectorAll('.desktop-nav .nav-link, a[href^="#"]');
  const sections = document.querySelectorAll("section[id]");

  // Update active navigation link on scroll
  function updateActiveLink() {
    const scrollPos = window.scrollY + 120;

    sections.forEach((section) => {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      const id = section.getAttribute("id");

      if (scrollPos >= top && scrollPos < top + height) {
        document.querySelectorAll('.desktop-nav .nav-link').forEach((link) => {
          link.classList.remove("active");
          if (link.getAttribute("href") === `#${id}`) {
            link.classList.add("active");
          }
        });
      }
    });
  }

  window.addEventListener("scroll", updateActiveLink, { passive: true });
}

/* ==========================================================================
   3. COURSE FILTERING
   ========================================================================== */
function initCourseFilters() {
  const filterBtns = document.querySelectorAll(".filter-btn");
  const cards = document.querySelectorAll(".course-card");

  if (!filterBtns.length || !cards.length) return;

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const filter = btn.getAttribute("data-filter");

      cards.forEach((card) => {
        const category = card.getAttribute("data-category");
        if (filter === "all" || category === filter) {
          card.style.display = "flex";
          card.style.animation = "fadeIn 0.35s ease-out";
        } else {
          card.style.display = "none";
        }
      });
    });
  });
}

/* ==========================================================================
   4. ENROLL BUTTONS (Pre-select Course in Registration Form)
   ========================================================================== */
function initCourseEnrollButtons() {
  const enrollBtns = document.querySelectorAll(".enroll-btn");
  const courseSelect = document.getElementById("selectedCourse");

  enrollBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const courseName = btn.getAttribute("data-course");
      if (courseSelect && courseName) {
        // Find matching option
        for (let i = 0; i < courseSelect.options.length; i++) {
          if (courseSelect.options[i].text.toLowerCase().includes(courseName.toLowerCase())) {
            courseSelect.selectedIndex = i;
            break;
          }
        }
      }
    });
  });
}

/* ==========================================================================
   5. HERO CHESSBOARD INTERACTIVE ANIMATION
   ========================================================================== */
function initHeroBoardAnimation() {
  const animateBtn = document.getElementById("boardAnimateBtn");
  const heroBoard = document.getElementById("heroBoard");
  if (!animateBtn || !heroBoard) return;

  let step = 0;

  animateBtn.addEventListener("click", () => {
    // Famous move: Adolf Anderssen's Queen Sacrifice 22.Qf3+ or 23.Be7# in Immortal Game
    const d1Square = heroBoard.querySelector('[data-sq="d1"]');
    const f3Square = heroBoard.querySelector('[data-sq="f3"]');
    const f7Square = heroBoard.querySelector('[data-sq="f7"]');

    if (step === 0) {
      // Step 1: Highlight Queen move to f3
      document.querySelectorAll(".square").forEach((sq) => sq.classList.remove("selected", "highlight-move"));
      if (d1Square) d1Square.classList.add("selected");
      if (f3Square) f3Square.classList.add("highlight-move");

      animateBtn.innerHTML = '<span class="play-icon">▶</span> Play 1. Qf3+';
      step = 1;
    } else if (step === 1) {
      // Step 2: Move Queen piece to f3
      const queenPiece = document.getElementById("queenHero");
      if (queenPiece && f3Square && d1Square) {
        d1Square.innerHTML = "";
        f3Square.innerHTML = '<span class="piece white moved-animated" id="queenHero">♕</span>';
        f3Square.classList.add("selected");
      }

      animateBtn.innerHTML = '<span class="play-icon">↺</span> Reset Board';
      step = 2;
    } else {
      // Reset position
      if (d1Square) {
        d1Square.innerHTML = '<span class="piece white highlight-queen" id="queenHero">♕</span>';
      }
      if (f3Square) {
        f3Square.innerHTML = '<span class="piece white">♘</span>';
      }
      document.querySelectorAll(".square").forEach((sq) => sq.classList.remove("selected", "highlight-move"));
      animateBtn.innerHTML = '<span class="play-icon">▶</span> Animate Move';
      step = 0;
    }
  });

  // Enable square clicking inspection
  heroBoard.querySelectorAll(".square").forEach((sq) => {
    sq.addEventListener("click", () => {
      heroBoard.querySelectorAll(".square").forEach((s) => s.classList.remove("selected"));
      sq.classList.add("selected");
    });
  });
}

/* ==========================================================================
   6. DAILY PUZZLE INTERACTIVE WIDGET
   ========================================================================== */
function initDailyPuzzle() {
  const hintBtn = document.getElementById("puzzleHintBtn");
  const solveBtn = document.getElementById("puzzleSolveBtn");
  const feedback = document.getElementById("puzzleFeedback");
  const puzzleBoard = document.getElementById("puzzleBoard");

  if (!hintBtn || !solveBtn || !feedback) return;

  hintBtn.addEventListener("click", () => {
    feedback.className = "puzzle-feedback hint";
    feedback.innerHTML = `<strong>💡 Tactical Hint:</strong> Notice that Black's king on f8 is trapped by its own pieces. Look for a diagonal deflection starting with White's Queen sacrifice on c6 or Bishop check!`;
  });

  solveBtn.addEventListener("click", () => {
    feedback.className = "puzzle-feedback success";
    feedback.innerHTML = `<strong>🎉 Brilliant Solution (1. Qxc6+! bxc6 2. Ba6#):</strong><br>
White sacrifices the Queen to deflect Black's b-pawn. Once the diagonal clears, White delivers Boden's criss-cross checkmate with the bishop pair!`;

    // Highlight the key squares on the puzzle board
    if (puzzleBoard) {
      const squares = puzzleBoard.querySelectorAll(".square");
      squares.forEach((sq) => sq.classList.remove("selected"));

      // Select White Queen & target square
      const qSquare = document.getElementById("puzzleQueen")?.parentElement;
      if (qSquare) qSquare.classList.add("selected");
    }
  });
}

/* ==========================================================================
   7. REGISTRATION FORM VALIDATION & CONFIRMATION
   ========================================================================== */
function initRegistrationForm() {
  const form = document.getElementById("registrationForm");
  const confCard = document.getElementById("confirmationCard");
  const newRegBtn = document.getElementById("newRegistrationBtn");

  if (!form || !confCard) return;

  // Form Fields
  const nameInput = document.getElementById("fullName");
  const emailInput = document.getElementById("emailAddress");
  const phoneInput = document.getElementById("phoneNumber");
  const ageSelect = document.getElementById("studentAge");
  const courseSelect = document.getElementById("selectedCourse");
  const termsCheck = document.getElementById("termsCheck");

  // Error placeholders
  const nameError = document.getElementById("nameError");
  const emailError = document.getElementById("emailError");
  const phoneError = document.getElementById("phoneError");
  const ageError = document.getElementById("ageError");
  const courseError = document.getElementById("courseError");
  const termsError = document.getElementById("termsError");

  function clearErrors() {
    [nameError, emailError, phoneError, ageError, courseError, termsError].forEach((el) => {
      if (el) el.textContent = "";
    });
    form.querySelectorAll(".input-error").forEach((el) => el.classList.remove("input-error"));
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validatePhone(phone) {
    return /^[\d\s\+\-\(\)]{7,20}$/.test(phone.trim());
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors();

    let isValid = true;

    // 1. Full Name Validation
    if (!nameInput.value.trim() || nameInput.value.trim().length < 2) {
      nameError.textContent = "Please enter your full name (minimum 2 characters).";
      nameInput.classList.add("input-error");
      isValid = false;
    }

    // 2. Email Validation
    if (!emailInput.value.trim() || !validateEmail(emailInput.value.trim())) {
      emailError.textContent = "Please enter a valid email address (e.g. name@domain.com).";
      emailInput.classList.add("input-error");
      isValid = false;
    }

    // 3. Phone Validation
    if (!phoneInput.value.trim() || !validatePhone(phoneInput.value.trim())) {
      phoneError.textContent = "Please enter a valid phone number with area code.";
      phoneInput.classList.add("input-error");
      isValid = false;
    }

    // 4. Age Category Validation
    if (!ageSelect.value) {
      ageError.textContent = "Please select the student age category.";
      ageSelect.classList.add("input-error");
      isValid = false;
    }

    // 5. Course Selection Validation
    if (!courseSelect.value) {
      courseError.textContent = "Please select a training course.";
      courseSelect.classList.add("input-error");
      isValid = false;
    }

    // 6. Terms Checkbox Validation
    if (!termsCheck.checked) {
      termsError.textContent = "You must agree to the academy training guidelines.";
      isValid = false;
    }

    if (!isValid) {
      // Focus on first invalid input
      const firstInvalid = form.querySelector(".input-error");
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    // Process Registration & Populate Confirmation Card
    const formatValue = form.querySelector('input[name="format"]:checked')?.value || "Online Interactive";
    const randomId = "VCA-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000);

    document.getElementById("confName").textContent = nameInput.value.trim();
    document.getElementById("confCourse").textContent = courseSelect.value;
    document.getElementById("confFormat").textContent = formatValue;
    document.getElementById("confCategory").textContent = ageSelect.value;
    document.getElementById("confRegId").textContent = randomId;

    // Display confirmation card and hide form
    form.style.display = "none";
    confCard.style.display = "block";

    // Scroll to confirmation card smoothly
    confCard.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Reset & Register Another Student
  if (newRegBtn) {
    newRegBtn.addEventListener("click", () => {
      form.reset();
      clearErrors();
      confCard.style.display = "none";
      form.style.display = "block";
      nameInput.focus();
    });
  }
}

/* ==========================================================================
   8. FAQ ACCORDION
   ========================================================================== */
function initFaqAccordion() {
  const items = document.querySelectorAll(".accordion-item");

  items.forEach((item) => {
    const header = item.querySelector(".accordion-header");
    if (!header) return;

    header.addEventListener("click", () => {
      const isActive = item.classList.contains("active");

      // Optional: Close other items
      items.forEach((other) => {
        other.classList.remove("active");
        const otherHeader = other.querySelector(".accordion-header");
        if (otherHeader) otherHeader.setAttribute("aria-expanded", "false");
      });

      if (!isActive) {
        item.classList.add("active");
        header.setAttribute("aria-expanded", "true");
      } else {
        item.classList.remove("active");
        header.setAttribute("aria-expanded", "false");
      }
    });
  });
}
