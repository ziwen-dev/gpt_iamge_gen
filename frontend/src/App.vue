<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { initStudio, disposeStudio } from "./studio";

const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`;

onMounted(() => initStudio());
onUnmounted(() => disposeStudio());
</script>

<template>
<div class="app">
    <div class="top-alert" id="topAlert" role="alert" aria-live="assertive"></div>
    <header class="topbar">
      <div class="brand-mark" aria-label="图像创作台">
        <span class="brand-icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <rect x="4" y="5" width="16" height="14" rx="3"></rect>
            <path d="M8 13h3l2-3 3 5"></path>
            <circle cx="8.5" cy="9" r="1"></circle>
          </svg>
        </span>
        <span><strong>绘境</strong> 图像创作台</span>
      </div>
      <div class="top-actions">
        <button type="button" class="soft-btn mobile-history-btn" id="btnOpenRec">生成记录</button>
        <button type="button" class="theme-switch" id="btnTheme" role="switch" aria-checked="false">
          <span class="switch-label">暗色</span>
          <span class="switch-track" aria-hidden="true"><span class="switch-dot"></span></span>
        </button>
        <button type="button" class="avatar-btn" id="btnKey" aria-label="配置密钥">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="4"></circle>
            <path d="M4 21a8 8 0 0 1 16 0"></path>
          </svg>
        </button>
      </div>
    </header>

    <div class="layout">
      <aside class="history panel-shell" id="aside">
        <div class="panel-title">
          <span class="title-left">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 3-6.7"></path>
              <path d="M3 4v6h6"></path>
              <path d="M12 7v5l3 2"></path>
            </svg>
            生成记录
          </span>
          <button type="button" class="icon-btn" id="btnRec" aria-label="刷新记录">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 0 1-15.5 6.2"></path>
              <path d="M3 12A9 9 0 0 1 18.5 5.8"></path>
              <path d="M18 2v5h-5"></path>
              <path d="M6 22v-5h5"></path>
            </svg>
          </button>
        </div>
        <div class="records-scroll" id="recordsBox">
          <p class="empty-note">图片已在服务端归档；刷新记录或生成成功后会自动同步。</p>
        </div>
        <div class="history-foot">
          <button type="button" class="ghost-btn" id="btnClearUi">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"></path>
              <path d="M8 6V4h8v2"></path>
              <path d="M19 6l-1 14H6L5 6"></path>
            </svg>
            清空预览
          </button>
        </div>
      </aside>

      <main class="main">
        <section class="hero-copy">
          <h1>绘境 <span class="spark">✦</span></h1>
          <p><span id="typedDesc"></span><span class="typing-caret" aria-hidden="true"></span></p>
        </section>

        <div class="mode-tabs" role="tablist" aria-label="创作模式">
          <button type="button" class="mode-tab active" id="tabGenerate" data-work-mode-target="generate" role="tab" aria-selected="true">文生图</button>
          <button type="button" class="mode-tab" id="tabEdit" data-work-mode-target="edit" role="tab" aria-selected="false">图生图</button>
        </div>

        <section class="prompt-card panel-shell generate-panel">
          <div class="prompt-head">
            <label for="prompt">描述你的画面</label>
            <span class="count" id="promptCount">0 / 800</span>
          </div>
          <div class="prompt-wrap">
            <textarea id="prompt" maxlength="800">清晨的山谷风景，远处雪山被柔和阳光照亮，近处有湖泊、草地和野花，薄雾漂浮在水面上，画面宁静自然，真实摄影风格，细节清晰，色彩柔和</textarea>
          </div>
          <div class="prompt-tools">
            <div class="tool-group">
              <button type="button" class="soft-btn" id="btnClearPrompt">清空</button>
              <span class="count" id="bucketPill">分区 -</span>
            </div>
          </div>
        </section>

        <section class="mobile-generate-panel panel-shell generate-panel">
          <div class="panel-title">
            <span class="title-left">生成设置</span>
            <button type="button" class="soft-btn mobile-nav-link" data-tab-target="settings">调整</button>
          </div>
          <div class="seg-grid" style="--cols:1">
            <div class="seg-option"><span id="mobileSettingSummary">写实 · 3840x2160 · 高清</span></div>
          </div>
          <button type="button" class="primary-btn mobile-generate-btn action-pulse" id="btn-gen" style="margin-top:14px;">✦ 生成图像</button>
          <div class="msg" id="msg-gen"></div>
          <div class="cost">消耗 1 积分</div>
        </section>

        <section class="preview-card panel-shell">
          <div class="preview-title">
            <span class="title-left">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v4"></path>
                <path d="M12 18v4"></path>
                <path d="M2 12h4"></path>
                <path d="M18 12h4"></path>
                <path d="m4.9 4.9 2.8 2.8"></path>
                <path d="m16.3 16.3 2.8 2.8"></path>
                <path d="m19.1 4.9-2.8 2.8"></path>
                <path d="m7.7 16.3-2.8 2.8"></path>
              </svg>
              生成预览
            </span>
            <button type="button" class="soft-btn" id="btn-download">下载当前图</button>
          </div>
          <div class="preview-stage">
            <img id="heroImg" alt="生成预览" hidden tabindex="0" role="button" aria-label="点击放大预览" />
            <div class="hero-empty" id="heroEmpty">
              <div class="empty-icon" aria-hidden="true">
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                  <rect x="3" y="4" width="18" height="16" rx="3"></rect>
                  <circle cx="8.5" cy="9" r="1.5"></circle>
                  <path d="m21 15-5-5L5 20"></path>
                </svg>
              </div>
              <div class="empty-title">你的创作将展示在这里</div>
              <div>输入描述并点击生成，开始创造你的画面</div>
            </div>
          </div>
          <div class="hero-hint" id="heroHint">等待生成或从左侧记录选择一张图。</div>
        </section>

        <section class="edit-box panel-shell">
          <div class="panel-title">
            <span class="title-left">图生图</span>
          </div>
          <div class="edit-prompt-wrap">
            <textarea id="edit-prompt" placeholder="例如：把背景替换成极光夜空，保留主体姿态和光线方向"></textarea>
          </div>
          <div class="field-block source-card">
            <span class="field-label">编辑来源</span>
            <div class="seg-grid" style="--cols:2">
              <label class="seg-option"><input type="radio" name="src" value="saved" /><span>当前预览</span></label>
              <label class="seg-option"><input type="radio" name="src" value="upload" checked /><span>本地上传</span></label>
            </div>
            <div class="file-row" id="wrap-upload">
              <input type="file" id="image-file" class="visually-hidden" accept="image/*" />
              <label for="image-file" class="file-trigger action-pulse">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 3v12"></path>
                  <path d="m7 8 5-5 5 5"></path>
                  <path d="M5 21h14"></path>
                </svg>
                上传图片
              </label>
              <span class="file-chip" id="image-file-chip">未选择文件</span>
            </div>
          </div>
          <button type="button" class="primary-btn edit-submit-btn action-pulse" id="btn-edit">✦ 开始编辑</button>
          <div class="msg" id="msg-edit"></div>
        </section>

      </main>

      <aside class="settings panel-shell">
        <div class="panel-title">
          <span class="title-left">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"></path>
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7.1 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z"></path>
            </svg>
            生成设置
          </span>
        </div>

        <div class="field-block">
          <span class="field-label">预设风格</span>
          <div class="style-grid" id="styleGrid">
            <label class="style-card">
              <input type="radio" name="style" value="写实" checked />
              <img :src="asset('xieshi.png')" alt="写实风格" />
              <span>写实</span>
            </label>
            <label class="style-card">
              <input type="radio" name="style" value="科幻" />
              <img :src="asset('keji.png')" alt="科幻风格" />
              <span>科幻</span>
            </label>
            <label class="style-card">
              <input type="radio" name="style" value="国风" />
              <img :src="asset('shanshui.png')" alt="国风风格" />
              <span>国风</span>
            </label>
            <label class="style-card">
              <input type="radio" name="style" value="卡通" />
              <img :src="asset('katong.png')" alt="卡通风格" />
              <span>卡通</span>
            </label>
            <label class="style-card">
              <input type="radio" name="style" value="赛博朋克" />
              <img :src="asset('saibopengke.png')" alt="赛博朋克风格" />
              <span>赛博朋克</span>
            </label>
            <label class="style-card">
              <input type="radio" name="style" value="极简" />
              <img :src="asset('jijian.png')" alt="极简风格" />
              <span>极简</span>
            </label>
          </div>
        </div>

        <div class="field-block">
          <span class="field-label">输出尺寸</span>
          <div class="seg-grid" style="--cols:3">
            <label class="seg-option"><input type="radio" name="ratio" value="3840x2160" checked /><span>3840x2160</span></label>
            <label class="seg-option"><input type="radio" name="ratio" value="1536x1024" /><span>1536x1024</span></label>
            <label class="seg-option"><input type="radio" name="ratio" value="1024x1024" /><span>1024x1024</span></label>
          </div>
        </div>

        <div class="field-block">
          <span class="field-label">画质</span>
          <div class="seg-grid" style="--cols:3">
            <label class="seg-option"><input type="radio" name="quality" value="" /><span>标准</span></label>
            <label class="seg-option"><input type="radio" name="quality" value="high" checked /><span>高清</span></label>
            <label class="seg-option"><input type="radio" name="quality" value="hd" /><span>超清</span></label>
          </div>
        </div>

        <div class="field-block">
          <button type="button" class="ghost-btn" id="btnSaveSettings">保存设置</button>
        </div>

        <div class="field-block">
          <div class="cost" id="submitSummary">将按写实风格生成 · 3840x2160</div>
          <div class="cost">消耗 1 积分</div>
        </div>

      </aside>

      <section class="profile-panel panel-shell">
        <div class="profile-card">
          <div class="profile-head">
            <div class="profile-avatar" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="8" r="4"></circle>
                <path d="M4 21a8 8 0 0 1 16 0"></path>
              </svg>
            </div>
            <div class="profile-meta">
              <strong>本地用户</strong>
              <span id="profileKeyState">未保存密钥</span>
            </div>
          </div>
          <label class="field-label" for="profileApiKeyInput">接口密钥</label>
          <input type="password" id="profileApiKeyInput" autocomplete="off" placeholder="填写后保存在当前浏览器" />
          <div class="tool-group" style="margin-top:14px;">
            <button type="button" class="soft-btn" id="btnProfileSaveKey">保存密钥</button>
            <button type="button" class="soft-btn" id="btnProfileClearKey">清除</button>
          </div>
          <div class="msg" id="msg-profile"></div>
        </div>
      </section>
    </div>
  </div>

  <nav class="mobile-bottom-nav" aria-label="移动端主菜单">
    <button type="button" class="mobile-nav-btn" data-mobile-tab="records">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h5"></path></svg>
      <span>记录</span>
    </button>
    <button type="button" class="mobile-nav-btn active" data-mobile-tab="paint">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"></rect><path d="m8 13 2.5-3 3 4 2-2.5L21 18"></path></svg>
      <span>绘境</span>
    </button>
    <button type="button" class="mobile-nav-btn" data-mobile-tab="settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L7.1 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z"></path></svg>
      <span>设置</span>
    </button>
    <button type="button" class="mobile-nav-btn" data-mobile-tab="profile">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg>
      <span>我的</span>
    </button>
  </nav>

  <div class="busy" id="busy" aria-live="polite" aria-hidden="true">
    <div class="busy-card">
      <div class="spinner" aria-hidden="true"></div>
      <strong id="busyTitle">处理中</strong>
      <p id="busySub" style="margin:10px 0 0;color:var(--muted);line-height:1.6;"></p>
    </div>
  </div>

  <div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-hidden="true" aria-label="图片预览">
    <div class="lightbox-inner" id="lightbox-inner">
      <button type="button" class="lightbox-close" id="lightbox-close" aria-label="关闭预览">×</button>
      <img id="lightbox-img" src="" alt="大图预览" />
    </div>
  </div>

  <div class="key-dialog" id="keyDialog" role="dialog" aria-modal="true" aria-hidden="true" aria-label="配置密钥">
    <div class="key-card panel-shell">
      <div class="panel-title">
        <span>本地密钥</span>
        <button type="button" class="icon-btn" id="btnCloseKey" aria-label="关闭">×</button>
      </div>
      <label class="field-label" for="apiKeyInput">接口密钥</label>
      <input type="password" id="apiKeyInput" autocomplete="off" placeholder="填写后会保存在当前浏览器" />
      <div class="tool-group" style="margin-top:14px;">
        <button type="button" class="soft-btn" id="btnSaveKey">保存密钥</button>
        <button type="button" class="soft-btn" id="btnClearKey">清除</button>
      </div>
      <div class="msg" id="msg-key"></div>
    </div>
  </div>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>
</template>
