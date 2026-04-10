// 【探针 1】只要 ST 读取了这个文件，控制台一定会打印这句话
console.log("【角色笔记本】步骤 1：index.js 已经被 ST 读取，开始执行...");

const extensionName = "characterNotebook";
let pluginData = null;
let currentChatId = null;
let currentCharacterName = null;

// 将 HTML 直接内嵌，避开所有文件路径请求
const notebookHTML = `
<div id="sy-notebook-system">
    <div id="sy-notebook-settings" class="sy-panel" style="display: none; padding: 15px;">
        <div class="sy-header" style="margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 5px;">
            <span style="font-weight: bold;">笔记设置</span>
            <i class="fa-solid fa-xmark sy-close-btn" id="sy-close-settings" style="float: right; cursor: pointer;"></i>
        </div>
        <div class="sy-body">
            <div class="sy-setting-row" style="margin-bottom: 10px;">
                <label style="cursor: pointer;"><input type="checkbox" id="sy-toggle-ball" style="margin-right: 5px;">开启桌面悬浮球</label>
            </div>
            <div class="sy-setting-row">
                <label style="margin-right: 10px;">笔记面板主题</label>
                <select id="sy-theme-select" style="background: var(--SmartThemeChatBackgroundColor); color: inherit;">
                    <option value="minimal">极简纯色 (Minimal)</option>
                    <option value="glass">毛玻璃 (Glass)</option>
                </select>
            </div>
        </div>
    </div>

    <div id="sy-notebook-ball" style="display: none;" title="点击打开笔记">
        <i class="fa-solid fa-feather-pointed"></i>
    </div>

    <div id="sy-notebook-panel" class="sy-panel minimal" style="display: none;">
        <div class="sy-header sy-drag-handle">
            <span id="sy-notebook-title">笔记载入中...</span>
            <div class="sy-controls">
                <i class="fa-solid fa-xmark sy-close-btn" id="sy-close-panel"></i>
            </div>
        </div>
        <div class="sy-body">
            <textarea id="sy-notebook-textarea" placeholder="在此记录当前角色的设定、伏笔与灵感..."></textarea>
        </div>
    </div>
</div>
`;

