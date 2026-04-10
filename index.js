console.log("【角色笔记本】脚本成功加载，开始执行！");

const extensionName = "characterNotebook";
let pluginData = null;
let currentChatId = null;
let currentCharacterName = null;

const notebookHTML = `
<div id="sy-notebook-system">
    <div id="sy-notebook-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 9999;"></div>

    <div id="sy-notebook-settings" class="sy-panel" style="display: none; padding: 15px; background: var(--SmartThemeChatBackgroundColor); border: 1px solid var(--SmartThemeBorderColor); position: fixed; top: 15vh; left: 50%; transform: translateX(-50%); width: 85vw; max-width: 320px; z-index: 10000; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); color: var(--SmartThemeBodyColor);">
        <div class="sy-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 8px;">
            <span style="font-weight: bold; font-size: 1.1em;">笔记设置</span>
            <i class="fa-solid fa-xmark sy-close-btn" id="sy-close-settings" style="cursor: pointer; padding: 5px; font-size: 1.2em;"></i>
        </div>
        <div class="sy-body">
            <div class="sy-setting-row" style="margin-bottom: 20px; display: flex; align-items: center;">
                <input type="checkbox" id="sy-toggle-ball" style="margin-right: 10px; transform: scale(1.3);">
                <label for="sy-toggle-ball" style="cursor: pointer; font-size: 1.1em;">开启桌面悬浮球</label>
            </div>
            <div class="sy-setting-row" style="display: flex; flex-direction: column; gap: 8px;">
                <label style="margin-right: 10px; font-size: 1.1em;">笔记面板主题</label>
                <select id="sy-theme-select" style="background: var(--SmartThemeChatBackgroundColor); color: inherit; border: 1px solid var(--SmartThemeBorderColor); padding: 8px; border-radius: 5px; width: 100%; font-size: 1em;">
                    <option value="minimal">极简纯色</option>
                    <option value="glass">毛玻璃</option>
                </select>
            </div>
        </div>
    </div>

    <div id="sy-notebook-ball" style="display: none; position: fixed; top: 50vh; right: 10px; width: 45px; height: 45px; background: var(--SmartThemeBlurTintColor); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.2); border-radius: 50%; display: flex; justify-content: center; align-items: center; color: var(--SmartThemeBodyColor); font-size: 1.2em; cursor: grab; z-index: 9998; box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: transform 0.2s;" title="点击打开笔记">
        <i class="fa-solid fa-feather-pointed"></i>
    </div>

    <div id="sy-notebook-panel" class="sy-panel minimal" style="display: none; position: fixed; top: 10vh; left: 5vw; width: 90vw; max-width: 400px; height: 60vh; z-index: 9999; display: flex; flex-direction: column; border-radius: 10px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); color: var(--SmartThemeBodyColor); resize: both;">
        <div class="sy-header sy-drag-handle" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: rgba(0,0,0,0.1); border-bottom: 1px solid var(--SmartThemeBorderColor); user-select: none; cursor: grab;">
            <span id="sy-notebook-title" style="font-weight: bold; font-size: 1.1em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">笔记载入中...</span>
            <div class="sy-controls">
                <i class="fa-solid fa-xmark sy-close-btn" id="sy-close-panel" style="cursor: pointer; padding: 5px; font-size: 1.2em;"></i>
            </div>
        </div>
        <div class="sy-body" style="flex-grow: 1; padding: 15px;">
            <textarea id="sy-notebook-textarea" placeholder="在此记录当前角色的设定、伏笔与灵感..." style="width: 100%; height: 100%; resize: none; background: transparent; border: none; color: inherit; font-family: inherit; font-size: 1em; line-height: 1.6; outline: none;"></textarea>
        </div>
    </div>
</div>
`;

