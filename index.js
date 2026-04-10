import { extension_settings, getContext } from "../../../extensions.js";
import { eventSource, event_types, saveSettingsDebounced } from "../../../../script.js";

const extensionName = "characterNotebook";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

// 确保数据结构存在
if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {
        config: { showBall: false, theme: 'minimal' },
        notes: {}
    };
}
const pluginData = extension_settings[extensionName];

let currentChatId = null;
let currentCharacterName = null;

// 1. 拖拽逻辑
function makeDraggable(dragHandle, targetElement) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    dragHandle.on('mousedown', function(e) {
        if ($(e.target).hasClass('sy-close-btn') || $(e.target).is('input, textarea, select')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = targetElement[0].getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        $(document).on('mousemove.syDrag', function(event) {
            if (!isDragging) return;
            targetElement.css({
                left: initialLeft + (event.clientX - startX) + 'px',
                top: initialTop + (event.clientY - startY) + 'px',
                bottom: 'auto',
                right: 'auto',
                transform: 'none'
            });
        });

        $(document).on('mouseup.syDrag', function() {
            isDragging = false;
            $(document).off('mousemove.syDrag mouseup.syDrag');
        });
    });
}

// 2. 笔记数据读写
function saveNote() {
    if (!currentChatId || !currentCharacterName) return;
    const content = $('#sy-notebook-textarea').val();
    
    if (!pluginData.notes[currentCharacterName]) pluginData.notes[currentCharacterName] = {};
    pluginData.notes[currentCharacterName][currentChatId] = content;
    saveSettingsDebounced();
}

function loadNote() {
    const context = getContext();
    currentChatId = context.chatId;
    currentCharacterName = context.name1; 

    if (!currentChatId || !currentCharacterName) {
        $('#sy-notebook-title').text("角色笔记 (未选择)");
        $('#sy-notebook-textarea').val("");
        return;
    }

    $('#sy-notebook-title').text(`笔记: ${currentCharacterName}`);
    const charNotes = pluginData.notes[currentCharacterName];
    $('#sy-notebook-textarea').val(charNotes && charNotes[currentChatId] ? charNotes[currentChatId] : "");
}

// 3. 核心：注入扩展菜单按钮 (带轮询重试机制)
function injectExtensionMenuButton(retryCount = 0) {
    const MAX_RETRIES = 10;
    const RETRY_DELAY = 500;

    // 获取 ST 的扩展菜单容器
    const extensionsMenu = document.getElementById('extensions_menu');

    if (extensionsMenu) {
        if (document.getElementById('sy-notebook-menu-entry')) return; // 防止重复注入

        // 严格按照原生格式创建条目
        const menuEntry = document.createElement('div');
        menuEntry.id = 'sy-notebook-menu-entry';
        menuEntry.className = 'list-group-item flex-container flexGap5 interactable';
        menuEntry.title = '角色笔记设置';
        menuEntry.setAttribute('tabindex', '0');

        const iconSpan = document.createElement('span');
        iconSpan.innerHTML = '<i class="fa-solid fa-book-journal-whills fa-fw"></i>';
        menuEntry.appendChild(iconSpan);

        const textSpan = document.createElement('span');
        textSpan.textContent = '角色笔记本';
        menuEntry.appendChild(textSpan);

        // 点击事件：打开设置面板并关闭原有的抽屉
        menuEntry.onclick = () => {
            $('#sy-notebook-settings').fadeIn(200);
            $('#extensionsMenuButton').trigger('click'); 
        };

        // 插入到菜单最上方
        extensionsMenu.prepend(menuEntry);
        console.log('Character Notebook: 菜单按钮注入成功。');
    } else {
        if (retryCount < MAX_RETRIES) {
            setTimeout(() => injectExtensionMenuButton(retryCount + 1), RETRY_DELAY);
        } else {
            console.error('Character Notebook: 找不到扩展菜单，注入失败。');
        }
    }
}