jQuery(async () => {
    console.log("【角色笔记本】步骤 2：DOM 加载完成，开始导入核心依赖...");

    // 核心：使用安全动态导入。如果有错误，立刻捕获并弹窗。
    let extension_settings, getContext, eventSource, event_types, saveSettingsDebounced;
    try {
        const ex = await import("../../../extensions.js");
        extension_settings = ex.extension_settings;
        getContext = ex.getContext;

        const sc = await import("../../../../script.js");
        eventSource = sc.eventSource;
        event_types = sc.event_types;
        saveSettingsDebounced = sc.saveSettingsDebounced;
        console.log("【角色笔记本】步骤 3：核心依赖加载成功！");
    } catch (error) {
        console.error("【角色笔记本】致命错误：无法导入 ST 核心依赖！请按 F12 检查文件层级结构。", error);
        alert("角色笔记本插件加载失败：路径导入错误（详见 F12 控制台）。");
        return; // 终止执行
    }

    // 初始化数据
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = { config: { showBall: false, theme: 'minimal' }, notes: {} };
    }
    pluginData = extension_settings[extensionName];

    // 注入 HTML
    $('body').append(notebookHTML);
    console.log("【角色笔记本】步骤 4：HTML 骨架注入完成。");

    // 注入魔法棒菜单 (死缠烂打模式)
    const interval = setInterval(() => {
        const extensionsMenu = document.getElementById('extensionsMenu') || document.getElementById('extensions_menu');
        if (extensionsMenu) {
            if (!document.getElementById('sy-notebook-menu-entry')) {
                const menuEntry = document.createElement('div');
                menuEntry.id = 'sy-notebook-menu-entry';
                menuEntry.className = 'list-group-item flex-container flexGap5 interactable';
                menuEntry.title = '角色笔记设置';
                menuEntry.setAttribute('tabindex', '0');
                menuEntry.innerHTML = '<span><i class="fa-solid fa-book-journal-whills fa-fw"></i></span><span>角色笔记本</span>';
                
                menuEntry.onclick = () => {
                    $('#sy-notebook-settings').fadeIn(200);
                    $('#extensionsMenuButton').trigger('click'); 
                };
                
                extensionsMenu.prepend(menuEntry);
                console.log("【角色笔记本】步骤 5：魔法棒菜单入口注入成功！");
            }
            clearInterval(interval);
        }
    }, 500);

    // 获取 DOM
    const ball = $('#sy-notebook-ball');
    const settingsPanel = $('#sy-notebook-settings');
    const notePanel = $('#sy-notebook-panel');

    // UI 逻辑初始化
    $('#sy-toggle-ball').prop('checked', pluginData.config.showBall);
    $('#sy-theme-select').val(pluginData.config.theme);
    if (pluginData.config.showBall) ball.show();
    notePanel.removeClass('minimal glass').addClass(pluginData.config.theme);

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

    ball.on('click', function() {
        if (ball.attr('data-dragging') === 'true') return; 
        notePanel.fadeIn(200);
        loadNote();
    });

    $('#sy-close-panel').on('click', () => notePanel.fadeOut(200));

    // 数据读写逻辑
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

    let saveTimeout;
    $('#sy-notebook-textarea').on('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveNote, 500);
    });

    // 拖拽逻辑
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
                    bottom: 'auto', right: 'auto', transform: 'none'
                });
            });
            $(document).on('mouseup.syDrag', function() {
                isDragging = false;
                $(document).off('mousemove.syDrag mouseup.syDrag');
            });
        });
    }

    makeDraggable(ball, ball);
    makeDraggable($('#sy-notebook-panel .sy-drag-handle'), notePanel);
    ball.on('mousedown', () => ball.attr('data-dragging', 'false'));
    ball.on('mousemove', () => ball.attr('data-dragging', 'true'));

    eventSource.on(event_types.CHAT_CHANGED, loadNote);
});
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

// --- 3. 笔记数据读写 ---
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

// --- 4. 核心：死缠烂打式注入魔法棒菜单 ---
function injectExtensionMenuButton() {
    // 设置一个定时器，每 500ms 找一次菜单，找到了才停下来
    const interval = setInterval(() => {
        // 兼容 ST 各种版本可能存在的 ID
        const extensionsMenu = document.getElementById('extensions_menu') || document.getElementById('extensionsMenu');
        
        if (extensionsMenu) {
            // 如果还没注入，就注入
            if (!document.getElementById('sy-notebook-menu-entry')) {
                const menuEntry = document.createElement('div');
                menuEntry.id = 'sy-notebook-menu-entry';
                menuEntry.className = 'list-group-item flex-container flexGap5 interactable';
                menuEntry.title = '角色笔记设置';
                menuEntry.setAttribute('tabindex', '0');

                menuEntry.innerHTML = `
                    <span><i class="fa-solid fa-book-journal-whills fa-fw"></i></span>
                    <span>角色笔记本</span>
                `;

                menuEntry.onclick = () => {
                    $('#sy-notebook-settings').fadeIn(200);
                    // 模拟点击关闭魔法棒菜单
                    $('#extensionsMenuButton').trigger('click'); 
                };

                extensionsMenu.prepend(menuEntry);
                console.log('Character Notebook: 菜单入口注入成功！');
            }
            // 找到了并处理完毕，清除定时器
            clearInterval(interval); 
        }
    }, 500);
}

// --- 5. UI 与事件初始化 ---
async function initUI() {
    // 直接把写好的 HTML 塞进网页，100% 不会因为找不到文件报错
    $('body').append(notebookHTML);

    // 唤起死缠烂打注入器
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
