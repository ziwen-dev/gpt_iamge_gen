const $ = (id) => document.getElementById(id);

    const THEME_KEY = "gpt-image-theme";
    const API_KEY_STORAGE = "image-console-api-key";
    const GENERATION_SETTINGS_STORAGE = "image-console-generation-settings";
    const APP_BASE = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/image_gpt/";
    const FALLBACK_THUMB = `${APP_BASE}assets/示例.png`;
    const RECORD_REFRESH_MS = 5000;
    const GENERATION_PROGRESS_MS = 60000;
    const GENERATION_TAIL_MS = 30000;
    const LOCKED_IMAGE_SIZE = "1024x1024";
    const LOCKED_IMAGE_QUALITY = "";
    const TYPE_TEXTS = [
      "将文字想法转化为清晰画面。",
      "选择风格后提交任务。",
      "生成过程会进入记录列表，稍后即可查看结果。",
      "也可以上传参考图，进行海报、产品图和视觉方案设计。",
    ];

    let keyBucket = null;
    let currentFilename = null;
    let heroObjectUrl = null;
    let uploadedPreviewUrl = null;
    let activeRecordId = null;
    let recordTimer = null;
    let toastTimer = null;
    let generationProgress = null;
    let handledFailedRecordId = null;

    function api(path) {
      const p = path.startsWith("/") ? path.slice(1) : path;
      return `${APP_BASE}${p}`;
    }

    function authHeaders(jsonContentType) {
      const key = localStorage.getItem(API_KEY_STORAGE) || "";
      const headers = key ? { "X-API-Key": key } : {};
      if (jsonContentType) headers["Content-Type"] = "application/json";
      return headers;
    }

    async function parseJsonResponse(res) {
      const text = await res.text();
      const trimmed = text.trim();
      if (trimmed.startsWith("<")) {
        throw new Error("接口返回 HTML 而不是 JSON，请检查 /api/ 反向代理或后端服务。");
      }
      try {
        return JSON.parse(trimmed);
      } catch (_) {
        throw new Error("响应不是合法 JSON：" + trimmed.slice(0, 180));
      }
    }

    function setTheme(theme) {
      const isLight = theme === "light";
      document.documentElement.dataset.theme = isLight ? "light" : "dark";
      $("btnTheme").setAttribute("aria-checked", String(isLight));
      $("btnTheme").querySelector(".switch-label").textContent = isLight ? "亮色" : "暗色";
      try { localStorage.setItem(THEME_KEY, isLight ? "light" : "dark"); } catch (_) {}
    }

    function initTheme() {
      const stored = localStorage.getItem(THEME_KEY);
      setTheme(stored === "dark" ? "dark" : "light");
      $("btnTheme").addEventListener("click", () => {
        setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
      });
    }

    function switchWorkMode(mode) {
      const next = mode === "edit" ? "edit" : "generate";
      document.body.dataset.workMode = next;
      document.querySelectorAll("[data-work-mode-target]").forEach((tab) => {
        const active = tab.dataset.workModeTarget === next;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      if (next === "edit") {
        if (!currentFilename && !$("image-file").files[0]) {
          document.querySelectorAll('input[name="src"]').forEach((radio) => {
            radio.checked = radio.value === "upload";
          });
          $("wrap-upload").style.display = "grid";
        }
        const hasImage = checkedValue("src") === "upload" ? !!$("image-file").files[0] : !!currentFilename;
        document.body.classList.toggle("has-edit-image", hasImage);
        $("heroHint").textContent = $("heroImg").hidden
          ? "先上传一张图片，或从生成记录选择一张图，再填写你想修改的内容。"
          : "可以基于当前预览图进行修改，也可以上传另一张本地图片。";
      }
    }

    function setBusy(on, title, sub) {
      $("busy").classList.toggle("active", on);
      $("busy").setAttribute("aria-hidden", String(!on));
      $("busyTitle").textContent = title || "处理中";
      $("busySub").textContent = sub || "";
    }

    function showMsg(el, text, kind) {
      if (!el) return;
      el.className = "msg";
      if (!text) {
        el.style.display = "none";
        el.textContent = "";
        return;
      }
      el.textContent = text;
      el.classList.add(kind === "ok" ? "ok" : "err");
    }

    function showToast(text) {
      const toast = $("toast");
      toast.textContent = text;
      toast.classList.add("show");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
    }

    function showTopAlert(text) {
      const alert = $("topAlert");
      if (!text) {
        alert.classList.remove("show");
        alert.textContent = "";
        return;
      }
      alert.textContent = text;
      alert.classList.add("show");
      alert.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function revokeHero() {
      if (heroObjectUrl) {
        URL.revokeObjectURL(heroObjectUrl);
        heroObjectUrl = null;
      }
    }

    function revokeUploadedPreview() {
      if (uploadedPreviewUrl) {
        URL.revokeObjectURL(uploadedPreviewUrl);
        uploadedPreviewUrl = null;
      }
    }

    function updatePromptCount() {
      $("promptCount").textContent = `${$("prompt").value.length} / 800`;
    }

    function highlightTextInput(inputId) {
      const input = $(inputId);
      const wrap = input.closest(".prompt-wrap, .edit-prompt-wrap");
      if (!wrap) return;
      wrap.classList.remove("attention");
      void wrap.offsetWidth;
      wrap.classList.add("attention");
      input.focus();
      wrap.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => wrap.classList.remove("attention"), 3600);
    }

    function highlightPromptInput() {
      highlightTextInput("prompt");
    }

    function checkedValue(name) {
      const el = document.querySelector(`input[name="${name}"]:checked`);
      return el ? el.value : "";
    }

    function setCheckedValue(name, value) {
      const el = Array.from(document.querySelectorAll(`input[name="${name}"]`)).find((item) => item.value === value);
      if (el) el.checked = true;
    }

    function currentStylePrompt() {
      const el = document.querySelector('input[name="style"]:checked');
      return el ? el.value || "" : "";
    }

    function currentRatioLabel() {
      return LOCKED_IMAGE_SIZE;
    }

    function buildPrompt() {
      const base = $("prompt").value.trim();
      const style = currentStylePrompt();
      const suffix = style ? `#按${style}风格生成` : "";
      if (!suffix || base.includes(suffix)) return base;
      return `${base}\n${suffix}`;
    }

    function updateSubmitSummary() {
      const style = currentStylePrompt() || "默认";
      $("submitSummary").textContent = `将按${style}风格生成`;
      $("mobileSettingSummary").textContent = style;
    }

    function currentQualityLabel() {
      return "标准";
    }

    function saveGenerationSettings(notify = true) {
      const settings = {
        style: checkedValue("style"),
      };
      localStorage.setItem(GENERATION_SETTINGS_STORAGE, JSON.stringify(settings));
      updateSubmitSummary();
      if (notify) {
        showMsg($("msg-gen"), "生成设置已保存", "ok");
        showToastMessage("生成设置已保存");
      }
    }

    function showToastMessage(text) {
      showToast(text);
    }

    function restoreGenerationSettings() {
      try {
        const settings = JSON.parse(localStorage.getItem(GENERATION_SETTINGS_STORAGE) || "{}");
        if (settings.style) setCheckedValue("style", settings.style);
      } catch (_) {}
    }

    function showUploadedPreview(file) {
      if (!file) return;
      stopGenerationProgress();
      revokeHero();
      revokeUploadedPreview();
      uploadedPreviewUrl = URL.createObjectURL(file);
      document.body.classList.remove("has-task-preview");
      currentFilename = null;
      activeRecordId = null;
      $("heroImg").src = uploadedPreviewUrl;
      $("heroImg").hidden = false;
      $("heroEmpty").style.display = "none";
      document.body.classList.add("has-edit-image");
      $("heroHint").textContent = "已加载本地原图。填写编辑指令后，可以基于这张图片进行修改或借鉴。";
      switchWorkMode("edit");
      document.querySelectorAll('input[name="src"]').forEach((radio) => {
        radio.checked = radio.value === "upload";
      });
      $("wrap-upload").style.display = "grid";
    }

    function bindFileChip(inputId, chipId) {
      const input = $(inputId);
      const chip = $(chipId);
      const update = () => {
        const file = input.files && input.files[0];
        chip.textContent = file ? file.name : "未选择文件";
        if (file && inputId === "image-file") {
          showToast(`已选择原图：${file.name}`);
          showUploadedPreview(file);
        }
      };
      input.addEventListener("change", update);
      update();
    }

    function initTypingDescription() {
      const target = $("typedDesc");
      let phraseIndex = 0;
      let charIndex = 0;
      let deleting = false;

      const tick = () => {
        const phrase = TYPE_TEXTS[phraseIndex];
        target.textContent = phrase.slice(0, charIndex);
        if (!deleting && charIndex < phrase.length) {
          charIndex += 1;
          setTimeout(tick, 72);
          return;
        }
        if (!deleting) {
          deleting = true;
          setTimeout(tick, 1400);
          return;
        }
        if (charIndex > 0) {
          charIndex -= 1;
          setTimeout(tick, 34);
          return;
        }
        deleting = false;
        phraseIndex = (phraseIndex + 1) % TYPE_TEXTS.length;
        setTimeout(tick, 260);
      };

      tick();
    }

    function initKeyDialog() {
      const input = $("apiKeyInput");
      input.value = localStorage.getItem(API_KEY_STORAGE) || "";
      $("btnKey").addEventListener("click", () => {
        input.value = localStorage.getItem(API_KEY_STORAGE) || "";
        $("keyDialog").classList.add("open");
        $("keyDialog").setAttribute("aria-hidden", "false");
        input.focus();
      });
      $("btnCloseKey").addEventListener("click", closeKeyDialog);
      $("keyDialog").addEventListener("click", (event) => {
        if (event.target === $("keyDialog")) closeKeyDialog();
      });
      $("btnSaveKey").addEventListener("click", () => {
        const key = input.value.trim();
        if (!key) {
          showMsg($("msg-key"), "请先填写密钥", "err");
          return;
        }
        localStorage.setItem(API_KEY_STORAGE, key);
        showMsg($("msg-key"), "密钥已保存到当前浏览器", "ok");
        showToast("密钥已保存");
        syncProfileKeyState();
        loadRecords();
      });
      $("btnClearKey").addEventListener("click", () => {
        localStorage.removeItem(API_KEY_STORAGE);
        input.value = "";
        showMsg($("msg-key"), "已清除本地密钥", "ok");
        showToast("密钥已清除");
        syncProfileKeyState();
      });
    }

    function closeKeyDialog() {
      $("keyDialog").classList.remove("open");
      $("keyDialog").setAttribute("aria-hidden", "true");
      showMsg($("msg-key"), "", "");
    }

    function syncProfileKeyState() {
      const key = localStorage.getItem(API_KEY_STORAGE) || "";
      $("profileApiKeyInput").value = key;
      $("profileKeyState").textContent = key ? "密钥已保存在当前浏览器" : "未保存密钥";
    }

    function saveApiKeyFromInput(inputId, msgId) {
      const key = $(inputId).value.trim();
      if (!key) {
        showMsg($(msgId), "请先填写密钥", "err");
        return;
      }
      localStorage.setItem(API_KEY_STORAGE, key);
      syncProfileKeyState();
      showMsg($(msgId), "密钥已保存到当前浏览器", "ok");
      showToast("密钥已保存");
      loadRecords();
    }

    function clearApiKeyFromProfile() {
      localStorage.removeItem(API_KEY_STORAGE);
      syncProfileKeyState();
      showMsg($("msg-profile"), "已清除本地密钥", "ok");
      showToast("密钥已清除");
    }

    function switchMobileTab(tab) {
      document.body.dataset.mobileTab = tab;
      document.querySelectorAll(".mobile-nav-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mobileTab === tab);
      });
      if (tab === "records") loadRecords({ silent: true });
      if (tab === "profile") syncProfileKeyState();
    }

    function formatTs(ts) {
      if (!ts) return "";
      const d = new Date(ts);
      return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
    }

    function thumbUrl(bucket, filename) {
      return api(`/api/files/${encodeURIComponent(bucket)}/${encodeURIComponent(filename)}`);
    }

    async function fetchThumbBlob(bucket, filename) {
      const res = await fetch(thumbUrl(bucket, filename), { headers: authHeaders(false) });
      if (!res.ok) return null;
      return await res.blob();
    }

    async function showHeroFromServer(bucket, filename) {
      if (!bucket || !filename) return;
      document.body.classList.add("has-edit-image");
      document.body.classList.add("has-task-preview");
      setBusy(true, "加载预览", "正在拉取图像数据...");
      try {
        const res = await fetch(thumbUrl(bucket, filename), { headers: authHeaders(false) });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`预览失败 HTTP ${res.status} ${text.slice(0, 100)}`);
        }
        const blob = await res.blob();
        revokeHero();
        revokeUploadedPreview();
        heroObjectUrl = URL.createObjectURL(blob);
        $("heroImg").src = heroObjectUrl;
        $("heroImg").hidden = false;
        $("heroEmpty").style.display = "none";
        $("heroHint").textContent = `当前图：${filename}`;
      } catch (error) {
        $("heroHint").textContent = String(error.message || error);
      } finally {
        setBusy(false);
      }
    }

    function clearPreview() {
      document.body.classList.remove("has-edit-image");
      document.body.classList.remove("has-task-preview");
      revokeHero();
      revokeUploadedPreview();
      currentFilename = null;
      activeRecordId = null;
      $("heroImg").removeAttribute("src");
      $("heroImg").hidden = true;
      $("heroEmpty").style.display = "grid";
      showEmptyPreview();
      $("heroHint").textContent = "等待生成或从左侧记录选择一张图。";
      document.querySelectorAll(".rec-item").forEach((item) => item.classList.remove("active"));
    }

    function toggleHistory(open) {
      $("aside").classList.toggle("open", open);
    }

    function stopGenerationProgress() {
      if (generationProgress?.timer) clearInterval(generationProgress.timer);
      generationProgress = null;
    }

    function isEditTask() {
      return generationProgress?.taskKind === "edit" || document.body.dataset.workMode === "edit";
    }

    function progressCopy(percent, finishing = false) {
      const edit = isEditTask();
      if (finishing) return edit ? "图片已编辑完成，正在整理预览和记录。" : "图片已生成，正在整理预览和记录。";
      if (percent >= 99) {
        return edit
          ? "还在排队或渲染中，可以先离开；编辑完成后会自动保存到生成记录。"
          : "还在排队或渲染中，可以先离开；图片完成后会自动保存到生成记录。";
      }
      if (percent >= 90) return "已经接近完成，最后阶段可能需要多等一会儿。";
      if (percent >= 60) return edit ? "正在根据编辑指令调整画面细节。" : "正在处理画面细节和清晰度。";
      if (percent >= 25) return edit ? "模型正在理解编辑指令并处理原图。" : "模型正在理解提示词并构建画面。";
      return "任务已开始，请保持页面打开以便自动展示结果。";
    }

    function renderGenerationProgress(percent, finishing = false) {
      const fill = document.querySelector("[data-generation-progress-fill]");
      const value = document.querySelector("[data-generation-progress-value]");
      const note = document.querySelector("[data-generation-progress-note]");
      const bar = document.querySelector("[data-generation-progress]");
      const safePercent = Math.max(0, Math.min(100, percent));
      if (fill) fill.style.width = `${safePercent}%`;
      if (value) value.textContent = `${Math.round(safePercent)}%`;
      if (note) note.textContent = progressCopy(safePercent, finishing);
      if (bar) bar.setAttribute("aria-valuenow", String(Math.round(safePercent)));
      $("heroHint").textContent = safePercent >= 99
        ? "图片完成后会自动保存到记录列表，不需要重复提交。"
        : (isEditTask()
          ? "编辑完成后会自动切换到图片预览。"
          : "生成完成后会自动切换到图片预览。");
    }

    function startGenerationProgress(recordId, taskKind = "generate") {
      stopGenerationProgress();
      const startedAt = Date.now();
      generationProgress = {
        recordId,
        taskKind,
        startedAt,
        percent: 3,
        finishing: false,
        timer: null,
      };
      handledFailedRecordId = null;
      renderGenerationProgress(generationProgress.percent);
      generationProgress.timer = setInterval(() => {
        if (!generationProgress || generationProgress.finishing) return;
        const elapsed = Date.now() - startedAt;
        let next;
        if (elapsed <= GENERATION_PROGRESS_MS) {
          next = 3 + (elapsed / GENERATION_PROGRESS_MS) * 87;
        } else if (elapsed <= GENERATION_PROGRESS_MS + GENERATION_TAIL_MS) {
          next = 90 + ((elapsed - GENERATION_PROGRESS_MS) / GENERATION_TAIL_MS) * 9;
        } else {
          next = 99;
        }
        generationProgress.percent = Math.min(99, Math.max(generationProgress.percent, next));
        renderGenerationProgress(generationProgress.percent);
      }, 500);
    }

    function finishGenerationProgress(onDone) {
      if (!generationProgress) {
        if (onDone) onDone();
        return;
      }
      generationProgress.finishing = true;
      if (generationProgress.timer) clearInterval(generationProgress.timer);
      const from = generationProgress.percent || 90;
      const startedAt = Date.now();
      const duration = from >= 90 ? 1200 : 1800;
      generationProgress.timer = setInterval(() => {
        const ratio = Math.min(1, (Date.now() - startedAt) / duration);
        const eased = 1 - Math.pow(1 - ratio, 3);
        const next = from + (100 - from) * eased;
        renderGenerationProgress(next, true);
        if (ratio >= 1) {
          stopGenerationProgress();
          if (onDone) onDone();
        }
      }, 80);
    }

    function showFailedPreview(errorText, taskKind = "generate") {
      stopGenerationProgress();
      revokeHero();
      revokeUploadedPreview();
      currentFilename = null;
      $("heroImg").removeAttribute("src");
      $("heroImg").hidden = true;
      $("heroEmpty").style.display = "grid";
      $("heroEmpty").classList.remove("generating");
      document.body.classList.remove("has-task-preview");
      const edit = taskKind === "edit";
      $("heroEmpty").innerHTML = `
        <div class="empty-icon" aria-hidden="true">!</div>
        <div class="empty-title">${edit ? "编辑失败" : "生成失败"}</div>
        <div>${errorText || (edit ? "本次编辑重试后仍未成功，请稍后再试。" : "本次生成重试后仍未成功，请稍后再试。")}</div>
      `;
      $("heroHint").textContent = edit
        ? "已自动重试一次；如果继续失败，请调整编辑指令或稍后重试。"
        : "已自动重试一次；如果继续失败，请调整提示词或稍后重试。";
    }

    function showGeneratingPreview(taskKind = "generate") {
      document.body.classList.add("has-task-preview");
      if (taskKind === "edit") document.body.classList.add("has-edit-image");
      revokeHero();
      if (taskKind !== "edit") revokeUploadedPreview();
      currentFilename = null;
      $("heroImg").removeAttribute("src");
      $("heroImg").hidden = true;
      $("heroEmpty").style.display = "grid";
      $("heroEmpty").classList.add("generating");
      const edit = taskKind === "edit";
      $("heroEmpty").innerHTML = `
        <div class="empty-icon" aria-hidden="true"><span class="inline-spinner"></span></div>
        <div class="empty-title">${edit ? "图像正在编辑中" : "图像正在生成中"}</div>
        <div class="generation-progress" data-generation-progress role="progressbar" aria-label="${edit ? "编辑进度" : "生成进度"}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="progress-track">
            <div class="progress-fill" data-generation-progress-fill></div>
          </div>
          <div class="progress-meta">
            <span>预计约 1 分钟</span>
            <strong data-generation-progress-value>0%</strong>
          </div>
          <div class="progress-note" data-generation-progress-note>任务已开始，请保持页面打开以便自动展示结果。</div>
        </div>
      `;
      $("heroHint").textContent = edit
        ? "编辑完成后会自动切换到图片预览。"
        : "生成完成后会自动切换到图片预览。";
    }

    function showEmptyPreview() {
      stopGenerationProgress();
      document.body.classList.remove("has-task-preview");
      $("heroEmpty").classList.remove("generating");
      $("heroEmpty").innerHTML = `
        <div class="empty-icon" aria-hidden="true">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <rect x="3" y="4" width="18" height="16" rx="3"></rect>
            <circle cx="8.5" cy="9" r="1.5"></circle>
            <path d="m21 15-5-5L5 20"></path>
          </svg>
        </div>
        <div class="empty-title">你的创作将展示在这里</div>
        <div>输入描述并点击生成，开始创造你的画面</div>
      `;
    }

    async function loadRecords(options = {}) {
      if (!options.silent) $("recordsBox").innerHTML = '<p class="empty-note">加载中...</p>';
      try {
        const res = await fetch(api("/api/records"), { headers: authHeaders(false) });
        const data = await parseJsonResponse(res);
        if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);

        keyBucket = data.key_bucket;
        $("bucketPill").textContent = keyBucket ? `分区 ${keyBucket.slice(0, 8)}` : "分区 -";
        $("bucketPill").title = keyBucket || "";

        const records = Array.isArray(data.records) ? data.records : [];
        if (!records.length) {
          $("recordsBox").innerHTML = '<p class="empty-note">暂无记录。生成成功后会自动写入。</p>';
          return;
        }

        const frag = document.createDocumentFragment();
        let activeCompletedRecord = null;
        records.forEach((rec) => {
          const item = document.createElement("div");
          item.className = "rec-item";
          item.dataset.id = rec.id || "";
          if (activeRecordId && rec.id === activeRecordId) item.classList.add("active");

          const isPending = rec.status === "pending" || rec.status === "retrying";
          const isFailed = rec.status === "failed";
          const thumb = isPending || isFailed ? document.createElement("div") : document.createElement("img");
          thumb.className = "rec-thumb" + (isPending ? " pending" : isFailed ? " failed" : "");
          if (isFailed) thumb.textContent = "!";
          if (!isPending && !isFailed) {
            thumb.alt = "";
            thumb.src = FALLBACK_THUMB;
            if (activeRecordId && rec.id === activeRecordId) activeCompletedRecord = rec;
          }
          if (
            isFailed &&
            generationProgress &&
            activeRecordId &&
            rec.id === activeRecordId &&
            handledFailedRecordId !== rec.id
          ) {
            handledFailedRecordId = rec.id;
            showFailedPreview(rec.error, rec.kind === "edit" ? "edit" : "generate");
          }

          const meta = document.createElement("div");
          meta.className = "rec-meta";

          const kind = document.createElement("div");
          kind.className = "rec-kind " + (isPending ? "pending" : isFailed ? "failed" : rec.kind === "edit" ? "ed" : "gen");
          kind.textContent = isPending
            ? (rec.kind === "edit" ? "编辑中" : "生成中")
            : isFailed ? "失败" : rec.kind === "edit" ? "编辑" : "完成";

          const prompt = document.createElement("div");
          prompt.className = "rec-prompt";
          prompt.textContent = rec.prompt || "";

          const time = document.createElement("div");
          time.className = "rec-time";
          time.textContent = formatTs(rec.ts);

          meta.append(kind, prompt, time);
          item.append(thumb, meta);
          thumb.addEventListener("click", async (event) => {
            event.stopPropagation();
            if (isPending) {
              const taskKind = rec.kind === "edit" ? "edit" : "generate";
              showGeneratingPreview(taskKind);
              startGenerationProgress(rec.id || activeRecordId, taskKind);
              switchMobileTab("paint");
              return;
            }
            if (isFailed) {
              showMsg($("msg-gen"), rec.error || "上游接口失败，已记录失败状态", "err");
              return;
            }
            if (!keyBucket || !rec.filename) return;
            const blob = await fetchThumbBlob(keyBucket, rec.filename);
            if (blob) openLightbox(URL.createObjectURL(blob));
          });
          item.addEventListener("click", async () => {
            activeRecordId = rec.id || null;
            currentFilename = rec.filename || null;
            document.querySelectorAll(".rec-item").forEach((el) => el.classList.remove("active"));
            item.classList.add("active");
            if (isPending) {
              const taskKind = rec.kind === "edit" ? "edit" : "generate";
              showGeneratingPreview(taskKind);
              startGenerationProgress(rec.id || activeRecordId, taskKind);
            } else if (isFailed) {
              const msgEl = rec.kind === "edit" ? $("msg-edit") : $("msg-gen");
              showMsg(msgEl, rec.error || "上游接口失败，已记录失败状态", "err");
              showFailedPreview(rec.error, rec.kind === "edit" ? "edit" : "generate");
            } else {
              await showHeroFromServer(keyBucket, currentFilename);
            }
            switchMobileTab("paint");
          });

          frag.appendChild(item);

          // 缩略图需要鉴权，异步拉取后再替换占位图。
          (async () => {
            if (!keyBucket || !rec.filename) return;
            const blob = await fetchThumbBlob(keyBucket, rec.filename);
            if (blob && thumb instanceof HTMLImageElement) thumb.src = URL.createObjectURL(blob);
          })();
        });

        $("recordsBox").innerHTML = "";
        $("recordsBox").appendChild(frag);
        if (activeCompletedRecord && generationProgress && generationProgress.recordId === activeCompletedRecord.id) {
          const doneRecord = activeCompletedRecord;
          const editDone = doneRecord.kind === "edit";
          finishGenerationProgress(async () => {
            currentFilename = doneRecord.filename || null;
            await showHeroFromServer(keyBucket, currentFilename);
            const okText = editDone ? "图片已编辑并保存到记录。" : "图片已生成并保存到记录。";
            showMsg(editDone ? $("msg-edit") : $("msg-gen"), okText, "ok");
            showToast(okText);
          });
        }
      } catch (error) {
        $("recordsBox").innerHTML = `<p class="empty-note" style="color:var(--danger);">${String(error.message || error)}</p>`;
      }
    }

    function startRecordPolling() {
      if (recordTimer) clearInterval(recordTimer);
      recordTimer = setInterval(() => loadRecords({ silent: true }), RECORD_REFRESH_MS);
    }

    function openLightbox(src) {
      if (!src) return;
      $("lightbox-img").src = src;
      $("lightbox").classList.add("open");
      $("lightbox").setAttribute("aria-hidden", "false");
    }

    function closeLightbox() {
      $("lightbox").classList.remove("open");
      $("lightbox").setAttribute("aria-hidden", "true");
      $("lightbox-img").removeAttribute("src");
    }

    async function downloadCurrent() {
      try {
        if (!currentFilename && !heroObjectUrl) {
          alert("请先生成或从记录中选择一张图");
          return;
        }
        if (heroObjectUrl) {
          const a = document.createElement("a");
          a.href = heroObjectUrl;
          a.download = currentFilename || "image.png";
          a.click();
          return;
        }
        const res = await fetch(thumbUrl(keyBucket, currentFilename), { headers: authHeaders(false) });
        if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = currentFilename || "image.png";
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        alert(String(error.message || error));
      }
    }

    async function generateImage() {
      showMsg($("msg-gen"), "", "");
      showTopAlert("");
      const prompt = buildPrompt();
      if (!prompt) {
        const text = "先写一句画面描述，再点击生成。可以描述主体、场景、风格和用途。";
        showMsg($("msg-gen"), text, "err");
        showToast(text);
        showTopAlert(text);
        switchWorkMode("generate");
        highlightPromptInput();
        return;
      }

      const body = {
        prompt,
        // 尺寸字段按后端 /api/generate 支持的 size 参数直接传入。
        size: LOCKED_IMAGE_SIZE,
        n: "1",
      };
      const quality = LOCKED_IMAGE_QUALITY;
      if (quality) body.quality = quality;

      const genBtn = $("btn-gen");
      if (genBtn) genBtn.disabled = true;
      try {
        const res = await fetch(api("/api/generate"), {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify(body),
        });
        const data = await parseJsonResponse(res);
        if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);

        keyBucket = data.key_bucket || keyBucket;
        activeRecordId = data.record_id || null;
        showMsg($("msg-gen"), "", "");
        showGeneratingPreview("generate");
        startGenerationProgress(activeRecordId, "generate");
        await loadRecords();
      } catch (error) {
        stopGenerationProgress();
        showMsg($("msg-gen"), String(error.message || error), "err");
      } finally {
        if (genBtn) genBtn.disabled = false;
      }
    }

    async function editImage() {
      showMsg($("msg-edit"), "", "");
      showTopAlert("");
      const prompt = $("edit-prompt").value.trim();
      if (!prompt) {
        const text = "先写下你想怎么改这张图，例如换背景、改风格、加文字或调整细节。";
        showMsg($("msg-edit"), text, "err");
        showToast(text);
        showTopAlert(text);
        switchWorkMode("edit");
        highlightTextInput("edit-prompt");
        return;
      }

      const fd = new FormData();
      fd.append("prompt", prompt);
      // 编辑接口同样使用后端支持的 size 字段，保持生成与编辑参数一致。
      fd.append("size", LOCKED_IMAGE_SIZE);
      const quality = LOCKED_IMAGE_QUALITY;
      if (quality) fd.append("quality", quality);
      fd.append("n", "1");

      if (checkedValue("src") === "upload") {
        const file = $("image-file").files[0];
        if (!file) {
          const text = "请先上传一张原图，上传后会显示在预览区，再提交编辑。";
          showMsg($("msg-edit"), text, "err");
          showToast(text);
          showTopAlert(text);
          return;
        }
        fd.append("image", file);
      } else {
        if (!keyBucket || !currentFilename) {
          const text = "请先从生成记录选择一张图，或切到本地上传后选择原图。";
          showMsg($("msg-edit"), text, "err");
          showToast(text);
          showTopAlert(text);
          return;
        }
        fd.append("use_saved", "1");
        fd.append("source_filename", currentFilename);
      }

      const editBtn = $("btn-edit");
      if (editBtn) editBtn.disabled = true;
      try {
        const res = await fetch(api("/api/edit"), {
          method: "POST",
          headers: authHeaders(false),
          body: fd,
        });
        const data = await parseJsonResponse(res);
        if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);

        keyBucket = data.key_bucket || keyBucket;
        activeRecordId = data.record_id || null;
        showMsg($("msg-edit"), "", "");
        switchWorkMode("edit");
        showGeneratingPreview("edit");
        startGenerationProgress(activeRecordId, "edit");
        await loadRecords();
      } catch (error) {
        stopGenerationProgress();
        showMsg($("msg-edit"), String(error.message || error), "err");
      } finally {
        if (editBtn) editBtn.disabled = false;
      }
    }

    function initEvents() {
      $("prompt").addEventListener("input", updatePromptCount);
      document.querySelectorAll('input[name="style"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          updateSubmitSummary();
          saveGenerationSettings(false);
        });
      });
      $("btnClearPrompt").addEventListener("click", () => {
        $("prompt").value = "";
        updatePromptCount();
      });
      document.querySelectorAll("[data-work-mode-target]").forEach((tab) => {
        tab.addEventListener("click", () => switchWorkMode(tab.dataset.workModeTarget));
      });
      document.querySelectorAll('input[name="src"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          $("wrap-upload").style.display = checkedValue("src") === "upload" ? "grid" : "none";
          if (checkedValue("src") === "upload") {
            switchWorkMode("edit");
            if (!$("image-file").files[0]) document.body.classList.remove("has-edit-image");
            $("heroHint").textContent = "请选择一张本地图片，上传后会先显示在预览区，再提交编辑。";
          } else if (currentFilename) {
            document.body.classList.add("has-edit-image");
          } else {
            document.body.classList.remove("has-edit-image");
          }
        });
      });
      if ($("btn-gen")) $("btn-gen").addEventListener("click", generateImage);
      document.querySelectorAll(".mobile-generate-btn").forEach((btn) => {
        btn.addEventListener("click", generateImage);
      });
      $("btnSaveSettings").addEventListener("click", () => saveGenerationSettings(true));
      $("btn-edit").addEventListener("click", editImage);
      $("btnRec").addEventListener("click", loadRecords);
      $("btnOpenRec").addEventListener("click", () => switchMobileTab("records"));
      document.querySelectorAll(".mobile-nav-btn").forEach((btn) => {
        btn.addEventListener("click", () => switchMobileTab(btn.dataset.mobileTab));
      });
      document.querySelectorAll(".mobile-nav-link").forEach((btn) => {
        btn.addEventListener("click", () => switchMobileTab(btn.dataset.tabTarget));
      });
      $("btnProfileSaveKey").addEventListener("click", () => saveApiKeyFromInput("profileApiKeyInput", "msg-profile"));
      $("btnProfileClearKey").addEventListener("click", clearApiKeyFromProfile);
      $("btnClearUi").addEventListener("click", clearPreview);
      $("btn-download").addEventListener("click", downloadCurrent);
      $("heroImg").addEventListener("click", () => {
        if (!$("heroImg").hidden) openLightbox($("heroImg").src);
      });
      $("lightbox").addEventListener("click", closeLightbox);
      $("lightbox-inner").addEventListener("click", (event) => event.stopPropagation());
      $("lightbox-close").addEventListener("click", closeLightbox);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeLightbox();
          toggleHistory(false);
          closeKeyDialog();
        }
      });
    }

export function disposeStudio() {
  if (recordTimer) {
    clearInterval(recordTimer);
    recordTimer = null;
  }
  stopGenerationProgress();
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
}

export function initStudio() {
  initTheme();
  bindFileChip("image-file", "image-file-chip");
  restoreGenerationSettings();
  initTypingDescription();
  initKeyDialog();
  initEvents();
  switchWorkMode("generate");
  updatePromptCount();
  updateSubmitSummary();
  syncProfileKeyState();
  switchMobileTab("paint");
  loadRecords();
  startRecordPolling();
}