// 4. UI 与事件初始化
async function initUI() {
    const htmlUrl = `${extensionFolderPath}template.html`;
    const htmlContent = await $.get(htmlUrl);
    
    // 注入核心 UI 到 body
    $('body').append(htmlContent);

    // 触发按钮注入
    injectExtensionMenuButton();

    // 获取 DOM 元素
    const ball = $('#sy-notebook-ball');
    const settingsPanel = $('#sy-notebook-settings');
    const notePanel = $('#sy-notebook-panel');

    // 初始化配置状态
    $('#sy-toggle-ball').prop('checked', pluginData.config.showBall);
    $('#sy-theme-select').val(pluginData.config.theme);
    if (pluginData.config.showBall) ball.show();
    notePanel.removeClass('minimal glass').addClass(pluginData.config.theme);

    // 设置面板逻辑
    $('#sy-close-settings').on('click', () => settingsPanel.fadeOut(200));
    
    $('#sy-toggle-ball').on('change', function() {
        pluginData.config.showBall = this.checked;
        saveSettingsDebounced();
        this.checked ? ball.fadeIn(200) : ball.fadeOut(200);
    });

    $('#sy-theme-select').on('change', function() {
        const theme = $(this).val();
        pluginData.config.theme = theme;
        saveSettingsDebounced();
        notePanel.removeClass('minimal glass').addClass(theme);
    });

    // 悬浮球逻辑：点击打开笔记面板
    ball.on('click', function() {
        if (ball.attr('data-dragging') === 'true') return; 
        notePanel.fadeIn(200);
        loadNote();
    });

    // 笔记面板逻辑
    $('#sy-close-panel').on('click', () => notePanel.fadeOut(200));
    
    let saveTimeout;
    $('#sy-notebook-textarea').on('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveNote, 500);
    });

    // 绑定拖拽
    makeDraggable(ball, ball);
    makeDraggable($('#sy-notebook-panel .sy-drag-handle'), notePanel);

    ball.on('mousedown', () => ball.attr('data-dragging', 'false'));
    ball.on('mousemove', () => ball.attr('data-dragging', 'true'));
}

// 启动扩展
jQuery(async () => {
    await initUI();
    eventSource.on(event_types.CHAT_CHANGED, loadNote);
});
                top: initialTop + (event.clientY - startY) + 'px',
                bottom: 'auto',
                right: 'auto',
                transform: 'none' // 覆盖居中用的 transform
            });
        });

        $(document).on('mouseup.syDrag', function() {
            isDragging = false;
            $(document).off('mousemove.syDrag mouseup.syDrag');
        });
    });
}

// 2. 笔记数据读写
function saveNote() {
    if (!currentChatId || !currentCharacterName) return;
    const content = $('#sy-notebook-textarea').val();
    
    if (!pluginData.notes[currentCharacterName]) pluginData.notes[currentCharacterName] = {};
    pluginData.notes[currentCharacterName][currentChatId] = content;
    saveSettingsDebounced();
}

function loadNote() {
    const context = getContext();
    currentChatId = context.chatId;
    currentCharacterName = context.name1; 

    if (!currentChatId || !currentCharacterName) {
        $('#sy-notebook-title').text("角色笔记 (未选择)");
        $('#sy-notebook-textarea').val("");
        return;
    }

    $('#sy-notebook-title').text(`笔记: ${currentCharacterName}`);
    const charNotes = pluginData.notes[currentCharacterName];
    $('#sy-notebook-textarea').val(charNotes && charNotes[currentChatId] ? charNotes[currentChatId] : "");
}

// 3. UI 与事件初始化
async function initUI() {
    const htmlUrl = `${extensionFolderPath}template.html`;
    const htmlContent = await $.get(htmlUrl);
    
    // 解析 HTML 模板
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // 注入核心 UI 到 body
    $('body').append(doc.querySelector('#sy-notebook-system'));
    
    // 注入菜单条目到魔法棒下拉列表 (兼容 ST 的 extensionsMenu)
    // 根据截图，寻找 id 为 extensionsMenu 的容器并追加
    const menuEntry = $(doc.querySelector('#sy-notebook-menu-template').innerHTML);
    $('#extensionsMenu').append(menuEntry);

    // 获取 DOM 元素
    const ball = $('#sy-notebook-ball');
    const settingsPanel = $('#sy-notebook-settings');
    const notePanel = $('#sy-notebook-panel');

    // 初始化配置状态
    $('#sy-toggle-ball').prop('checked', pluginData.config.showBall);
    $('#sy-theme-select').val(pluginData.config.theme);
    if (pluginData.config.showBall) ball.show();
    notePanel.removeClass('minimal glass').addClass(pluginData.config.theme);

    // 绑定事件：魔法棒菜单点击 -> 打开设置面板
    menuEntry.on('click', () => {
        settingsPanel.fadeIn(200);
        // 如果魔法棒菜单还开着，尝试自动关闭它 (触发 ST 原生逻辑)
        $('#extensionsMenuButton').trigger('click');
    });

    // 设置面板逻辑
    $('#sy-close-settings').on('click', () => settingsPanel.fadeOut(200));
    
    $('#sy-toggle-ball').on('change', function() {
        pluginData.config.showBall = this.checked;
        saveSettingsDebounced();
        this.checked ? ball.fadeIn(200) : ball.fadeOut(200);
    });

    $('#sy-theme-select').on('change', function() {
        const theme = $(this).val();
        pluginData.config.theme = theme;
        saveSettingsDebounced();
        notePanel.removeClass('minimal glass').addClass(theme);
    });

    // 悬浮球逻辑：点击打开笔记面板
    ball.on('click', function(e) {
        // 防止拖拽完松手时误触点击
        if (ball.attr('data-dragging') === 'true') return; 
        notePanel.fadeIn(200);
        loadNote();
    });

    // 笔记面板逻辑
    $('#sy-close-panel').on('click', () => notePanel.fadeOut(200));
    
    let saveTimeout;
    $('#sy-notebook-textarea').on('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveNote, 500);
    });

    // 绑定拖拽
    makeDraggable(ball, ball);
    makeDraggable($('#sy-notebook-panel .sy-drag-handle'), notePanel);

    // 处理悬浮球拖拽时的误触问题
    ball.on('mousedown', () => ball.attr('data-dragging', 'false'));
    ball.on('mousemove', () => ball.attr('data-dragging', 'true'));
}

