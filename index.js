/**
 * Character Notebook - SillyTavern Extension
 * Author: 时鸢 | v1.1.0
 */

const EXT_NAME = "cn-notebook";
const VERSION = "1.1.0";

console.log(`[${EXT_NAME}] 脚本开始加载...`);

// ============================================================
//  默认配置 & 内置主题
// ============================================================
const BUILTIN_THEMES = {
    "minimal-dark": {
        name: "极简·夜",
        builtin: true,
        vars: {
            "--cn-bg": "#1a1a1a",
            "--cn-bg-secondary": "#242424",
            "--cn-bg-hover": "#2e2e2e",
            "--cn-bg-active": "#383838",
            "--cn-text": "#e8e8e8",
            "--cn-text-secondary": "#aaa",
            "--cn-text-muted": "#666",
            "--cn-border": "#333",
            "--cn-accent": "#ccc",
            "--cn-shadow": "0 8px 32px rgba(0,0,0,0.5)",
            "--cn-backdrop": "none",
        },
    },
    "minimal-light": {
        name: "极简·昼",
        builtin: true,
        vars: {
            "--cn-bg": "#f5f5f5",
            "--cn-bg-secondary": "#eaeaea",
            "--cn-bg-hover": "#e0e0e0",
            "--cn-bg-active": "#d5d5d5",
            "--cn-text": "#1a1a1a",
            "--cn-text-secondary": "#555",
            "--cn-text-muted": "#999",
            "--cn-border": "#d0d0d0",
            "--cn-accent": "#333",
            "--cn-shadow": "0 8px 32px rgba(0,0,0,0.12)",
            "--cn-backdrop": "none",
        },
    },
    glass: {
        name: "毛玻璃",
        builtin: true,
        vars: {
            "--cn-bg": "rgba(20,20,28,0.72)",
            "--cn-bg-secondary": "rgba(255,255,255,0.05)",
            "--cn-bg-hover": "rgba(255,255,255,0.08)",
            "--cn-bg-active": "rgba(255,255,255,0.12)",
            "--cn-text": "#f0f0f0",
            "--cn-text-secondary": "rgba(255,255,255,0.65)",
            "--cn-text-muted": "rgba(255,255,255,0.35)",
            "--cn-border": "rgba(255,255,255,0.1)",
            "--cn-accent": "rgba(255,255,255,0.8)",
            "--cn-shadow": "0 8px 40px rgba(0,0,0,0.4)",
            "--cn-backdrop": "blur(24px) saturate(1.4)",
        },
    },
    "follow-st": {
        name: "跟随ST主题",
        builtin: true,
        vars: {
            "--cn-bg": "var(--SmartThemeChatBackgroundColor,#1a1a1a)",
            "--cn-bg-secondary": "var(--SmartThemeBlurTintColor,#242424)",
            "--cn-bg-hover": "var(--SmartThemeBlurTintColor,#2e2e2e)",
            "--cn-bg-active": "var(--SmartThemeBorderColor,#383838)",
            "--cn-text": "var(--SmartThemeBodyColor,#e8e8e8)",
            "--cn-text-secondary": "var(--SmartThemeEmColor,#aaa)",
            "--cn-text-muted": "var(--SmartThemeQuoteColor,#666)",
            "--cn-border": "var(--SmartThemeBorderColor,#333)",
            "--cn-accent": "var(--SmartThemeBodyColor,#ccc)",
            "--cn-shadow": "0 8px 32px rgba(0,0,0,0.4)",
            "--cn-backdrop": "none",
        },
    },
};

const DEFAULT_CONFIG = {
    showBall: false,
    activeTheme: "minimal-dark",
    collapseOnBlur: false,
    userThemes: {},
};

let extension_settings = null;
let getContext = null;
let saveSettingsDebounced = null;

function ensureData() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = { config: { ...DEFAULT_CONFIG }, notes: {} };
    }
    const d = extension_settings[EXT_NAME];
    if (!d.config) d.config = { ...DEFAULT_CONFIG };
    if (!d.notes) d.notes = {};
    if (!d.config.userThemes) d.config.userThemes = {};
    for (const k of Object.keys(DEFAULT_CONFIG)) {
        if (d.config[k] === undefined) d.config[k] = DEFAULT_CONFIG[k];
    }
    return d;
}

