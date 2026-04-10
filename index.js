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

    // 核心：使用安全动态导入
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
        console.error("【角色笔记本】致命错误：无法导入 ST 核心依赖！", error);
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

    // 注入魔法棒菜单
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
