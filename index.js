/**
 * Character Notebook - SillyTavern Extension
 * 为每个角色卡附加私人笔记本
 * Author: 时鸢
 * License: MIT
 */

import { getContext, extension_settings, saveSettingsDebounced } from "../../../extensions.js";

const EXT_NAME = "cn-notebook";
const VERSION = "1.0.0";

// ============================================================
//  默认配置
// ============================================================
const DEFAULT_CONFIG = {
    showBall: false,
    theme: "minimal",       // minimal | glass | follow-st | custom
    customCSS: "",
    collapseOnBlur: false,  // 点空白收起面板
};

function ensureData() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = { config: { ...DEFAULT_CONFIG }, notes: {} };
    }
    const d = extension_settings[EXT_NAME];
    if (!d.config) d.config = { ...DEFAULT_CONFIG };
    if (!d.notes) d.notes = {};
    // 补全新增字段
    for (const k of Object.keys(DEFAULT_CONFIG)) {
        if (d.config[k] === undefined) d.config[k] = DEFAULT_CONFIG[k];
    }
    return d;
}

// ============================================================
//  工具函数
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
    const char = ctx.characters?.[ctx.characterId];
    return char?.name || "未知角色";
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

// ============================================================
//  状态管理
// ============================================================
let state = {
    currentView: "editor",  // editor | archives | settings
    currentArchiveId: null,
    isFloating: false,
    isPanelOpen: false,
    isBallVisible: false,
};

// ============================================================
//  HTML 模板
// ============================================================
function buildHTML() {
    return `
<!-- 悬浮球 -->
<div id="cn-ball" class="cn-ball" style="display:none;" title="打开笔记本">
    <i class="fa-solid fa-feather-pointed"></i>
</div>

<!-- 遮罩 -->
<div id="cn-overlay" class="cn-overlay" style="display:none;"></div>

<!-- 主面板 -->
<div id="cn-panel" class="cn-panel cn-theme-minimal" style="display:none;">

    <!-- ===== 编辑器视图 ===== -->
    <div id="cn-view-editor" class="cn-view">
        <div class="cn-topbar">
            <button class="cn-btn-icon cn-go-settings" title="设置">
                <i class="fa-solid fa-gear"></i>
            </button>
            <div class="cn-char-info cn-go-archives" title="点击查看存档列表">
                <div class="cn-avatar-wrap">
                    <img id="cn-avatar" class="cn-avatar" src="" alt="">
                    <div class="cn-avatar-fallback"><i class="fa-solid fa-user"></i></div>
                </div>
                <span id="cn-char-name" class="cn-char-name">未选择角色</span>
            </div>
            <div class="cn-topbar-right">
                <button class="cn-btn-icon cn-btn-float" title="悬浮模式">
                    <i class="fa-solid fa-up-right-and-down-left-from-center"></i>
                </button>
                <button class="cn-btn-icon cn-btn-close" title="关闭">
                    <i class="fa-solid fa-xmark"></i>
                </button>
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

    <!-- ===== 存档列表视图 ===== -->
    <div id="cn-view-archives" class="cn-view" style="display:none;">
        <div class="cn-topbar">
            <button class="cn-btn-icon cn-go-back-editor" title="返回">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <div class="cn-char-info">
                <div class="cn-avatar-wrap">
                    <img id="cn-avatar-list" class="cn-avatar" src="" alt="">
                    <div class="cn-avatar-fallback"><i class="fa-solid fa-user"></i></div>
                </div>
                <span id="cn-char-name-list" class="cn-char-name">存档列表</span>
            </div>
            <div class="cn-topbar-right">
                <button class="cn-btn-icon cn-btn-close" title="关闭">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
        <div class="cn-search-bar">
            <i class="fa-solid fa-magnifying-glass cn-search-icon"></i>
            <input id="cn-search" class="cn-search-input" type="text" placeholder="搜索笔记..." />
        </div>
        <div id="cn-archive-list" class="cn-archive-list"></div>
        <button id="cn-archive-add" class="cn-btn-add" title="新建笔记">
            <i class="fa-solid fa-plus"></i>
        </button>
    </div>

    <!-- ===== 设置视图 ===== -->
    <div id="cn-view-settings" class="cn-view" style="display:none;">
        <div class="cn-topbar">
            <button class="cn-btn-icon cn-go-back-editor" title="返回">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <span class="cn-view-title">设置</span>
            <div class="cn-topbar-right"></div>
        </div>
        <div class="cn-settings-body">
            <div class="cn-setting-group">
                <label class="cn-setting-label">主题</label>
                <select id="cn-opt-theme" class="cn-select">
                    <option value="minimal">极简黑白</option>
                    <option value="glass">毛玻璃</option>
                    <option value="follow-st">跟随ST主题</option>
                    <option value="custom">自定义</option>
                </select>
            </div>
            <div id="cn-custom-css-group" class="cn-setting-group" style="display:none;">
                <label class="cn-setting-label">自定义CSS</label>
                <textarea id="cn-opt-custom-css" class="cn-custom-css-input" placeholder="粘贴你的CSS变量覆盖..."></textarea>
            </div>
            <div class="cn-setting-group cn-setting-row">
                <label class="cn-setting-label" for="cn-opt-ball">显示悬浮球</label>
                <input type="checkbox" id="cn-opt-ball" class="cn-checkbox" />
            </div>
            <div class="cn-setting-group cn-setting-row">
                <label class="cn-setting-label" for="cn-opt-blur-close">点击空白区域收起面板</label>
                <input type="checkbox" id="cn-opt-blur-close" class="cn-checkbox" />
            </div>
            <div class="cn-setting-group">
                <span class="cn-version-info">Character Notebook v${VERSION} by 时鸢</span>
            </div>
        </div>
    </div>

    <!-- 缩放手柄（悬浮模式） -->
    <div id="cn-resize-handle" class="cn-resize-handle" style="display:none;"></div>
</div>
`;
}