jQuery(async () => {
    let extension_settings, getContext, eventSource, event_types, saveSettingsDebounced;
    try {
        const ex = await import("../../../extensions.js");
        extension_settings = ex.extension_settings;
        getContext = ex.getContext;
        const sc = await import("../../../../script.js");
        eventSource = sc.eventSource;
        event_types = sc.event_types;
        saveSettingsDebounced = sc.saveSettingsDebounced;
    } catch (error) {
        console.error("【角色笔记本】依赖加载失败", error);
        return;
    }

    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = { config: { showBall: false, theme: 'minimal' }, notes: {} };
    }
    pluginData = extension_settings[extensionName];

    $('body').append(notebookHTML);

    const injectInterval = setInterval(() => {
        const extensionsMenu = document.getElementById('extensions_menu') || document.getElementById('extensionsMenu');
        if (extensionsMenu) {
            if (!document.getElementById('sy-notebook-menu-entry')) {
                const menuEntry = document.createElement('div');
                menuEntry.id = 'sy-notebook-menu-entry';
                menuEntry.className = 'list-group-item flex-container flexGap5 interactable';
                menuEntry.title = '角色笔记设置';
                menuEntry.setAttribute('tabindex', '0');
                menuEntry.innerHTML = '<span><i class="fa-solid fa-book-journal-whills fa-fw"></i></span><span>角色笔记本</span>';
                
                menuEntry.onclick = () => {
                    // 同时显示遮罩层和设置面板
                    $('#sy-notebook-overlay').fadeIn(200);
                    $('#sy-notebook-settings').fadeIn(200);
                    $('#extensionsMenuButton').trigger('click'); 
                };
                
                extensionsMenu.prepend(menuEntry);
            }
            clearInterval(injectInterval);
        }
    }, 500);

    const ball = $('#sy-notebook-ball');
    const settingsPanel = $('#sy-notebook-settings');
    const notePanel = $('#sy-notebook-panel');
    const overlay = $('#sy-notebook-overlay');

    function applyTheme() {
        if (pluginData.config.theme === 'glass') {
            notePanel.css({ 'background': 'var(--SmartThemeBlurTintColor)', 'backdrop-filter': 'blur(15px)', '-webkit-backdrop-filter': 'blur(15px)', 'border': '1px solid rgba(255,255,255,0.1)' });
        } else {
            notePanel.css({ 'background': 'var(--SmartThemeChatBackgroundColor)', 'backdrop-filter': 'none', '-webkit-backdrop-filter': 'none', 'border': '1px solid var(--SmartThemeBorderColor)' });
        }
    }

    $('#sy-toggle-ball').prop('checked', pluginData.config.showBall);
    $('#sy-theme-select').val(pluginData.config.theme);
    if (pluginData.config.showBall) ball.show();
    applyTheme();

    // 核心救命功能：点击X按钮，或者点击遮罩层（屏幕空白处），都会立刻关闭设置
    $('#sy-close-settings, #sy-notebook-overlay').on('click', () => {
        settingsPanel.fadeOut(200);
        overlay.fadeOut(200);
    });
    
    $('#sy-toggle-ball').on('change', function() {
        pluginData.config.showBall = this.checked;
        saveSettingsDebounced();
        this.checked ? ball.fadeIn(200) : ball.fadeOut(200);
    });

    $('#sy-theme-select').on('change', function() {
        pluginData.config.theme = $(this).val();
        saveSettingsDebounced();
        applyTheme();
    });

    ball.on('click', function() {
        if (ball.attr('data-dragging') === 'true') return; 
        notePanel.fadeIn(200);
        loadNote();
    });

    $('#sy-close-panel').on('click', () => notePanel.fadeOut(200));

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

    function makeDraggable(dragHandle, targetElement) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;
        dragHandle.on('mousedown touchstart', function(e) {
            if ($(e.target).hasClass('sy-close-btn') || $(e.target).is('input, textarea, select')) return;
            isDragging = true;
            
            // 兼容手机端触摸和电脑端鼠标
            const clientX = e.type.includes('touch') ? e.originalEvent.touches[0].clientX : e.clientX;
            const clientY = e.type.includes('touch') ? e.originalEvent.touches[0].clientY : e.clientY;

            startX = clientX;
            startY = clientY;
            const rect = targetElement[0].getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            
            $(document).on('mousemove.syDrag touchmove.syDrag', function(event) {
                if (!isDragging) return;
                const curX = event.type.includes('touch') ? event.originalEvent.touches[0].clientX : event.clientX;
                const curY = event.type.includes('touch') ? event.originalEvent.touches[0].clientY : event.clientY;
                
                targetElement.css({
                    left: initialLeft + (curX - startX) + 'px',
                    top: initialTop + (curY - startY) + 'px',
                    bottom: 'auto', right: 'auto', transform: 'none'
                });
            });
            $(document).on('mouseup.syDrag touchend.syDrag', function() {
                isDragging = false;
                $(document).off('mousemove.syDrag touchmove.syDrag mouseup.syDrag touchend.syDrag');
            });
        });
    }

    makeDraggable(ball, ball);
    makeDraggable($('#sy-notebook-panel .sy-drag-handle'), notePanel);
    ball.on('mousedown touchstart', () => ball.attr('data-dragging', 'false'));
    ball.on('mousemove touchmove', () => ball.attr('data-dragging', 'true'));

    eventSource.on(event_types.CHAT_CHANGED, loadNote);
});