function getAllThemes() {
    const d = ensureData();
    return { ...BUILTIN_THEMES, ...d.config.userThemes };
}

// ============================================================
//  工具
// ============================================================
function getCharKey() {
    const ctx = getContext();
    if (ctx.characterId == null) return null;
    const char = ctx.characters?.[ctx.characterId];
    return char?.avatar || `char_${ctx.characterId}`;
}

function getCharName() {
    const ctx = getContext();
    if (ctx.characterId == null) return null;
    return ctx.characters?.[ctx.characterId]?.name || "未知角色";
}

function getCharAvatar() {
    const ctx = getContext();
    if (ctx.characterId == null) return null;
    const char = ctx.characters?.[ctx.characterId];
    if (!char?.avatar) return null;
    return `/characters/${encodeURIComponent(char.avatar)}`;
}

function getArchives(charKey) {
    const d = ensureData();
    if (!charKey) return [];
    if (!d.notes[charKey]) d.notes[charKey] = [];
    return d.notes[charKey];
}

function createArchive(charKey, title) {
    const archives = getArchives(charKey);
    const entry = {
        id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: title || "未命名笔记",
        content: "",
        created: Date.now(),
        updated: Date.now(),
    };
    archives.unshift(entry);
    saveSettingsDebounced();
    return entry;
}

function deleteArchive(charKey, archiveId) {
    const d = ensureData();
    if (!d.notes[charKey]) return;
    d.notes[charKey] = d.notes[charKey].filter(a => a.id !== archiveId);
    saveSettingsDebounced();
}

function formatDate(ts) {
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mm}-${dd} ${hh}:${mi}`;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
//  状态
// ============================================================
let state = {
    currentView: "editor",
    currentArchiveId: null,
    isFloating: false,
    isPanelOpen: false,
    avatarSpinning: false,
};

// ============================================================
//  HTML
// ============================================================
function buildHTML() {
    return `
<div id="cn-ball" class="cn-ball" style="display:none;" title="打开笔记本">
    <i class="fa-solid fa-feather-pointed"></i>
