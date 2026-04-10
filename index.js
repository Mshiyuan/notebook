import { extension_settings, getContext } from "../../../extensions.js";
import { eventSource, event_types } from "../../../../script.js";

const extensionName = "characterNotebook";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

// 初始化数据结构
if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}

let wrapperElem = null;
let textareaElem = null;
let currentChatId = null;
let currentCharacterName = null;

// 核心：保存笔记内容
function saveNote() {
    if (!currentChatId || !currentCharacterName) return;
    
    const content = textareaElem.val();
    
    if (!extension_settings[extensionName][currentCharacterName]) {
        extension_settings[extensionName][currentCharacterName] = {};
    }
    
    // 按角色 -> 存档ID 存储
    extension_settings[extensionName][currentCharacterName][currentChatId] = {
        main_note: content,
        last_updated: Date.now()
    };
    
    // ST原生API：触发扩展设置保存
    saveSettingsDebounced();
}

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
