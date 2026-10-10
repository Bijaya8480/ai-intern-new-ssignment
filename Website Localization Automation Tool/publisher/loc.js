/*!
  * loc.js - Website Localization Automation Tool runtime
  *
  * Inject via:  <script src="https://your-domain/loc.js" data-project="PROJECT_ID" data-lang="es"></script>
  *
  * Matching strategy (see docs/technical-notes.md):
  *   1. Resolve the current page's pathname (e.g. /about).
  *   2. Fetch published translations for data-project scoped to that pathname.
  *   3. For each record, locate the DOM node by CSS selector (record.selector).
  *   4. VERIFY: normalized-text hash of the node's current text == record.source_hash
  *      (guards against replacing content on pages that have changed). The hash
  *      uses the same djb2 variant as the backend (see hash_text in utils).
  *   5. Replace via textContent / attribute setter (NEVER innerHTML) -> XSS-safe.
  *
  * Language priority: stored visitor preference (localStorage) -> data-lang default
  * -> browser locale -> source language.
  *
  * For dynamic (unpublished) translation, the script can call the backend
  * /api/translation/translate endpoint to translate on-the-fly.
  */
(function () {
  "use strict";

  // ---- Hash matches Python hash_text: djb2 variant over normalized text ----
  function normalizeText(text) {
    return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function hashCode(str) {
    var s = normalizeText(str);
    var hash = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      hash = ((hash << 5) - hash + c) | 0;
    }
    return hash + "_" + s.length;
  }

  function normLang(code) {
    return (code || "").toLowerCase().replace(/_/g, "-");
  }

  function langPrefix(code) {
    return normLang(code).split("-")[0];
  }

  var RTL_LANGUAGES = {
    ar: true, ur: true, fa: true, he: true
  };

  // ---- Locate our own <script> tag ----
  function getScriptTag() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i];
      if (s.getAttribute && s.getAttribute("data-project")) {
        var src = s.getAttribute("src") || "";
        if (src.indexOf("loc.js") !== -1) return s;
      }
    }
    return null;
  }

  var scriptEl = getScriptTag();
  var PROJECT_ID = "";
  var DEFAULT_LANG = "en";
  var SCRIPT_SRC = "";

  if (scriptEl) {
    PROJECT_ID = scriptEl.getAttribute("data-project") || "";
    DEFAULT_LANG = scriptEl.getAttribute("data-lang") || "en";
    SCRIPT_SRC = scriptEl.getAttribute("src") || "";
  }

  // Allow query-param overrides (for demo/testing without script attrs)
  var query = window.location.search || "";
  var m;
  if (!PROJECT_ID) {
    m = new RegExp("[?&]loc_project=([^&]+)").exec(query);
    if (m && m[1]) PROJECT_ID = decodeURIComponent(m[1]);
  }
  if (!PROJECT_ID && window.LOC_PROJECT) PROJECT_ID = window.LOC_PROJECT;
  if (!DEFAULT_LANG) {
    m = new RegExp("[?&]loc_lang=([^&]+)").exec(query);
    if (m && m[1]) DEFAULT_LANG = decodeURIComponent(m[1]);
  }

  if (!PROJECT_ID) {
    return;
  }

  // ---- Base URL = origin of the loc.js script ----
  var BASE_URL;
  try {
    var u = document.createElement("a");
    u.href = SCRIPT_SRC || "";
    BASE_URL = u.origin ? u.origin : window.location.origin;
  } catch (e) {
    BASE_URL = window.location.origin;
  }

  // ---- Current page relative path ----
  function currentPagePath() {
    return window.location.pathname + window.location.search;
  }

  var LS_KEY = "loc_lang_" + PROJECT_ID;
  var TRANSLATIONS_CACHE = {}; // lang -> { segments }
  var DOM_STATE = {}; // stores original textContent per element for restore
  var CURRENT_LANG = ""; // currently applied language

  // ---- Language resolution ----
  function resolveLanguage(targetCode, sourceCode) {
    var stored = localStorage.getItem(LS_KEY);
    if (stored) return stored;
    if (DEFAULT_LANG) return DEFAULT_LANG;
    var browser = navigator.language || (navigator.userLanguage || "");
    if (langPrefix(browser) === langPrefix(targetCode)) return targetCode;
    return sourceCode || "";
  }

  // ---- Apply RTL direction ----
  function applyDirection(lang) {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      document.documentElement.dir = RTL_LANGUAGES[langPrefix(lang)] ? "rtl" : "ltr";
    }
  }

  // ---- Sanitize text for safe insertion ----
  function safeText(txt) {
    return String(txt == null ? "" : txt);
  }

  // ---- DOM application: apply published (approved) translations ----
  function applyTranslations(data) {
    if (!data || !data.segments || !data.segments.length) return;

    var segments = data.segments;
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var selector = seg.selector;
      if (!selector) continue;

      var sourceText = seg.source_text || "";
      var sourceHash = seg.source_hash;
      var targetText = seg.target_text || "";
      var elemType = seg.element_type;

      var nodes = [];
      try {
        nodes = document.querySelectorAll(selector);
      } catch (e) {
        continue;
      }

      for (var j = 0; j < nodes.length; j++) {
        var node = nodes[j];

        if (elemType === "meta_description") {
          if (node.tagName && node.tagName.toLowerCase() === "meta" &&
              node.getAttribute && node.getAttribute("name") &&
              node.getAttribute("name").toLowerCase() === "description") {
            node.setAttribute("content", safeText(targetText));
          }
          continue;
        }

        if (elemType === "title") {
          if (document.title && hashCode(document.title) === sourceHash) {
            document.title = safeText(targetText);
          }
          continue;
        }

        // Generic text replacement: verify hash then set textContent
        var current = node.textContent || "";
        var shouldReplace = sourceHash && hashCode(current) === sourceHash;
        if (!shouldReplace && sourceText) {
          // Fallback: match by trimmed text
          shouldReplace = current.trim() === sourceText.trim();
        }

        if (shouldReplace) {
          if (elemType === "img-alt") {
            node.setAttribute("alt", safeText(targetText));
          } else {
            // Store original for restore, then replace
            var elemId = node.uniqueID || (node.__loc_id = "loc_" + i + "_" + j);
            if (!DOM_STATE[elemId] && node.textContent) {
              DOM_STATE[elemId] = node.textContent;
            }
            node.textContent = safeText(targetText);
          }
        }
      }
    }
  }

  // ---- Restore original text ----
  function restoreOriginal() {
    // Reload the page to restore original content
    if (localStorage.getItem(LS_KEY) === "en" || !localStorage.getItem(LS_KEY)) {
      // We're already at source language — just reload
      window.location.reload();
      return;
    }
    // Restore cached original textContent
    for (var id in DOM_STATE) {
      var el = document.getElementById(id) || document.querySelector('[__loc_id="' + id.replace('loc_', '') + '"]');
      if (el) {
        el.textContent = DOM_STATE[id];
      }
    }
    applyDirection("en");
    localStorage.setItem(LS_KEY, "en");
    CURRENT_LANG = "en";
    // Reload to get clean state
    window.location.reload();
  }

  // ---- Fetch published translations ----
  function fetchTranslations(lang, cb) {
    if (TRANSLATIONS_CACHE[lang]) {
      cb(TRANSLATIONS_CACHE[lang]);
      return;
    }
    var path = currentPagePath();
    var url = BASE_URL + "/api/runtime/" + encodeURIComponent(PROJECT_ID) +
              "/translations?lang=" + encodeURIComponent(lang) +
              "&source=" + encodeURIComponent(path);

    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          TRANSLATIONS_CACHE[lang] = data;
          cb(data);
        } catch (e) {
          cb(null);
        }
      } else {
        cb(null);
      }
    };
    xhr.timeout = 8000;
    xhr.send();
  }

  // ---- Dynamic translation via backend API (fallback for unpublished content) ----
  function dynamicTranslate(text, targetLang, cb) {
    var url = BASE_URL + "/api/translation/translate";
    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          var result = data.translations && data.translations[0] && data.translations[0].translated_text;
          cb(result || text);
        } catch (e) {
          cb(text);
        }
      } else {
        cb(text);
      }
    };
    xhr.timeout = 15000;
    xhr.send(JSON.stringify({
      texts: [text],
      source_language: "auto",
      target_language: targetLang,
    }));
  }

  // ---- Language selector UI ----
  function injectSelector(data, currentLang, sourceLang, targetLang, supportedLangs) {
    // Remove existing selector
    var existing = document.getElementById("loc-lang-selector");
    if (existing) existing.remove();

    var container = document.createElement("div");
    container.id = "loc-lang-selector";
    container.className = "loc-lang-selector";

    var style = container.style;
    style.position = "fixed";
    style.bottom = "20px";
    style.right = "20px";
    style.zIndex = "2147483647";
    style.background = "hsl(220 15% 4%)";
    style.border = "1px solid hsl(220 5% 15%)";
    style.borderRadius = "12px";
    style.padding = "8px";
    style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
    style.fontFamily = "Inter, system-ui, -apple-system, Segoe UI, Arial, sans-serif";
    style.fontSize = "14px";

    // Dropdown container
    var dropdown = document.createElement("div");
    dropdown.style.position = "relative";
    dropdown.style.width = "220px";

    // Trigger button
    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "loc-trigger";
    trigger.style.width = "100%";
    trigger.style.padding = "8px 12px";
    trigger.style.borderRadius = "8px";
    trigger.style.border = "1px solid hsl(220 20% 90%)";
    trigger.style.background = "hsl(220 22% 96%)";
    trigger.style.color = "hsl(220 47% 11%)";
    trigger.style.cursor = "pointer";
    trigger.style.display = "flex";
    trigger.style.alignItems = "center";
    trigger.style.justContent = "space-between";
    trigger.style.gap = "8px";
    trigger.innerHTML = '<span style="display:flex;align-items:center;gap:6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x-1="2" y-1="2" x-2="22" y-2="22"></line></svg><span id="loc-cur-lang">English</span></span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left:auto"><polyline points="6 9 12 15 18 9"></polyline></svg>';

    // Dropdown list (hidden by default)
    var listbox = document.createElement("div");
    listbox.className = "loc-listbox";
    listbox.style.position = "absolute";
    listbox.style.top = "100%";
    listbox.style.left = "0";
    listbox.style.right = "0";
    listbox.style.marginTop = "4px";
    listbox.style.maxHeight = "240px";
    listbox.style.overflowY = "auto";
    listbox.style.background = "hsl(0 0% 100%)";
    listbox.style.border = "1px solid hsl(220 20% 90%)";
    listbox.style.borderRadius = "8px";
    listbox.style.boxShadow = "0 10px 30px rgba(0,0,0,0.15)";
    listbox.style.zIndex = "2147483647";
    listbox.style.display = "none";

    // Search input
    var searchWrap = document.createElement("div");
    searchWrap.style.padding = "8px";
    searchWrap.innerHTML = '<input type="text" placeholder="Search languages..." style="width:100%;padding:6px 8px;border:1px solid hsl(220 20% 90%);border-radius:6px;font-size:13px;outline:none;">';
    var searchInput = searchWrap.querySelector("input");
    searchInput.addEventListener("input", function () {
      filterLanguages(searchInput.value.trim().toLowerCase());
    });

    // Language options
    function buildOptions() {
      listbox.innerHTML = "";
      listbox.appendChild(searchWrap);

      var all = (supportedLangs || []).map(function (l) {
        return { code: l.code, name: l.name, nativeName: l.nativeName || l.name };
      });

      // Ensure "en" (original) is always first
      var enIdx = all.findIndex(function (l) { return l.code === "en"; });
      if (enIdx >= 0) {
        var en = all.splice(enIdx, 1)[0];
        all.unshift(en);
      }

      all.forEach(function (lang) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "loc-option";
        btn.style.width = "100%";
        btn.style.padding = "6px 12px";
        btn.style.textAlign = "left";
        btn.style.border = "none";
        btn.style.background = "transparent";
        btn.style.cursor = "pointer";
        btn.style.display = "flex";
        btn.style.justContent = "space-between";
        btn.style.alignItems = "center";
        btn.style.gap = "8px";
        btn.style.color = "hsl(220 47% 11%)";
        btn.innerHTML = '<span style="flex:1;text-align:left;"><span style="font-size:13px;font-weight:500;">' +
          escapeHtml(lang.nativeName) + "</span><div style=\"font-size:11px;color:hsl(220 16% 43%);\">" +
          escapeHtml(lang.name) + "</div></span>";
        btn.innerHTML += '<span style="font-size:11px;color:hsl(220 16% 43%);">' + lang.code + "</span>";

        btn.addEventListener("click", function () {
          selectLanguage(lang);
        });

        listbox.appendChild(btn);
      });
    }

    function filterLanguages(query) {
      var options = listbox.querySelectorAll(".loc-option");
      options.forEach(function (opt) {
        var txt = opt.textContent.toLowerCase();
        opt.style.display = txt.indexOf(query) >= 0 ? "" : "none";
      });
    }

    function escapeHtml(str) {
      var div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }

    function selectLanguage(lang) {
      var langCode = lang.code;
      localStorage.setItem(LS_KEY, langCode);
      applyDirection(langCode);

      // Update trigger label
      var cur = document.getElementById("loc-cur-lang");
      if (cur) cur.textContent = lang.nativeName || lang.name;

      // Apply translations
      if (langCode === sourceLang || langCode === "en") {
        // Restore original
        restoreOriginal();
      } else {
        applyLanguage(langCode, sourceLang);
      }

      // Close dropdown
      listbox.style.display = "none";
      dropdown.style.border = "1px solid hsl(220 20% 90%)";
    }

    function applyLanguage(langCode, srcLang) {
      fetchTranslations(langCode, function (data) {
        if (data && data.segments && data.segments.length > 0) {
          // Use published translations
          applyTranslations(data);
        } else {
          // No published translations — try dynamic translation
          translatePageDynamic(langCode, srcLang);
        }
      });
    }

    // Toggle dropdown
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      if (listbox.style.display === "none") {
        listbox.style.display = "block";
        buildOptions();
        searchInput.value = "";
        filterLanguages("");
        searchInput.focus();
        dropdown.style.border = "1px solid hsl(220 63% 53%)";
      } else {
        listbox.style.display = "none";
        dropdown.style.border = "1px solid hsl(220 20% 90%)";
      }
    });

    // Close on outside click
    function closeOnOutside(e) {
      if (container && !container.contains(e.target)) {
        listbox.style.display = "none";
        dropdown.style.border = "1px solid hsl(220 20% 90%)";
      }
    }
    setTimeout(function () {
      document.addEventListener("click", closeOnOutside);
    }, 0);

    dropdown.appendChild(trigger);
    dropdown.appendChild(listbox);
    container.appendChild(dropdown);

    // Reset button
    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "loc-reset";
    resetBtn.style.width = "100%";
    resetBtn.style.padding = "6px 12px";
    resetBtn.style.marginTop = "4px";
    resetBtn.style.borderRadius = "8px";
    resetBtn.style.border = "1px solid hsl(220 20% 90%)";
    resetBtn.style.background = "transparent";
    resetBtn.style.cursor = "pointer";
    resetBtn.style.color = "hsl(220 16% 43%)";
    resetBtn.style.fontSize = "12px";
    resetBtn.innerHTML = '<span style="display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 1 1.84 4.91L6 16l2.13 2.13A7 7 0 1 0 5 12h2zm12.73-2.73l-2.13 2.13 2.13 2.13 2.13-2.13-2.13-2.13z"></path></svg>Reset to English</span>';
    resetBtn.addEventListener("click", function () {
      restoreOriginal();
    });

    // Loading indicator
    var loading = document.createElement("div");
    loading.id = "loc-loading";
    loading.style.padding = "6px 12px";
    loading.style.color = "hsl(220 16% 43%)";
    loading.style.fontSize = "12px";
    loading.style.display = "none";
    loading.innerHTML = '<div style="display:flex;align-items:center;gap:6px;"><div style="width:14px;height:14px;border:2px solid hsl(220 63% 53%);border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;"></div>Translating...</div>';

    container.appendChild(loading);
  }

  // ---- Dynamic page translation (for content without published translations) ----
  function translatePageDynamic(targetLang, sourceLang) {
    var loading = document.getElementById("loc-loading");
    if (loading) loading.style.display = "block";

    // Select translatable elements
    var selectors = [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "button", "span", "div",
      "a", "li", "label", "input[placeholder]",
      "textarea[placeholder]", "td", "th", "caption",
      "[data-translate]"
    ];

    var elements = [];
    selectors.forEach(function (sel) {
      try {
        var found = document.querySelectorAll(sel);
        for (var i = 0; i < found.length; i++) {
          elements.push(found[i]);
        }
      } catch (e) {
        // skip invalid selectors
      }
    });

    // Extract text, dedupe, and batch translate
    var texts = [];
    var textMap = new Map();
    var skipTags = ["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "NOSCRIPT", "SVG", "IMG", "META"];

    elements.forEach(function (el) {
      var tn = el.tagName;
      if (skipTags.indexOf(tn) !== -1) return;
      if (tn === "INPUT" && el.getAttribute("type") !== "placeholder") return;
      if (tn === "TEXTAREA") return;

      var text;
      if (tn === "INPUT") {
        text = el.getAttribute("placeholder") || "";
      } else if (tn === "META") {
        text = el.getAttribute("content") || "";
      } else {
        text = el.textContent || "";
      }

      text = text.trim();
      if (!text || text.length < 2) return;

      if (!textMap.has(text)) {
        textMap.set(text, []);
      }
      textMap.get(text).push(el);
      texts.push(text);
    });

    // Dedupe
    var uniqueTexts = Array.from(new Set(texts));
    // Batch in chunks
    var batchSize = 25;
    var idx = 0;

    function translateChunk() {
      if (idx >= uniqueTexts.length) {
        if (loading) loading.style.display = "none";
        return;
      }

      var chunk = uniqueTexts.slice(idx, idx + batchSize);
      idx += batchSize;

      var url = BASE_URL + "/api/translation/translate";
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        try {
          var data = JSON.parse(xhr.responseText);
          var translations = data.translations || [];
          translations.forEach(function (t) {
            var translated = t.translated_text;
            if (translated) {
              var els = textMap.get(t.source_text) || [];
              els.forEach(function (el) {
                if (el.tagName === "INPUT") {
                  el.setAttribute("placeholder", translated);
                } else if (el.tagName === "META") {
                  el.setAttribute("content", translated);
                } else {
                  el.textContent = translated;
                }
              });
            }
          });
        } catch (e) {
          // ignore parse errors
        }
        translateChunk();
      };
      xhr.timeout = 30000;
      xhr.send(JSON.stringify({
        texts: chunk,
        source_language: "auto",
        target_language: targetLang,
      }));
    }

    translateChunk();
  }

  // ---- Bootstrap ----
  function init() {
    var path = currentPagePath();

    fetchTranslations(DEFAULT_LANG, function (data) {
      var targetLang = DEFAULT_LANG || "es";
      var sourceLang = "en";
      var supportedLangs = [];

      if (data) {
        sourceLang = data.source_language || "en";
        targetLang = data.target_language || DEFAULT_LANG;

        // Fetch supported languages for the selector
        var langsXhr = new XMLHttpRequest();
        langsXhr.open("GET", BASE_URL + "/api/translation/languages", true);
        langsXhr.onreadystatechange = function () {
          if (langsXhr.readyState !== 4) return;
          if (langsXhr.status === 200) {
            try {
              var langsData = JSON.parse(langsXhr.responseText);
              supportedLangs = langsData.languages || [];
            } catch (e) {
              supportedLangs = [];
            }
          }
          var resolved = resolveLanguage(targetLang, sourceLang);
          if (resolved === targetLang) {
            applyTranslations(data);
            applyDirection(resolved);
            injectSelector(data, resolved, sourceLang, targetLang, supportedLangs);
          } else {
            injectSelector(data, resolved, sourceLang, targetLang, supportedLangs);
            applyDirection(resolved);
          }
          CURRENT_LANG = resolved;
        };
        langsXhr.timeout = 5000;
        langsXhr.send();
      } else {
        // No published data — still inject selector for dynamic translation
        injectSelector(data || { target_language: targetLang }, targetLang, sourceLang, targetLang, []);
        applyDirection(targetLang);
        CURRENT_LANG = targetLang;
      }
    });
  }

  // Inject CSS for spinner animation
  function injectStyles() {
    var css = "@-webkit-keyframes spin{0%{-webkit-transform:rotate(0);transform:rotate(0)}100%{-webkit-transform:rotate(360deg);transform:rotate(360deg)}}@keyframes spin{0%{-webkit-transform:rotate(0);transform:rotate(0)}100%{-webkit-transform:rotate(360deg);transform:rotate(360deg)}}";
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }
  injectStyles();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