// ============================================================
//  视图切换
// ============================================================
function showView(name) {
    state.currentView = name;
    $("#cn-view-editor, #cn-view-archives, #cn-view-settings").hide();
    $(`#cn-view-${name}`).show();
}

// ============================================================
//  主题
// ============================================================
function applyTheme() {
    const d = ensureData();
    const panel = $("#cn-panel");
    panel.removeClass("cn-theme-minimal cn-theme-glass cn-theme-follow-st cn-theme-custom");
    panel.addClass(`cn-theme-${d.config.theme}`);

    // 移除旧的自定义样式
    $("#cn-custom-style").remove();

    if (d.config.theme === "custom" && d.config.customCSS) {
        $("head").append(`<style id="cn-custom-style">${d.config.customCSS}</style>`);
    }
}

// ============================================================
//  面板开关
// ============================================================
function openPanel() {
    state.isPanelOpen = true;
    const d = ensureData();

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
//  加载角色信息
// ============================================================
function loadCurrentChar() {
    const charKey = getCharKey();
    const charName = getCharName();
    const avatarUrl = getCharAvatar();

    // 更新头像和名称
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

    // 加载第一个存档（如果没有就创建）
    const archives = getArchives(charKey);
    if (!archives.length) {
        createArchive(charKey, "默认笔记");
    }

    if (!state.currentArchiveId || !archives.find(a => a.id === state.currentArchiveId)) {
        state.currentArchiveId = archives[0].id;
    }

    loadArchiveContent();
}

function loadArchiveContent() {
    const charKey = getCharKey();
    if (!charKey || !state.currentArchiveId) return;

    const archives = getArchives(charKey);
    const archive = archives.find(a => a.id === state.currentArchiveId);
    if (!archive) return;

    $("#cn-textarea").val(archive.content);
    $("#cn-archive-title").val(archive.title);
    $("#cn-save-status").text("");
}

// ============================================================
//  存档列表
// ============================================================
function renderArchiveList(filter) {
    const charKey = getCharKey();
    const container = $("#cn-archive-list");
    container.empty();

    if (!charKey) {
        container.append('<div class="cn-empty">未选择角色</div>');
        return;
    }

    let archives = getArchives(charKey);
    if (filter) {
        const q = filter.toLowerCase();
        archives = archives.filter(a =>
            a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q)
        );
    }

    if (!archives.length) {
        container.append('<div class="cn-empty">没有找到笔记</div>');
        return;
    }

    archives.forEach(a => {
        const isActive = a.id === state.currentArchiveId;
        const preview = a.content.slice(0, 50).replace(/\n/g, " ") || "空笔记";
        const card = $(`
            <div class="cn-archive-card ${isActive ? "cn-active" : ""}" data-id="${a.id}">
                <div class="cn-card-header">
                    <span class="cn-card-title">${escapeHtml(a.title)}</span>
                    <span class="cn-card-date">${formatDate(a.updated)}</span>
                </div>
                <div class="cn-card-preview">${escapeHtml(preview)}</div>
                <button class="cn-card-delete" data-id="${a.id}" title="删除">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `);
        container.append(card);
    });
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
//  保存
// ============================================================
let saveTimer = null;

function saveCurrentNote() {
    const charKey = getCharKey();
    if (!charKey || !state.currentArchiveId) return;

    const archives = getArchives(charKey);
    const archive = archives.find(a => a.id === state.currentArchiveId);
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
//  悬浮模式
// ============================================================
function enterFloat() {
    state.isFloating = true;
    const panel = $("#cn-panel");
    panel.addClass("cn-floating");
    $("#cn-resize-handle").show();
    $("#cn-overlay").hide();

    // 居中放置
    panel.css({
        left: "calc(50vw - 180px)",
        top: "calc(50vh - 250px)",
        width: "360px",
        height: "500px",
    });

    $(".cn-btn-float i").attr("class", "fa-solid fa-compress");
}

function exitFloat() {
    state.isFloating = false;
    const panel = $("#cn-panel");
    panel.removeClass("cn-floating");
    $("#cn-resize-handle").hide();
    panel.css({ left: "", top: "", width: "", height: "" });
    $(".cn-btn-float i").attr("class", "fa-solid fa-up-right-and-down-left-from-center");

    if (state.isPanelOpen) {
        $("#cn-overlay").show();
    }
}

// ============================================================
//  拖拽 & 缩放
// ============================================================
function setupDrag() {
    let dragging = false;
    let ox = 0, oy = 0;

    function getPos(e) {
        const t = e.originalEvent?.touches;
        return t ? { x: t[0].clientX, y: t[0].clientY } : { x: e.clientX, y: e.clientY };
    }

    // 面板拖拽
    $(document).on("mousedown touchstart", ".cn-floating .cn-topbar", function (e) {
        if ($(e.target).closest(".cn-btn-icon, .cn-char-info").length) return;
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

    // 缩放
    let resizing = false;
    $(document).on("mousedown touchstart", "#cn-resize-handle", function (e) {
        resizing = true;
        e.preventDefault();
        e.stopPropagation();
    });

    $(document).on("mousemove touchmove", function (e) {
        if (!resizing) return;
        const pos = getPos(e);
        const rect = document.getElementById("cn-panel").getBoundingClientRect();
        $("#cn-panel").css({
            width: Math.max(280, pos.x - rect.left + 8) + "px",
            height: Math.max(350, pos.y - rect.top + 8) + "px",
        });
    });

    $(document).on("mouseup touchend", function () { resizing = false; });

    // 悬浮球拖拽
    let ballDrag = false;
    let ballMoved = false;
    let bx = 0, by = 0;

    $(document).on("mousedown touchstart", "#cn-ball", function (e) {
        ballDrag = true;
        ballMoved = false;
        const pos = getPos(e);
        const rect = this.getBoundingClientRect();
        bx = pos.x - rect.left;
        by = pos.y - rect.top;
    });

    $(document).on("mousemove touchmove", function (e) {
        if (!ballDrag) return;
        ballMoved = true;
        const pos = getPos(e);
        $("#cn-ball").css({
            left: (pos.x - bx) + "px",
            top: (pos.y - by) + "px",
            right: "auto",
        });
    });

    $(document).on("mouseup touchend", function () {
        if (ballDrag && !ballMoved) {
            // 点击 → 打开面板
            openPanel();
            showView("editor");
        }
        ballDrag = false;
    });
}

// ============================================================
//  事件绑定
// ============================================================
function bindEvents() {
    const d = ensureData();

    // 关闭
    $(document).on("click", ".cn-btn-close", closePanel);

    // 遮罩点击
    $(document).on("click", "#cn-overlay", function () {
        if (d.config.collapseOnBlur) {
            closePanel();
        }
    });

    // 悬浮模式切换
    $(document).on("click", ".cn-btn-float", function () {
        state.isFloating ? exitFloat() : enterFloat();
    });

    // 导航：设置
    $(document).on("click", ".cn-go-settings", function () {
        showView("settings");
    });

    // 导航：存档列表
    $(document).on("click", ".cn-go-archives", function () {
        showView("archives");
        renderArchiveList();
        $("#cn-search").val("");
    });

    // 导航：返回编辑器
    $(document).on("click", ".cn-go-back-editor", function () {
        showView("editor");
    });

    // 搜索
    $(document).on("input", "#cn-search", function () {
        renderArchiveList($(this).val());
    });

    // 点击存档卡片
    $(document).on("click", ".cn-archive-card", function (e) {
        if ($(e.target).closest(".cn-card-delete").length) return;
        state.currentArchiveId = $(this).data("id");
        loadArchiveContent();
        showView("editor");
    });

    // 删除存档
    $(document).on("click", ".cn-card-delete", function (e) {
        e.stopPropagation();
        const id = $(this).data("id");
        const charKey = getCharKey();
        const archives = getArchives(charKey);
        if (archives.length <= 1) {
            alert("至少保留一个笔记！");
            return;
        }
        if (!confirm("确定删除这条笔记？")) return;
        deleteArchive(charKey, id);
        if (state.currentArchiveId === id) {
            state.currentArchiveId = getArchives(charKey)[0]?.id || null;
            loadArchiveContent();
        }
        renderArchiveList($("#cn-search").val());
    });

    // 新建存档
    $(document).on("click", "#cn-archive-add", function () {
        const charKey = getCharKey();
        if (!charKey) return;
        const entry = createArchive(charKey, "未命名笔记");
        state.currentArchiveId = entry.id;
        loadArchiveContent();
        showView("editor");
        // 自动聚焦标题
        setTimeout(() => {
            $("#cn-archive-title").focus().select();
        }, 100);
    });

    // 编辑器自动保存
    $(document).on("input", "#cn-textarea", queueSave);
    $(document).on("input", "#cn-archive-title", queueSave);

    // 设置项
    $(document).on("change", "#cn-opt-theme", function () {
        d.config.theme = $(this).val();
        saveSettingsDebounced();
        applyTheme();
        // 显隐自定义CSS框
        if (d.config.theme === "custom") {
            $("#cn-custom-css-group").show();
        } else {
            $("#cn-custom-css-group").hide();
        }
    });

    $(document).on("input", "#cn-opt-custom-css", function () {
        d.config.customCSS = $(this).val();
        saveSettingsDebounced();
        applyTheme();
    });

    $(document).on("change", "#cn-opt-ball", function () {
        d.config.showBall = this.checked;
        saveSettingsDebounced();
        if (this.checked) {
            state.isBallVisible = true;
            $("#cn-ball").fadeIn(200);
        } else {
            state.isBallVisible = false;
            $("#cn-ball").fadeOut(200);
        }
    });

    $(document).on("change", "#cn-opt-blur-close", function () {
        d.config.collapseOnBlur = this.checked;
        saveSettingsDebounced();
    });
}

// ============================================================
//  加载设置到UI
// ============================================================
function loadSettingsUI() {
    const d = ensureData();
    $("#cn-opt-theme").val(d.config.theme);
    $("#cn-opt-custom-css").val(d.config.customCSS || "");
    $("#cn-opt-ball").prop("checked", d.config.showBall);
    $("#cn-opt-blur-close").prop("checked", d.config.collapseOnBlur);

    if (d.config.theme === "custom") {
        $("#cn-custom-css-group").show();
    }

    if (d.config.showBall) {
        state.isBallVisible = true;
        $("#cn-ball").show();
    }
}

// ============================================================
//  菜单注入 —— setInterval 轮询等待 ST 菜单就绪
// ============================================================
function injectMenuButton() {
    const poll = setInterval(() => {
        // ST 扩展菜单在不同版本 ID 可能不同，遍历查找
        const menu = document.getElementById("extensionsMenu")
            || document.getElementById("extensions_menu")
            || document.querySelector("#data_bank_wand_container");

        if (!menu) return;
        if (document.getElementById("cn-menu-entry")) {
            clearInterval(poll);
            return;
        }

        const entry = document.createElement("div");
        entry.id = "cn-menu-entry";
        entry.className = "list-group-item flex-container flexGap5 interactable";
        entry.tabIndex = 0;
        entry.title = "角色笔记本";
        entry.innerHTML = `<span><i class="fa-solid fa-book-journal-whills fa-fw"></i></span><span>笔记本</span>`;

        entry.addEventListener("click", () => {
            // 收起扩展菜单
            const wand = document.getElementById("extensionsMenuButton");
            if (wand) wand.click();

            setTimeout(() => {
                if (state.isPanelOpen) {
                    closePanel();
                } else {
                    openPanel();
                    showView("editor");
                }
            }, 120);
        });

        menu.prepend(entry);
        clearInterval(poll);
        console.log(`[${EXT_NAME}] 菜单按钮已注入`);
    }, 500);
}

// ============================================================
//  监听角色切换
// ============================================================
async function listenCharSwitch() {
    try {
        const { eventSource, event_types } = await import("../../../../script.js");
        eventSource.on(event_types.CHAT_CHANGED, () => {
            state.currentArchiveId = null;
            if (state.isPanelOpen) {
                loadCurrentChar();
                if (state.currentView === "archives") {
                    renderArchiveList();
                }
            }
        });
        console.log(`[${EXT_NAME}] 角色切换监听已绑定`);
    } catch (e) {
        console.warn(`[${EXT_NAME}] 无法监听角色切换事件:`, e.message);
    }
}

// ============================================================
//  入口
// ============================================================
jQuery(async () => {
    ensureData();

    // 注入 HTML
    $("body").append(buildHTML());

    // 初始化
    applyTheme();
    loadSettingsUI();
    bindEvents();
    setupDrag();
    injectMenuButton();
    await listenCharSwitch();

    console.log(`[${EXT_NAME}] v${VERSION} 加载完成`);
});