</div>
<div id="cn-overlay" class="cn-overlay" style="display:none;"></div>
<div id="cn-panel" class="cn-panel" style="display:none;">

    <!-- 编辑器 -->
    <div id="cn-view-editor" class="cn-view">
        <div class="cn-topbar">
            <button class="cn-btn-icon cn-go-settings" title="设置"><i class="fa-solid fa-gear"></i></button>
            <div class="cn-char-info cn-avatar-toggle" title="点击切换存档列表">
                <div class="cn-avatar-wrap">
                    <img class="cn-avatar" src="" alt="" style="display:none;">
                    <div class="cn-avatar-fallback"><i class="fa-solid fa-user"></i></div>
                </div>
                <span class="cn-char-name">未选择角色</span>
            </div>
            <div class="cn-topbar-right">
                <button class="cn-btn-icon cn-btn-float" title="悬浮模式"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>
                <button class="cn-btn-icon cn-btn-close" title="关闭"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="cn-archive-title-bar">
            <input id="cn-archive-title" class="cn-archive-title-input" type="text" placeholder="笔记标题" />
            <span id="cn-save-status" class="cn-save-status"></span>
        </div>
        <div class="cn-editor-area">
            <textarea id="cn-textarea" class="cn-textarea" placeholder="在这里写笔记..."></textarea>
        </div>
    </div>

    <!-- 存档列表 -->
    <div id="cn-view-archives" class="cn-view" style="display:none;">
        <div class="cn-topbar">
            <div class="cn-char-info cn-avatar-toggle" title="点击返回编辑器">
                <div class="cn-avatar-wrap">
                    <img class="cn-avatar" src="" alt="" style="display:none;">
                    <div class="cn-avatar-fallback"><i class="fa-solid fa-user"></i></div>
                </div>
                <span class="cn-char-name">存档列表</span>
            </div>
            <div class="cn-topbar-right">
                <button class="cn-btn-icon cn-btn-close" title="关闭"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="cn-search-bar">
            <i class="fa-solid fa-magnifying-glass cn-search-icon"></i>
            <input id="cn-search" class="cn-search-input" type="text" placeholder="搜索笔记..." />
        </div>
        <div id="cn-archive-list" class="cn-archive-list"></div>
        <button id="cn-archive-add" class="cn-btn-add" title="新建笔记"><i class="fa-solid fa-plus"></i></button>
    </div>

    <!-- 设置 -->
    <div id="cn-view-settings" class="cn-view" style="display:none;">
        <div class="cn-topbar">
            <button class="cn-btn-icon cn-go-back-editor" title="返回"><i class="fa-solid fa-arrow-left"></i></button>
            <span class="cn-view-title">设置</span>
            <div class="cn-topbar-right"></div>
        </div>
        <div class="cn-settings-body">
            <div class="cn-setting-group">
                <label class="cn-setting-label">主题</label>
                <select id="cn-opt-theme" class="cn-select"></select>
            </div>
            <div class="cn-setting-group cn-theme-actions">
                <button id="cn-theme-import" class="cn-btn-small">导入主题</button>
                <button id="cn-theme-export" class="cn-btn-small">导出当前</button>
                <button id="cn-theme-delete" class="cn-btn-small cn-btn-danger" style="display:none;">删除主题</button>
            </div>
            <div class="cn-setting-group cn-setting-row">
                <label class="cn-setting-label" for="cn-opt-ball">显示悬浮球</label>
                <input type="checkbox" id="cn-opt-ball" class="cn-checkbox" />
            </div>
            <div class="cn-setting-group cn-setting-row">
                <label class="cn-setting-label" for="cn-opt-blur-close">点击空白区域收起</label>
                <input type="checkbox" id="cn-opt-blur-close" class="cn-checkbox" />
            </div>
            <div class="cn-setting-group">
                <span class="cn-version-info">Character Notebook v${VERSION} by 时鸢</span>
            </div>
        </div>
    </div>

    <!-- 四角缩放手柄（悬浮模式） -->
    <div class="cn-resize-handle cn-resize-tl" style="display:none;"></div>
    <div class="cn-resize-handle cn-resize-tr" style="display:none;"></div>
    <div class="cn-resize-handle cn-resize-bl" style="display:none;"></div>
    <div class="cn-resize-handle cn-resize-br" style="display:none;"></div>
</div>`;
}

// ============================================================
//  视图切换（带头像旋转动画）
// ============================================================
function showView(name) {
    state.currentView = name;
    $("#cn-view-editor, #cn-view-archives, #cn-view-settings").hide();
    $(`#cn-view-${name}`).show();
}

function spinAvatarAndSwitch(targetView) {
    if (state.avatarSpinning) return;
    state.avatarSpinning = true;

    const wrap = $(".cn-avatar-wrap")[0];
    // 每次都从 0 开始转一圈，用 Web Animations API 避免 class 状态残留
    wrap.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
        { duration: 450, easing: "cubic-bezier(0.4, 0, 0.2, 1)" }
    );

    setTimeout(() => {
        showView(targetView);
        if (targetView === "archives") {
            renderArchiveList();
            $("#cn-search").val("");
        }
    }, 220);

    setTimeout(() => {
        state.avatarSpinning = false;
    }, 460);
}

// ============================================================
//  主题系统
// ============================================================
function applyTheme() {
    const d = ensureData();
    const themes = getAllThemes();
    const theme = themes[d.config.activeTheme] || themes["minimal-dark"];
    const panel = document.getElementById("cn-panel");
    if (!panel) return;

    // 应用 CSS 变量
    for (const [k, v] of Object.entries(theme.vars)) {
        panel.style.setProperty(k, v);
    }

    // 毛玻璃需要额外设置 backdrop-filter
    if (theme.vars["--cn-backdrop"] && theme.vars["--cn-backdrop"] !== "none") {
        panel.style.backdropFilter = theme.vars["--cn-backdrop"];
        panel.style.webkitBackdropFilter = theme.vars["--cn-backdrop"];
    } else {
        panel.style.backdropFilter = "none";
        panel.style.webkitBackdropFilter = "none";
    }
}