// 启动扩展
jQuery(async () => {
    await initUI();
    eventSource.on(event_types.CHAT_CHANGED, loadNote);
});
// 核心：读取笔记内容
function loadNote() {
    const context = getContext();
    currentChatId = context.chatId;
    currentCharacterName = context.name1; // ST中通常name1是当前角色名
    
    if (!currentChatId || !currentCharacterName) {
        textareaElem.val("");
        $('#sy-notebook-title').text("角色笔记 (未选择)");
        return;
    }

    $('#sy-notebook-title').text(`笔记: ${currentCharacterName}`);

    const charData = extension_settings[extensionName][currentCharacterName];
    if (charData && charData[currentChatId] && charData[currentChatId].main_note) {
        textareaElem.val(charData[currentChatId].main_note);
    } else {
        textareaElem.val("");
    }
}

// 拖拽逻辑实现
function makeDraggable(headerElem, wrapper) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    headerElem.on('mousedown', function(e) {
        if (!wrapper.hasClass('sy-float-mode')) return; // 面板模式不许拖拽
        if ($(e.target).closest('.sy-icon-btn').length) return; // 点按钮不触发拖拽

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        const rect = wrapper[0].getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        $(document).on('mousemove.syNotebook', function(event) {
            if (!isDragging) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            wrapper.css({
                left: initialLeft + dx + 'px',
                top: initialTop + dy + 'px',
                bottom: 'auto',
                right: 'auto'
            });
        });

        $(document).on('mouseup.syNotebook', function() {
            isDragging = false;
            $(document).off('mousemove.syNotebook');
            $(document).off('mouseup.syNotebook');
        });
    });
}

// 界面初始化
async function initUI() {
    // 加载 HTML 模板
    const htmlUrl = `${extensionFolderPath}template.html`;
    const htmlTemplate = await $.get(htmlUrl);
    
    // 将面板注入到底栏旁边的绝对定位层，或者放入 #chat_form 内部
    $('#chat_form').append(htmlTemplate);
    
    wrapperElem = $('#sy-notebook-wrapper');
    textareaElem = $('#sy-notebook-textarea');
    const dragHandle = $('.sy-notebook-drag-handle');

    // 1. 添加底部扩展栏唤醒按钮 (在发送按钮附近加一个小本子图标)
    const toggleBtnHtml = `<div id="sy-bottom-bar-btn" class="mes_button" title="打开角色笔记">
        <i class="fa-solid fa-book-open"></i>
    </div>`;
    // 注入到底部输入框左侧的扩展按钮组中
    $('#options_button').before(toggleBtnHtml);

    // 2. 绑定唤醒/关闭事件
    $('#sy-bottom-bar-btn').on('click', () => {
        wrapperElem.fadeToggle(200);
        loadNote();
    });

    $('#sy-notebook-close').on('click', () => {
        wrapperElem.fadeOut(200);
    });

    // 3. 绑定悬浮/面板切换事件
    $('#sy-notebook-toggle-float').on('click', () => {
        if (wrapperElem.hasClass('sy-panel-mode')) {
            wrapperElem.removeClass('sy-panel-mode').addClass('sy-float-mode');
            // 切换到悬浮时，给一个默认的屏幕中心偏右位置
            wrapperElem.css({ top: '20%', left: '60%', right: 'auto', bottom: 'auto' });
        } else {
            wrapperElem.removeClass('sy-float-mode').addClass('sy-panel-mode');
            // 切换回面板时，清除内联样式交由 CSS 接管
            wrapperElem.css({ top: '', left: '', right: '', bottom: '' });
        }
    });

    // 4. 绑定实时保存事件 (防抖处理，用户输入时自动保存)
    let saveTimeout;
    textareaElem.on('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveNote, 500); // 停止输入 500ms 后保存
    });

    // 5. 绑定拖拽
    makeDraggable(dragHandle, wrapperElem);
}

// 监听 ST 事件
jQuery(async () => {
    await initUI();
    
    // 当切换角色或载入新聊天时，自动加载对应笔记
    eventSource.on(event_types.CHAT_CHANGED, loadNote);
});
