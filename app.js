(() => {
  "use strict";

  const database = window.SDLT_DATA;
  if (!database || !Array.isArray(database.questions)) {
    document.body.innerHTML = "<p style='padding:32px;font-family:sans-serif'>题库数据加载失败，请确认 data/questions.js 与 index.html 位于同一文件夹。</p>";
    return;
  }

  const STORAGE_KEY = "safedrive-dlt-local-exam-v1";
  const ISSUE_API = "/api/feedback";
  const ISSUE_TYPE_LABELS = {
    translation: "中文翻译不准确",
    image: "图片错误或缺失",
    answer: "答案或解释有疑问",
    content: "题目或选项内容问题",
    other: "其他问题",
  };
  const KEYBOARD_OPTION_MAP = {
    Digit1: "A", Digit2: "B", Digit3: "C", Digit4: "D",
    Numpad1: "A", Numpad2: "B", Numpad3: "C", Numpad4: "D",
  };
  const questions = database.questions;
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const allIds = questions.map((question) => question.id);
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const defaultStore = {
    favorites: [],
    wrong: [],
    attempts: {},
    progress: { sequential: 0, categories: {} },
    preferences: { language: "zh" },
    examHistory: [],
  };

  function loadStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return structuredClone(defaultStore);
      return {
        ...structuredClone(defaultStore),
        ...parsed,
        progress: { ...defaultStore.progress, ...(parsed.progress || {}), categories: { ...(parsed.progress?.categories || {}) } },
        preferences: { ...defaultStore.preferences, ...(parsed.preferences || {}) },
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((id) => questionById.has(id)) : [],
        wrong: Array.isArray(parsed.wrong) ? parsed.wrong.filter((id) => questionById.has(id)) : [],
        examHistory: Array.isArray(parsed.examHistory) ? parsed.examHistory.slice(0, 10) : [],
      };
    } catch {
      return structuredClone(defaultStore);
    }
  }

  let store = loadStore();
  let session = null;
  let examInterval = null;
  let lastExamWrongIds = [];
  let searchResultIds = [];
  let issueReports = [];
  let issueSyncAvailable = false;

  const elements = {
    dashboard: $("#dashboardView"), quiz: $("#quizView"), categorySelect: $("#categorySelect"),
    wrongBadge: $("#wrongBadge"), favoriteBadge: $("#favoriteBadge"), issueBadge: $("#issueBadge"), databaseCount: $("#databaseCount"),
    metricPracticed: $("#metricPracticed"), metricAccuracy: $("#metricAccuracy"), metricAttempts: $("#metricAttempts"),
    metricWrong: $("#metricWrong"), metricFavorites: $("#metricFavorites"), coveragePercent: $("#coveragePercent"),
    coverageBar: $("#coverageBar"), coverageText: $("#coverageText"), remainingText: $("#remainingText"),
    examHistory: $("#examHistory"), searchForm: $("#searchForm"), searchInput: $("#searchInput"),
    searchPanel: $("#searchResultsPanel"), searchTitle: $("#searchResultsTitle"), searchResults: $("#searchResults"),
    sessionMode: $("#sessionMode"), sessionTitle: $("#sessionTitle"), examTimer: $("#examTimer"),
    sessionProgress: $("#sessionProgressBar"), questionPosition: $("#questionPosition"), questionId: $("#questionId"),
    categoryZh: $("#categoryZh"), imageWarning: $("#imageWarning"), questionZh: $("#questionZh"),
    questionThaiBlock: $("#questionThaiBlock"), questionTh: $("#questionTh"), showOriginal: $("#showOriginal"),
    questionImages: $("#questionImages"), optionsList: $("#optionsList"), feedback: $("#feedback"),
    favoriteButton: $("#favoriteButton"), prevQuestion: $("#prevQuestion"), nextQuestion: $("#nextQuestion"),
    finishExam: $("#finishExam"), answeredHint: $("#answeredHint"), sessionAnswered: $("#sessionAnswered"),
    sessionCorrect: $("#sessionCorrect"), sessionAccuracy: $("#sessionAccuracy"), modeTip: $("#modeTip"),
    examNavigatorCard: $("#examNavigatorCard"), examNavigator: $("#examNavigator"), examAnsweredCount: $("#examAnsweredCount"),
    imageDialog: $("#imageDialog"), dialogImage: $("#dialogImage"), resultDialog: $("#examResultDialog"),
    resultIcon: $("#resultIcon"), resultTitle: $("#resultTitle"), resultScore: $("#resultScore"),
    resultSummary: $("#resultSummary"), resultCorrect: $("#resultCorrect"), resultWrong: $("#resultWrong"),
    resultUnanswered: $("#resultUnanswered"), issueDialog: $("#issueDialog"), issueForm: $("#issueForm"),
    issueQuestionId: $("#issueQuestionId"), issueType: $("#issueType"), issueDescription: $("#issueDescription"),
    issueContext: $("#issueContext"), issueSaveMessage: $("#issueSaveMessage"), issueSyncStatus: $("#issueSyncStatus"),
    issueRecordCount: $("#issueRecordCount"), issueList: $("#issueList"), questionIdList: $("#questionIdList"),
  };

  function saveStore() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* The app remains usable without persistence. */ }
  }

  function currentQuestion() {
    if (!session) return null;
    return questionById.get(session.queue[session.index]) || null;
  }

  function buildIssueSnapshot(question) {
    if (!question) return null;
    return {
      id: question.id,
      fingerprint: question.fingerprint,
      category_zh: question.category_zh,
      category_th: question.category_th,
      question_zh: question.question_zh,
      question_th: question.question_th,
      options: question.options.map((option) => ({
        key: option.key,
        text_zh: option.text_zh,
        text_th: option.text_th,
        images: [...(option.images || [])],
      })),
      question_images: [...(question.question_images || [])],
      image_status: question.image_status,
      image_note: question.image_note || "",
      correct_answer: question.correct_answer,
      answer_status: question.answer_status,
    };
  }

  function setIssueSyncState(available, message) {
    issueSyncAvailable = available;
    elements.issueSyncStatus.className = `issue-sync-status ${available ? "online" : "offline"}`;
    elements.issueSyncStatus.querySelector("strong").textContent = message;
    elements.issueForm.querySelector("button[type='submit']").disabled = !available;
  }

  async function issueApi(path = ISSUE_API, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (!response.ok) throw new Error(`反馈服务返回 ${response.status}`);
    return response.status === 204 ? null : response.json();
  }

  async function refreshIssueReports() {
    elements.issueSyncStatus.className = "issue-sync-status checking";
    elements.issueSyncStatus.querySelector("strong").textContent = "正在检查项目同步";
    try {
      const payload = await issueApi();
      issueReports = Array.isArray(payload.feedback) ? payload.feedback : [];
      setIssueSyncState(true, "已同步到项目文件");
    } catch {
      issueReports = [];
      setIssueSyncState(false, "未连接本地反馈服务");
    }
    renderIssueReports();
  }

  function renderIssueReports() {
    const openCount = issueReports.filter((report) => report.status !== "resolved").length;
    elements.issueBadge.textContent = openCount;
    elements.issueRecordCount.textContent = `${issueReports.length} 条 · ${openCount} 条待处理`;
    if (!issueReports.length) {
      const empty = document.createElement("div");
      empty.className = "issue-empty";
      empty.textContent = issueSyncAvailable ? "还没有记录问题" : "请双击 start-local.cmd 启动题库，反馈才能直接写入项目文件。";
      elements.issueList.replaceChildren(empty);
      return;
    }

    const rows = [...issueReports].sort((left, right) => String(right.created_at).localeCompare(String(left.created_at))).map((report) => {
      const row = document.createElement("article");
      row.className = `issue-item${report.status === "resolved" ? " resolved" : ""}`;
      const header = document.createElement("div");
      header.className = "issue-item-header";
      const labels = document.createElement("div");
      const questionId = document.createElement("span");
      questionId.className = "issue-item-id";
      questionId.textContent = report.question_id || "全局反馈";
      const type = document.createElement("span");
      type.className = "issue-type-chip";
      type.textContent = ISSUE_TYPE_LABELS[report.type] || ISSUE_TYPE_LABELS.other;
      labels.append(questionId, type);
      if (report.status === "resolved") {
        const status = document.createElement("span");
        status.className = "issue-status-chip";
        status.textContent = "已处理";
        labels.append(status);
      }
      const time = document.createElement("time");
      time.dateTime = report.created_at || "";
      time.textContent = report.created_at ? new Date(report.created_at).toLocaleString("zh-CN") : "";
      header.append(labels, time);
      const description = document.createElement("p");
      description.textContent = report.description || "";
      const actions = document.createElement("div");
      actions.className = "issue-item-actions";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.textContent = report.status === "resolved" ? "重新打开" : "标记已处理";
      toggle.addEventListener("click", async () => {
        await updateIssueReport(report.id, { status: report.status === "resolved" ? "open" : "resolved" });
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "删除";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`确定删除 ${report.question_id || "这条"} 反馈吗？`)) return;
        await deleteIssueReport(report.id);
      });
      actions.append(toggle, remove);
      row.append(header, description, actions);
      return row;
    });
    elements.issueList.replaceChildren(...rows);
  }

  async function updateIssueReport(id, changes) {
    try {
      const payload = await issueApi(`${ISSUE_API}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) });
      issueReports = payload.feedback;
      renderIssueReports();
    } catch {
      setIssueSyncState(false, "写入失败，请重新用启动脚本打开");
    }
  }

  async function deleteIssueReport(id) {
    try {
      const payload = await issueApi(`${ISSUE_API}/${encodeURIComponent(id)}`, { method: "DELETE" });
      issueReports = payload.feedback;
      renderIssueReports();
    } catch {
      setIssueSyncState(false, "删除失败，请重新用启动脚本打开");
    }
  }

  function updateIssueContext() {
    const id = elements.issueQuestionId.value.trim().toUpperCase();
    const question = questionById.get(id);
    elements.issueContext.textContent = question ? `${question.id} · ${question.category_zh}` : id ? "题号未找到" : "未关联题目";
  }

  async function openIssueCenter() {
    const question = currentQuestion();
    elements.issueQuestionId.value = question?.id || "";
    elements.issueType.value = "translation";
    elements.issueDescription.value = "";
    elements.issueSaveMessage.textContent = "";
    updateIssueContext();
    if (!elements.issueDialog.open) elements.issueDialog.showModal();
    await refreshIssueReports();
    (question ? elements.issueDescription : elements.issueQuestionId).focus();
  }

  function resetIssueForm() {
    const question = currentQuestion();
    elements.issueQuestionId.value = question?.id || "";
    elements.issueType.value = "translation";
    elements.issueDescription.value = "";
    elements.issueSaveMessage.textContent = "";
    updateIssueContext();
  }

  async function saveIssueReport(event) {
    event.preventDefault();
    const questionId = elements.issueQuestionId.value.trim().toUpperCase();
    const question = questionId ? questionById.get(questionId) : null;
    elements.issueQuestionId.setCustomValidity(questionId && !question ? "请输入有效的 SDLT 题目编号" : "");
    if (!elements.issueForm.reportValidity()) return;
    if (!issueSyncAvailable) {
      elements.issueSaveMessage.textContent = "请先通过 start-local.cmd 启动题库。";
      return;
    }

    const report = {
      id: `FB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      question_id: question?.id || null,
      type: ISSUE_TYPE_LABELS[elements.issueType.value] ? elements.issueType.value : "other",
      description: elements.issueDescription.value.trim(),
      status: "open",
      created_at: new Date().toISOString(),
      context: {
        practice_mode: session?.mode || "dashboard",
        selected_answer: question && session ? (session.answers[question.id] || null) : null,
      },
      question_snapshot: buildIssueSnapshot(question),
    };

    try {
      const payload = await issueApi(ISSUE_API, { method: "POST", body: JSON.stringify(report) });
      issueReports = payload.feedback;
      elements.issueDescription.value = "";
      elements.issueSaveMessage.textContent = "已保存到 feedback/issues.json";
      renderIssueReports();
    } catch {
      setIssueSyncState(false, "写入失败，请重新用启动脚本打开");
      elements.issueSaveMessage.textContent = "反馈未保存。";
    }
  }

  function shuffle(values) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  }

  function setNavActive(mode = "home") {
    $$(".nav-button").forEach((button) => {
      button.classList.toggle("active", mode === "home" ? button.dataset.action === "home" : button.dataset.mode === mode);
    });
  }

  function recordAttempt(id, isCorrect, selectedKey) {
    const previous = store.attempts[id] || { total: 0, correct: 0 };
    previous.total += 1;
    if (isCorrect === true) previous.correct += 1;
    previous.lastAnswer = selectedKey ?? null;
    previous.lastCorrect = isCorrect;
    previous.lastAt = new Date().toISOString();
    store.attempts[id] = previous;

    const wrongSet = new Set(store.wrong);
    if (isCorrect === false) wrongSet.add(id);
    if (isCorrect === true) wrongSet.delete(id);
    store.wrong = [...wrongSet];
  }

  function renderDashboard() {
    const attemptEntries = Object.values(store.attempts).filter((item) => item.total > 0);
    const practiced = attemptEntries.length;
    const totalAttempts = attemptEntries.reduce((sum, item) => sum + item.total, 0);
    const totalCorrect = attemptEntries.reduce((sum, item) => sum + item.correct, 0);
    const accuracy = totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : null;
    const coverage = Math.round((practiced / questions.length) * 100);

    elements.metricPracticed.textContent = practiced;
    elements.metricAccuracy.textContent = accuracy === null ? "—" : `${accuracy}%`;
    elements.metricAttempts.textContent = totalAttempts ? `累计作答 ${totalAttempts} 次` : "尚未作答";
    elements.metricWrong.textContent = store.wrong.length;
    elements.metricFavorites.textContent = store.favorites.length;
    elements.wrongBadge.textContent = store.wrong.length;
    elements.favoriteBadge.textContent = store.favorites.length;
    elements.databaseCount.textContent = questions.length;
    elements.coveragePercent.textContent = `${coverage}%`;
    elements.coverageBar.style.width = `${coverage}%`;
    elements.coverageText.textContent = `${practiced} / ${questions.length} 已练`;
    elements.remainingText.textContent = `剩余 ${questions.length - practiced} 道`;

    if (!store.examHistory.length) {
      elements.examHistory.className = "empty-state";
      elements.examHistory.textContent = "尚无模拟考试记录";
    } else {
      elements.examHistory.className = "history-list";
      elements.examHistory.replaceChildren(...store.examHistory.slice(0, 4).map((record) => {
        const row = document.createElement("div");
        row.className = "history-item";
        const left = document.createElement("div");
        const title = document.createElement("b");
        const date = document.createElement("span");
        title.textContent = "50题模拟考试";
        date.textContent = new Date(record.date).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
        left.append(title, date);
        const score = document.createElement("strong");
        score.className = record.score >= 45 ? "pass" : "fail";
        score.textContent = `${record.score} / 50`;
        row.append(left, score);
        return row;
      }));
    }
  }

  function showDashboard(force = false) {
    if (!force && session?.exam && !session.completed && Object.keys(session.answers).length > 0) {
      if (!window.confirm("模拟考试尚未提交，返回后本次答题将不会保存。确定离开吗？")) return false;
    }
    stopExamTimer();
    session = null;
    elements.quiz.classList.add("hidden");
    elements.dashboard.classList.remove("hidden");
    setNavActive("home");
    renderDashboard();
    window.scrollTo({ top: 0, behavior: "auto" });
    return true;
  }

  function categoryKey(question) {
    return `${question.category_zh}\u0000${question.category_th}`;
  }

  function startSession(mode, options = {}) {
    if (session?.exam && !session.completed && Object.keys(session.answers).length > 0) {
      if (!window.confirm("开始其他练习会放弃当前模拟考试，确定继续吗？")) return;
    }
    stopExamTimer();

    let queue = [];
    let title = "全部题目";
    let startIndex = 0;
    if (mode === "sequential") {
      queue = [...allIds];
      title = "全部题目 · 按稳定ID排序";
      startIndex = Math.min(Number(store.progress.sequential) || 0, queue.length - 1);
    } else if (mode === "random") {
      queue = shuffle(allIds);
      title = "全部题目 · 随机顺序";
    } else if (mode === "wrong") {
      queue = store.wrong.filter((id) => questionById.has(id));
      title = "当前错题集";
    } else if (mode === "favorites") {
      queue = store.favorites.filter((id) => questionById.has(id));
      title = "我的收藏题目";
    } else if (mode === "category") {
      const key = options.categoryKey;
      queue = allIds.filter((id) => categoryKey(questionById.get(id)) === key);
      const sample = queue.length ? questionById.get(queue[0]) : null;
      title = sample ? `${sample.category_zh} · ${queue.length}题` : "分类练习";
      startIndex = Math.min(Number(store.progress.categories[key]) || 0, Math.max(queue.length - 1, 0));
    } else if (mode === "exam") {
      queue = shuffle(allIds).slice(0, 50);
      title = "正式模拟 · 50题 / 60分钟";
    } else if (mode === "search") {
      queue = options.ids || [];
      title = `搜索结果 · ${queue.length}题`;
      startIndex = Math.max(0, options.startIndex || 0);
    } else if (mode === "review") {
      queue = options.ids || [];
      title = `考试错题回顾 · ${queue.length}题`;
    }

    if (!queue.length) {
      const messages = {
        wrong: "当前没有错题。做错的题目会自动加入这里。",
        favorites: "当前没有收藏题目。可在题目右上角点击收藏。",
        category: "该分类没有可用题目。",
        review: "本次考试没有需要回顾的错题。",
      };
      window.alert(messages[mode] || "没有找到可练习的题目。");
      showDashboard(true);
      return;
    }

    session = {
      mode,
      title,
      queue,
      index: startIndex,
      answers: {},
      results: {},
      optionOrders: {},
      answered: 0,
      correct: 0,
      exam: mode === "exam",
      completed: false,
      originalShown: false,
      remainingSeconds: 3600,
      startedAt: Date.now(),
      categoryKey: options.categoryKey || null,
    };

    elements.dashboard.classList.add("hidden");
    elements.quiz.classList.remove("hidden");
    setNavActive(mode === "category" || mode === "search" || mode === "review" ? "" : mode);
    if (session.exam) startExamTimer();
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function createImage(relativePath, alt) {
    const image = document.createElement("img");
    image.src = relativePath;
    image.alt = alt;
    image.loading = "eager";
    image.addEventListener("click", () => {
      elements.dialogImage.src = relativePath;
      elements.imageDialog.showModal();
    });
    return image;
  }

  function currentLanguage() {
    return store.preferences.language || "zh";
  }

  function orderedOptions(question) {
    if (!session.optionOrders[question.id]) {
      session.optionOrders[question.id] = shuffle(question.options.map((option) => option.key));
    }
    const optionByKey = new Map(question.options.map((option) => [option.key, option]));
    return session.optionOrders[question.id].map((key) => optionByKey.get(key)).filter(Boolean);
  }

  function renderQuestion() {
    if (!session) return;
    const id = session.queue[session.index];
    const question = questionById.get(id);
    const language = currentLanguage();
    const practiceResult = session.results[id];
    const selected = session.answers[id] || practiceResult?.key || null;
    const progress = ((session.index + 1) / session.queue.length) * 100;

    elements.sessionMode.textContent = ({ sequential: "顺序练习", random: "随机练习", wrong: "错题练习", favorites: "收藏练习", category: "分类练习", search: "搜索练习", review: "错题回顾", exam: "模拟考试" })[session.mode] || "练习";
    elements.sessionTitle.textContent = session.title;
    elements.sessionProgress.style.width = `${progress}%`;
    elements.questionPosition.textContent = `第 ${session.index + 1} / ${session.queue.length} 题`;
    elements.questionId.textContent = question.id;
    elements.categoryZh.textContent = language === "th" ? question.category_th : question.category_zh;
    const hasImageNotice = question.image_status === "partial" || question.image_status === "substituted";
    elements.imageWarning.classList.toggle("hidden", !hasImageNotice);
    elements.imageWarning.textContent = question.image_status === "substituted" ? "采用SafeDrive同题图组" : "部分原图未取得";
    elements.imageWarning.title = question.image_note || "";
    elements.questionZh.textContent = language === "th" ? question.question_th : question.question_zh;
    elements.questionTh.textContent = question.question_th;
    const showThaiBlock = language === "both" || (language === "zh" && session.originalShown);
    elements.questionThaiBlock.classList.toggle("hidden", !showThaiBlock);
    elements.showOriginal.classList.toggle("hidden", language !== "zh");
    elements.showOriginal.textContent = session.originalShown ? "收起泰文原文" : "显示泰文原文";
    elements.favoriteButton.classList.toggle("active", store.favorites.includes(id));
    elements.favoriteButton.textContent = store.favorites.includes(id) ? "★ 已收藏" : "☆ 收藏";

    elements.questionImages.replaceChildren(...(question.question_images || []).map((path, index) => createImage(path, `${question.id} 题目图片 ${index + 1}`)));
    elements.optionsList.replaceChildren(...orderedOptions(question).map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-button";
      button.dataset.key = option.key;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", selected === option.key ? "true" : "false");
      if (!session.exam && practiceResult) button.disabled = true;

      if (session.exam && selected === option.key) button.classList.add("selected");
      if (!session.exam && practiceResult) {
        if (option.key === question.correct_answer && question.answer_status === "confirmed") button.classList.add("correct");
        if (option.key === practiceResult.key && practiceResult.correct === false) button.classList.add("incorrect");
        if (option.key === practiceResult.key && practiceResult.correct === null) button.classList.add("selected");
      }

      const key = document.createElement("span");
      key.className = "option-key";
      key.append(document.createTextNode(option.key));
      const shortcut = document.createElement("small");
      shortcut.className = "option-shortcut";
      const shortcutNumber = { A: 1, B: 2, C: 3, D: 4 }[option.key];
      shortcut.textContent = String(shortcutNumber);
      shortcut.title = `小键盘 ${shortcutNumber}`;
      key.append(shortcut);
      const content = document.createElement("span");
      content.className = "option-text";
      if (language === "th") {
        content.append(document.createTextNode(option.text_th || "内容见图片"));
      } else {
        content.append(document.createTextNode(option.text_zh || "内容见图片"));
        if (language === "both") {
          const thai = document.createElement("span");
          thai.className = "option-th";
          thai.textContent = option.text_th || "รายละเอียดตามภาพ";
          content.append(thai);
        }
      }
      if (option.images?.length) {
        const images = document.createElement("span");
        images.className = "option-images";
        option.images.forEach((path, index) => images.append(createImage(path, `${question.id} 选项 ${option.key} 图片 ${index + 1}`)));
        content.append(images);
      }
      button.append(key, content);
      button.addEventListener("click", () => answerQuestion(option.key));
      return button;
    }));

    renderFeedback(question, practiceResult, selected);
    elements.prevQuestion.disabled = session.index === 0;
    elements.nextQuestion.textContent = session.index === session.queue.length - 1 ? (session.exam ? "最后一题" : "完成本组") : "下一题";
    elements.nextQuestion.disabled = session.exam && session.index === session.queue.length - 1;
    elements.finishExam.classList.toggle("hidden", !session.exam);
    elements.examTimer.classList.toggle("hidden", !session.exam);
    elements.examNavigatorCard.classList.toggle("hidden", !session.exam);
    elements.modeTip.textContent = session.exam ? "选项顺序每轮随机；考试期间只保存选择。键盘 1/2/3/4 对应 A/B/C/D。" : "选项顺序每轮随机且本轮保持稳定。键盘 1/2/3/4 对应 A/B/C/D。";
    updateSessionStats();
    if (session.exam) renderExamNavigator();
  }

  function renderFeedback(question, result, selected) {
    elements.feedback.className = "feedback hidden";
    elements.feedback.replaceChildren();
    if (session.exam) {
      elements.answeredHint.textContent = selected ? "答案已保存，可随时修改" : "请选择一个答案";
      return;
    }
    if (!result) {
      elements.answeredHint.textContent = "请选择一个答案";
      return;
    }
    const detail = document.createElement("small");
    if (result.correct === true) {
      elements.feedback.className = "feedback correct";
      elements.feedback.append(document.createTextNode("回答正确"));
      detail.textContent = question.explanation_zh || "正确答案来自 SafeDrive 页面提供的可验证数据。";
    } else if (result.correct === false) {
      elements.feedback.className = "feedback incorrect";
      elements.feedback.append(document.createTextNode(`回答错误，正确答案为 ${question.correct_answer}`));
      detail.textContent = question.explanation_zh || "本题已加入错题集；再次答对后会自动移出。";
    } else {
      elements.feedback.className = "feedback unknown";
      elements.feedback.append(document.createTextNode("本题未从 SafeDrive 取得可验证的标准答案。"));
      detail.textContent = "本次选择已记录，但不计入正确率。";
    }
    elements.feedback.append(detail);
    elements.answeredHint.textContent = result.correct === null ? "答案状态未知" : result.correct ? "本题回答正确" : "本题已加入错题集";
  }

  function answerQuestion(key) {
    if (!session) return;
    const id = session.queue[session.index];
    const question = questionById.get(id);
    if (session.exam) {
      session.answers[id] = key;
      renderQuestion();
      return;
    }
    if (session.results[id]) return;
    let correct = null;
    if (question.answer_status === "confirmed" && question.correct_answer) correct = key === question.correct_answer;
    session.results[id] = { key, correct };
    session.answers[id] = key;
    session.answered += 1;
    if (correct === true) session.correct += 1;
    if (correct !== null) recordAttempt(id, correct, key);
    saveStore();
    renderQuestion();
    renderDashboard();
  }

  function navigateQuestion(direction) {
    if (!session) return;
    const nextIndex = session.index + direction;
    if (nextIndex < 0) return;
    if (nextIndex >= session.queue.length) {
      if (!session.exam) showDashboard(true);
      return;
    }
    session.index = nextIndex;
    session.originalShown = false;
    if (session.mode === "sequential") store.progress.sequential = session.index;
    if (session.mode === "category" && session.categoryKey) store.progress.categories[session.categoryKey] = session.index;
    saveStore();
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateSessionStats() {
    const answered = session.exam ? Object.keys(session.answers).length : session.answered;
    const accuracy = session.answered ? Math.round((session.correct / session.answered) * 100) : null;
    elements.sessionAnswered.textContent = answered;
    elements.sessionCorrect.textContent = session.exam ? "—" : session.correct;
    elements.sessionAccuracy.textContent = session.exam ? "—" : accuracy === null ? "—" : `${accuracy}%`;
  }

  function toggleFavorite() {
    if (!session) return;
    const id = session.queue[session.index];
    const favoriteSet = new Set(store.favorites);
    if (favoriteSet.has(id)) favoriteSet.delete(id); else favoriteSet.add(id);
    store.favorites = [...favoriteSet];
    saveStore();
    renderQuestion();
    renderDashboard();
  }

  function updateTimerDisplay() {
    if (!session?.exam) return;
    const minutes = Math.floor(session.remainingSeconds / 60);
    const seconds = session.remainingSeconds % 60;
    elements.examTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    elements.examTimer.classList.toggle("urgent", session.remainingSeconds <= 300);
  }

  function startExamTimer() {
    updateTimerDisplay();
    examInterval = window.setInterval(() => {
      if (!session?.exam || session.completed) return stopExamTimer();
      session.remainingSeconds -= 1;
      updateTimerDisplay();
      if (session.remainingSeconds <= 0) submitExam(true);
    }, 1000);
  }

  function stopExamTimer() {
    if (examInterval) window.clearInterval(examInterval);
    examInterval = null;
  }

  function renderExamNavigator() {
    const buttons = session.queue.map((id, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = index + 1;
      button.classList.toggle("answered", Boolean(session.answers[id]));
      button.classList.toggle("current", index === session.index);
      button.setAttribute("aria-label", `跳转到第 ${index + 1} 题`);
      button.addEventListener("click", () => {
        session.index = index;
        session.originalShown = false;
        renderQuestion();
      });
      return button;
    });
    elements.examNavigator.replaceChildren(...buttons);
    elements.examAnsweredCount.textContent = `${Object.keys(session.answers).length} / ${session.queue.length}`;
  }

  function submitExam(autoSubmit = false) {
    if (!session?.exam || session.completed) return;
    const answeredCount = Object.keys(session.answers).length;
    if (!autoSubmit && answeredCount < session.queue.length) {
      if (!window.confirm(`还有 ${session.queue.length - answeredCount} 道题未作答。确定提交试卷吗？`)) return;
    }
    stopExamTimer();
    let score = 0;
    let unanswered = 0;
    const wrongIds = [];
    for (const id of session.queue) {
      const question = questionById.get(id);
      const selected = session.answers[id] || null;
      if (!selected) unanswered += 1;
      if (question.answer_status !== "confirmed" || !question.correct_answer) continue;
      const correct = selected === question.correct_answer;
      if (correct) score += 1; else wrongIds.push(id);
      recordAttempt(id, correct, selected);
    }
    session.completed = true;
    session.score = score;
    lastExamWrongIds = wrongIds;
    store.examHistory.unshift({
      date: new Date().toISOString(), score, total: session.queue.length, answered: answeredCount,
      durationSeconds: 3600 - session.remainingSeconds,
    });
    store.examHistory = store.examHistory.slice(0, 10);
    saveStore();
    renderDashboard();

    const passed = score >= 45;
    elements.resultIcon.className = `result-icon${passed ? "" : " fail"}`;
    elements.resultIcon.textContent = passed ? "✓" : "!";
    elements.resultTitle.textContent = passed ? "考试通过" : "还差一点，再练一次";
    elements.resultScore.textContent = score;
    elements.resultSummary.textContent = autoSubmit ? "考试时间已到，系统已自动提交。" : passed ? "达到 90% 的模拟考试通过标准。" : "模拟考试需答对至少 45 题。错题已经加入错题集。";
    elements.resultCorrect.textContent = score;
    elements.resultWrong.textContent = session.queue.length - score - unanswered;
    elements.resultUnanswered.textContent = unanswered;
    $("#reviewExam").disabled = wrongIds.length === 0;
    elements.resultDialog.showModal();
  }

  function performSearch(query) {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) {
      elements.searchPanel.classList.add("hidden");
      return;
    }
    searchResultIds = allIds.filter((id) => {
      const question = questionById.get(id);
      const text = [question.id, question.category_zh, question.category_th, question.question_zh, question.question_th,
        ...question.options.flatMap((option) => [option.text_zh, option.text_th])].join("\n").toLocaleLowerCase();
      return text.includes(needle);
    });
    elements.searchTitle.textContent = `“${query.trim()}” · ${searchResultIds.length} 条结果`;
    if (!searchResultIds.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "没有找到匹配题目";
      elements.searchResults.replaceChildren(empty);
    } else {
      elements.searchResults.replaceChildren(...searchResultIds.slice(0, 200).map((id, index) => {
        const question = questionById.get(id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "search-result";
        const idElement = document.createElement("b");
        const title = document.createElement("p");
        const category = document.createElement("span");
        idElement.textContent = id;
        title.textContent = question.question_zh;
        category.textContent = question.category_zh;
        button.append(idElement, title, category);
        button.addEventListener("click", () => startSession("search", { ids: searchResultIds, startIndex: index }));
        return button;
      }));
    }
    elements.searchPanel.classList.remove("hidden");
    elements.searchPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function populateCategories() {
    const groups = new Map();
    for (const question of questions) {
      const key = categoryKey(question);
      if (!groups.has(key)) groups.set(key, { key, zh: question.category_zh, th: question.category_th, count: 0 });
      groups.get(key).count += 1;
    }
    const options = [...groups.values()].sort((left, right) => left.zh.localeCompare(right.zh, "zh-CN")).map((category) => {
      const option = document.createElement("option");
      option.value = category.key;
      option.textContent = `${category.zh}（${category.count}）`;
      option.title = category.th;
      return option;
    });
    elements.categorySelect.replaceChildren(...options);
  }

  $$("[data-mode]").forEach((button) => button.addEventListener("click", () => startSession(button.dataset.mode)));
  $("[data-action='home']").addEventListener("click", () => showDashboard());
  $("#startCategory").addEventListener("click", () => startSession("category", { categoryKey: elements.categorySelect.value }));
  $("#backHome").addEventListener("click", () => showDashboard());
  elements.prevQuestion.addEventListener("click", () => navigateQuestion(-1));
  elements.nextQuestion.addEventListener("click", () => navigateQuestion(1));
  elements.finishExam.addEventListener("click", () => submitExam(false));
  elements.favoriteButton.addEventListener("click", toggleFavorite);
  elements.showOriginal.addEventListener("click", () => { session.originalShown = !session.originalShown; renderQuestion(); });
  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (showDashboard(false)) performSearch(elements.searchInput.value);
  });
  $("#closeSearch").addEventListener("click", () => elements.searchPanel.classList.add("hidden"));
  $$("[data-language]").forEach((button) => button.addEventListener("click", () => {
    store.preferences.language = button.dataset.language;
    saveStore();
    $$("[data-language]").forEach((candidate) => candidate.classList.toggle("active", candidate.dataset.language === button.dataset.language));
    if (session) renderQuestion();
  }));
  $("#closeImageDialog").addEventListener("click", () => elements.imageDialog.close());
  elements.imageDialog.addEventListener("click", (event) => { if (event.target === elements.imageDialog) elements.imageDialog.close(); });
  $("#closeResult").addEventListener("click", () => { elements.resultDialog.close(); showDashboard(true); });
  $("#reviewExam").addEventListener("click", () => { elements.resultDialog.close(); startSession("review", { ids: lastExamWrongIds }); });
  $("#openIssueCenter").addEventListener("click", openIssueCenter);
  $("#quickIssueButton").addEventListener("click", openIssueCenter);
  $("#closeIssueDialog").addEventListener("click", () => elements.issueDialog.close());
  elements.issueDialog.addEventListener("click", (event) => { if (event.target === elements.issueDialog) elements.issueDialog.close(); });
  elements.issueForm.addEventListener("submit", saveIssueReport);
  $("#resetIssueForm").addEventListener("click", resetIssueForm);
  elements.issueQuestionId.addEventListener("input", () => {
    elements.issueQuestionId.setCustomValidity("");
    updateIssueContext();
  });
  elements.issueQuestionId.addEventListener("blur", () => {
    elements.issueQuestionId.value = elements.issueQuestionId.value.trim().toUpperCase();
    updateIssueContext();
  });

  window.addEventListener("keydown", (event) => {
    if (!session || elements.imageDialog.open || elements.resultDialog.open || elements.issueDialog.open) return;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    const optionKey = KEYBOARD_OPTION_MAP[event.code] || (/^[1-4]$/.test(event.key) ? ["A", "B", "C", "D"][Number(event.key) - 1] : null);
    if (optionKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      answerQuestion(optionKey);
      return;
    }
    if (event.key === "ArrowLeft") navigateQuestion(-1);
    if (event.key === "ArrowRight") navigateQuestion(1);
  });

  populateCategories();
  elements.questionIdList.replaceChildren(...allIds.map((id) => {
    const option = document.createElement("option");
    option.value = id;
    return option;
  }));
  renderDashboard();
  renderIssueReports();
  refreshIssueReports();
  $$("[data-language]").forEach((button) => button.classList.toggle("active", button.dataset.language === currentLanguage()));
})();