function renderThemeSelect() {
    const d = ensureData();
    const themes = getAllThemes();
    const sel = $("#cn-opt-theme");
    sel.empty();
    for (const [id, t] of Object.entries(themes)) {
        sel.append(`<option value="${id}">${escapeHtml(t.name)}${t.builtin ? "" : " (自定义)"}</option>`);
    }
    sel.val(d.config.activeTheme);
    updateDeleteButton();
}

function updateDeleteButton() {
    const d = ensureData();
    const themes = getAllThemes();
    const current = themes[d.config.activeTheme];
    if (current && !current.builtin) {
        $("#cn-theme-delete").show();
    } else {
        $("#cn-theme-delete").hide();
    }
}

function exportTheme() {
    const d = ensureData();
    const themes = getAllThemes();
    const theme = themes[d.config.activeTheme];
    if (!theme) return;
    const data = { name: theme.name, vars: theme.vars };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cn-theme-${d.config.activeTheme}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importTheme() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (!data.name || !data.vars) {
                    alert("无效的主题文件：缺少 name 或 vars 字段");
                    return;
                }
                const d = ensureData();
                const id = `user_${Date.now()}`;
                d.config.userThemes[id] = { name: data.name, builtin: false, vars: data.vars };
                d.config.activeTheme = id;
                saveSettingsDebounced();
                renderThemeSelect();
                applyTheme();
            } catch (err) {
                alert("主题文件解析失败：" + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function deleteCurrentTheme() {
    const d = ensureData();
    const themes = getAllThemes();
    const current = themes[d.config.activeTheme];
    if (!current || current.builtin) return;
    if (!confirm(`确定删除主题「${current.name}」？`)) return;
    delete d.config.userThemes[d.config.activeTheme];
    d.config.activeTheme = "minimal-dark";
    saveSettingsDebounced();
    renderThemeSelect();
    applyTheme();
}

// ============================================================
//  面板
// ============================================================
function openPanel() {
    state.isPanelOpen = true;
    if (state.isFloating) {
        $("#cn-panel").fadeIn(150);
    } else {
        $("#cn-overlay").fadeIn(150);
        $("#cn-panel").fadeIn(150);
    }
    loadCurrentChar();
}

function closePanel() {
    state.isPanelOpen = false;
    $("#cn-panel").fadeOut(150);
    $("#cn-overlay").fadeOut(150);
}

// ============================================================
//  角色 & 存档
// ============================================================
function loadCurrentChar() {
    const charKey = getCharKey();
    const charName = getCharName();
    const avatarUrl = getCharAvatar();
    $(".cn-char-name").text(charKey ? charName : "未选择角色");

    if (avatarUrl) {
        $(".cn-avatar").attr("src", avatarUrl).show();
        $(".cn-avatar-fallback").hide();
    } else {
        $(".cn-avatar").hide();
        $(".cn-avatar-fallback").show();
    }

    if (!charKey) {
        $("#cn-textarea").val("").prop("disabled", true);
        $("#cn-archive-title").val("").prop("disabled", true);
        return;
    }

    $("#cn-textarea").prop("disabled", false);
    $("#cn-archive-title").prop("disabled", false);

    const archives = getArchives(charKey);
    if (!archives.length) createArchive(charKey, "默认笔记");
    if (!state.currentArchiveId || !archives.find(a => a.id === state.currentArchiveId)) {
        state.currentArchiveId = archives[0].id;
    }
    loadArchiveContent();
}

function loadArchiveContent() {
    const charKey = getCharKey();
    if (!charKey || !state.currentArchiveId) return;
    const archive = getArchives(charKey).find(a => a.id === state.currentArchiveId);
    if (!archive) return;
    $("#cn-textarea").val(archive.content);
    $("#cn-archive-title").val(archive.title);
    $("#cn-save-status").text("");
}

function renderArchiveList(filter) {
    const charKey = getCharKey();
    const container = $("#cn-archive-list");
    container.empty();

    if (!charKey) { container.append('<div class="cn-empty">未选择角色</div>'); return; }

    let archives = getArchives(charKey);
    if (filter) {
        const q = filter.toLowerCase();
        archives = archives.filter(a => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q));
    }
    if (!archives.length) { container.append('<div class="cn-empty">没有找到笔记</div>'); return; }

    archives.forEach(a => {
        const isActive = a.id === state.currentArchiveId;
        const preview = a.content.slice(0, 50).replace(/\n/g, " ") || "空笔记";
        container.append(`
            <div class="cn-archive-card ${isActive ? "cn-active" : ""}" data-id="${a.id}">
                <div class="cn-card-main">
                    <div class="cn-card-header">
                        <span class="cn-card-title">${escapeHtml(a.title)}</span>
                        <span class="cn-card-date">${formatDate(a.updated)}</span>
                    </div>
                    <div class="cn-card-preview">${escapeHtml(preview)}</div>
                </div>
                <button class="cn-card-delete" data-id="${a.id}" title="删除">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `);
    });
}

// ============================================================
//  保存
// ============================================================
let saveTimer = null;
function saveCurrentNote() {
    const charKey = getCharKey();
    if (!charKey || !state.currentArchiveId) return;
    const archive = getArchives(charKey).find(a => a.id === state.currentArchiveId);
    if (!archive) return;
    archive.content = $("#cn-textarea").val();
    archive.title = $("#cn-archive-title").val() || "未命名笔记";
    archive.updated = Date.now();
    saveSettingsDebounced();
    $("#cn-save-status").text("已保存 ✓");
}
function queueSave() {
    clearTimeout(saveTimer);
    $("#cn-save-status").text("编辑中...");
    saveTimer = setTimeout(saveCurrentNote, 800);
}

// ============================================================
//  悬浮
// ============================================================
function enterFloat() {
    state.isFloating = true;
    $("#cn-panel").addClass("cn-floating");
    $(".cn-resize-handle").show();
    $("#cn-overlay").hide();
    $("#cn-panel").css({ left: "calc(50vw - 180px)", top: "calc(50vh - 250px)", width: "360px", height: "500px" });
    $(".cn-btn-float i").attr("class", "fa-solid fa-compress");
}

function exitFloat() {
    state.isFloating = false;
    $("#cn-panel").removeClass("cn-floating");
    $(".cn-resize-handle").hide();
    $("#cn-panel").css({ left: "", top: "", width: "", height: "" });
    $(".cn-btn-float i").attr("class", "fa-solid fa-up-right-and-down-left-from-center");
    if (state.isPanelOpen) $("#cn-overlay").show();
}

// ============================================================
//  拖拽 & 四角缩放
// ============================================================
function setupDrag() {
    let dragging = false, ox = 0, oy = 0;
    function getPos(e) {
        const t = e.originalEvent?.touches;
        return t ? { x: t[0].clientX, y: t[0].clientY } : { x: e.clientX, y: e.clientY };
    }

    // 面板拖拽
    $(document).on("mousedown touchstart", ".cn-floating .cn-topbar", function (e) {
        if ($(e.target).closest(".cn-btn-icon, .cn-char-info, .cn-avatar-toggle").length) return;
        dragging = true;
        const pos = getPos(e);
        const rect = document.getElementById("cn-panel").getBoundingClientRect();
        ox = pos.x - rect.left;
        oy = pos.y - rect.top;
        e.preventDefault();
    });
    $(document).on("mousemove touchmove", function (e) {
        if (!dragging) return;
        const pos = getPos(e);
        $("#cn-panel").css({ left: (pos.x - ox) + "px", top: (pos.y - oy) + "px" });
    });
    $(document).on("mouseup touchend", function () { dragging = false; });

    // 四角缩放
    let resizing = false, resizeCorner = "", startRect = null, startPos = null;
    $(document).on("mousedown touchstart", ".cn-resize-handle", function (e) {
        resizing = true;
        const el = this;
        if (el.classList.contains("cn-resize-tl")) resizeCorner = "tl";
        else if (el.classList.contains("cn-resize-tr")) resizeCorner = "tr";
        else if (el.classList.contains("cn-resize-bl")) resizeCorner = "bl";
        else resizeCorner = "br";
        startPos = getPos(e);
        startRect = document.getElementById("cn-panel").getBoundingClientRect();
        e.preventDefault();
        e.stopPropagation();
    });

    $(document).on("mousemove touchmove", function (e) {
        if (!resizing) return;
        const pos = getPos(e);
        const dx = pos.x - startPos.x;
        const dy = pos.y - startPos.y;
        const p = $("#cn-panel");
        const minW = 280, minH = 350;

        if (resizeCorner === "br") {
            p.css({ width: Math.max(minW, startRect.width + dx) + "px", height: Math.max(minH, startRect.height + dy) + "px" });
        } else if (resizeCorner === "bl") {
            const newW = Math.max(minW, startRect.width - dx);
            p.css({ width: newW + "px", left: (startRect.right - newW) + "px", height: Math.max(minH, startRect.height + dy) + "px" });
        } else if (resizeCorner === "tr") {
            const newH = Math.max(minH, startRect.height - dy);
            p.css({ width: Math.max(minW, startRect.width + dx) + "px", height: newH + "px", top: (startRect.bottom - newH) + "px" });
        } else if (resizeCorner === "tl") {
            const newW = Math.max(minW, startRect.width - dx);
            const newH = Math.max(minH, startRect.height - dy);
            p.css({ width: newW + "px", left: (startRect.right - newW) + "px", height: newH + "px", top: (startRect.bottom - newH) + "px" });
        }
    });
    $(document).on("mouseup touchend", function () { resizing = false; });

    // 悬浮球拖拽
    let ballDrag = false, ballMoved = false, bx = 0, by = 0;
    $(document).on("mousedown touchstart", "#cn-ball", function (e) {
        ballDrag = true; ballMoved = false;
        const pos = getPos(e);
        const rect = this.getBoundingClientRect();
        bx = pos.x - rect.left; by = pos.y - rect.top;
    });
    $(document).on("mousemove touchmove", function (e) {
        if (!ballDrag) return;
        ballMoved = true;
        const pos = getPos(e);
        $("#cn-ball").css({ left: (pos.x - bx) + "px", top: (pos.y - by) + "px", right: "auto" });
    });
    $(document).on("mouseup touchend", function () {
        if (ballDrag && !ballMoved) { openPanel(); showView("editor"); }
        ballDrag = false;
    });
}

// ============================================================
//  事件
// ============================================================
function bindEvents() {
    $(document).on("click", ".cn-btn-close", closePanel);

    $(document).on("click", "#cn-overlay", function () {
        if (ensureData().config.collapseOnBlur) closePanel();
    });

    $(document).on("click", ".cn-btn-float", function () {
        state.isFloating ? exitFloat() : enterFloat();
    });

    $(document).on("click", ".cn-go-settings", function () { showView("settings"); });
    $(document).on("click", ".cn-go-back-editor", function () { showView("editor"); });

    // ★ 头像点击：旋转半圈切换视图
    $(document).on("click", ".cn-avatar-toggle", function () {
        if (state.currentView === "editor") {
            spinAvatarAndSwitch("archives");
        } else if (state.currentView === "archives") {
            spinAvatarAndSwitch("editor");
        }
    });

    $(document).on("input", "#cn-search", function () { renderArchiveList($(this).val()); });

    // 点击存档卡片：旋转头像回编辑器
    $(document).on("click", ".cn-archive-card", function (e) {
        if ($(e.target).closest(".cn-card-delete").length) return;
        state.currentArchiveId = $(this).data("id");
        loadArchiveContent();
        spinAvatarAndSwitch("editor");
    });

    $(document).on("click", ".cn-card-delete", function (e) {
        e.stopPropagation();
        const id = $(this).data("id");
        const charKey = getCharKey();
        if (getArchives(charKey).length <= 1) { alert("至少保留一个笔记！"); return; }
        if (!confirm("确定删除这条笔记？")) return;
        deleteArchive(charKey, id);
        if (state.currentArchiveId === id) {
            state.currentArchiveId = getArchives(charKey)[0]?.id || null;
            loadArchiveContent();
        }
        renderArchiveList($("#cn-search").val());
    });

    $(document).on("click", "#cn-archive-add", function () {
        const charKey = getCharKey();
        if (!charKey) return;
        const entry = createArchive(charKey, "未命名笔记");
        state.currentArchiveId = entry.id;
        loadArchiveContent();
        spinAvatarAndSwitch("editor");
        setTimeout(() => { $("#cn-archive-title").focus().select(); }, 550);
    });

    $(document).on("input", "#cn-textarea", queueSave);
    $(document).on("input", "#cn-archive-title", queueSave);

    // 设置：主题切换
    $(document).on("change", "#cn-opt-theme", function () {
        const d = ensureData();
        d.config.activeTheme = $(this).val();
        saveSettingsDebounced();
        applyTheme();
        updateDeleteButton();
    });

    $(document).on("click", "#cn-theme-import", importTheme);
    $(document).on("click", "#cn-theme-export", exportTheme);
    $(document).on("click", "#cn-theme-delete", deleteCurrentTheme);

    $(document).on("change", "#cn-opt-ball", function () {
        const d = ensureData();
        d.config.showBall = this.checked;
        saveSettingsDebounced();
        this.checked ? $("#cn-ball").fadeIn(200) : $("#cn-ball").fadeOut(200);
    });

    $(document).on("change", "#cn-opt-blur-close", function () {
        const d = ensureData();
        d.config.collapseOnBlur = this.checked;
        saveSettingsDebounced();
    });
}

function loadSettingsUI() {
    const d = ensureData();
    renderThemeSelect();
    $("#cn-opt-ball").prop("checked", d.config.showBall);
    $("#cn-opt-blur-close").prop("checked", d.config.collapseOnBlur);
    if (d.config.showBall) $("#cn-ball").show();
}

// ============================================================
//  菜单注入
// ============================================================
function injectMenuButton() {
    const poll = setInterval(() => {
        const menu = document.getElementById("extensionsMenu")
            || document.getElementById("extensions_menu");
        if (!menu) return;
        if (document.getElementById("cn-menu-entry")) { clearInterval(poll); return; }

        const entry = document.createElement("div");
        entry.id = "cn-menu-entry";
        entry.className = "list-group-item flex-container flexGap5 interactable";
        entry.tabIndex = 0;
        entry.title = "角色笔记本";
        entry.innerHTML = '<span><i class="fa-solid fa-book-journal-whills fa-fw"></i></span><span>笔记本</span>';
        entry.addEventListener("click", () => {
            const wand = document.getElementById("extensionsMenuButton");
            if (wand) wand.click();
            setTimeout(() => {
                state.isPanelOpen ? closePanel() : (openPanel(), showView("editor"));
            }, 120);
        });
        menu.prepend(entry);
        clearInterval(poll);
        console.log(`[${EXT_NAME}] 菜单按钮已注入`);
    }, 500);
}

// ============================================================
//  入口
// ============================================================
jQuery(async () => {
    try {
        const extModule = await import("../../../extensions.js");
        extension_settings = extModule.extension_settings;
        getContext = extModule.getContext;
        if (typeof extModule.saveSettingsDebounced === "function") {
            saveSettingsDebounced = extModule.saveSettingsDebounced;
        } else {
            const scriptModule = await import("../../../../script.js");
            saveSettingsDebounced = scriptModule.saveSettingsDebounced;
        }
    } catch (err) {
        console.error(`[${EXT_NAME}] 依赖加载失败:`, err);
        return;
    }

    ensureData();
    $("body").append(buildHTML());
    applyTheme();
    loadSettingsUI();
    bindEvents();
    setupDrag();
    injectMenuButton();

    try {
        const { eventSource, event_types } = await import("../../../../script.js");
        eventSource.on(event_types.CHAT_CHANGED, () => {
            state.currentArchiveId = null;
            if (state.isPanelOpen) {
                loadCurrentChar();
                if (state.currentView === "archives") renderArchiveList();
            }
        });
    } catch (e) {
        console.warn(`[${EXT_NAME}] 角色切换监听失败:`, e.message);
    }

    console.log(`[${EXT_NAME}] v${VERSION} 加载完成`);
});
