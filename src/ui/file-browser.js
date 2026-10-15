// 导航竞态守卫：目录/文件快速连续点击时，丢弃过期响应，避免旧结果覆盖新结果
var _fileNavSeq = 0;
var _filePreviewSeq = 0;

async function loadFileBrowser(dirPath, _retryCount, _seq) {
  _retryCount = _retryCount || 0;
  // 同一逻辑导航延续同一序号；新导航自增，旧导航在 await 后检测到过期即丢弃
  var seq = _seq || ++_fileNavSeq;
  var treeEl = document.getElementById('__ds-file-tree');
  if (!treeEl) return;
  treeEl.innerHTML = '<div class="__ds-file-loading">加载中...</div>';
  var wsPath = dirPath || await getWorkspacePath();
  // 等待期间用户已导航到其他目录 → 丢弃本次结果
  if (seq !== _fileNavSeq) return;
  if (!wsPath) { treeEl.innerHTML = '<div class="__ds-file-error">未设置工作区路径<br>请点击 ⚙️ 设置</div>'; return; }
  updateWorkspaceDisplay(wsPath);
  try {
    var response = await apiRequest(getEndpoint('exec'), { method: 'POST', body: JSON.stringify({ tool: 'list_dir', args: { path: wsPath } }) });
    if (seq !== _fileNavSeq) return; // 过期响应，丢弃
    if (!response.ok) throw new Error('服务器响应错误');
    var data = await response.json();
    if (seq !== _fileNavSeq) return;
    if (!data.success) throw new Error(data.error ? (data.error.message || '读取目录失败') : '读取目录失败');
    renderFileTree(treeEl, data.files, wsPath);
  } catch(e) {
    if (seq !== _fileNavSeq) return; // 过期错误，丢弃
    var errMsg = e.message || '';
    if (errMsg.indexOf('Failed to fetch') >= 0 || errMsg.indexOf('NetworkError') >= 0) {
      treeEl.innerHTML = '<div class="__ds-file-loading">⏳ 正在尝试连接...</div>';
      logPanel('info', '服务器未运行，尝试通过 Native Host 连接...');
      try {
        var nativeResp = await chrome.runtime.sendMessage({ action: 'connectNativeHost' });
        if (seq !== _fileNavSeq) return;
        if (nativeResp && nativeResp.status && nativeResp.status.running) {
          logPanel('success', 'Native Host 已连接 ✅');
          updateServerStatusUI(true);
          // 防止 Native Host 已连接但服务器未就绪时无限递归
          if (_retryCount < 3) {
            await sleep(1500);
            // 保持同一序号重试，用户已导航则在新一轮开头直接放弃
            return loadFileBrowser(dirPath, _retryCount + 1, seq);
          } else {
            showStartupGuide();
            return;
          }
        }
      } catch(nativeErr) {
        if (seq !== _fileNavSeq) return;
        var neMsg = nativeErr.message || '';
        if (neMsg.indexOf('Extension context invalidated') >= 0 || neMsg.indexOf('disconnected') >= 0) {
          logPanel('warn', 'Service Worker 重启中，稍后重试...');
          if (_retryCount < 3) {
            await sleep(2000);
            return loadFileBrowser(dirPath, _retryCount + 1, seq);
          } else {
            showBrowserError('无法连接到服务器，请检查服务器是否运行');
            return;
          }
        }
        logPanel('warn', 'loadFileBrowser Native Host 异常: ' + neMsg);
      }
      showStartupGuide();
      return;
    }
    treeEl.innerHTML = '<div class="__ds-file-error">加载失败: ' + escapeHtml(errMsg) + '</div>';
  }
}

function renderFileTree(container, files, basePath) {
  if (!files || files.length === 0) { container.innerHTML = '<div class="__ds-file-loading">目录为空</div>'; return; }
  var html = '';
  if (basePath) {
    var parentPath = basePath.replace(/[\\/][^\\/]+$/, '') || basePath;
    if (parentPath !== basePath) html += '<div class="__ds-file-item __ds-file-dir" data-path="' + escapeAttr(parentPath) + '" data-is-dir="true"><span class="__ds-file-icon">📁</span><span class="__ds-file-name">..</span></div>';
  }
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var fullPath = basePath.replace(/\\/g, '/').replace(/\/$/, '') + '/' + f.name;
    html += '<div class="__ds-file-item' + (f.isDirectory ? ' __ds-file-dir' : '') + '" data-path="' + escapeAttr(fullPath) + '" data-is-dir="' + (f.isDirectory ? 'true' : 'false') + '">';
    html += '<span class="__ds-file-icon">' + (f.isDirectory ? '📁' : '📄') + '</span>';
    html += '<span class="__ds-file-name">' + escapeHtml(f.name) + '</span>';
    if (!f.isDirectory && f.size > 0) html += '<span class="__ds-file-size">' + formatFileSize(f.size) + '</span>';
    html += '</div>';
  }
  container.innerHTML = html;
  var items = container.querySelectorAll('.__ds-file-item');
  for (var j = 0; j < items.length; j++) {
    items[j].addEventListener('click', function(e) {
      var path = this.getAttribute('data-path');
      var isDir = this.getAttribute('data-is-dir') === 'true';
      var allItems = container.querySelectorAll('.__ds-file-item');
      for (var k = 0; k < allItems.length; k++) allItems[k].classList.remove('__ds-file-selected');
      this.classList.add('__ds-file-selected');
      if (isDir) { loadFileBrowser(path); closeFilePreview(); }
      else { previewFile(path); }
    });
  }
}

async function previewFile(filePath) {
  var seq = ++_filePreviewSeq;
  var previewEl = document.getElementById('__ds-file-preview');
  var nameEl = document.getElementById('__ds-preview-filename');
  var contentEl = document.getElementById('__ds-preview-content');
  if (!previewEl || !contentEl) return;
  previewEl.classList.remove('__ds-hidden');
  nameEl.textContent = filePath.split(/[\\/]/).pop();
  contentEl.textContent = '加载中...';
  try {
    var response = await apiRequest(getEndpoint('exec'), { method: 'POST', body: JSON.stringify({ tool: 'read_file', args: { path: filePath } }) });
    if (seq !== _filePreviewSeq) return; // 用户已切换到其他文件，丢弃过期响应
    if (!response.ok) throw new Error('读取失败');
    var data = await response.json();
    if (seq !== _filePreviewSeq) return;
    if (!data.success) throw new Error(data.error ? (data.error.message || '读取失败') : '读取失败');
    var content = data.content || '';
    if (content.length > 50000) content = content.substring(0, 50000) + '\n\n... (内容过长, 已截断)';
    contentEl.textContent = content;
  } catch(e) {
    if (seq !== _filePreviewSeq) return;
    contentEl.textContent = '读取失败: ' + e.message;
  }
}

function closeFilePreview() {
  var previewEl = document.getElementById('__ds-file-preview');
  if (previewEl) previewEl.classList.add('__ds-hidden');
}

function getWorkspacePath() {
  return new Promise(function(resolve) {
    chrome.storage.local.get(['workspacePath'], function(result) {
      if (result.workspacePath) resolve(result.workspacePath);
      else {
        apiRequest(getEndpoint('config'), { method: 'POST', body: JSON.stringify({ action: 'get' }) })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.success && data.workspace) { chrome.storage.local.set({ workspacePath: data.workspace }); resolve(data.workspace); }
            else resolve('');
          }).catch(function() { resolve(''); });
      }
    });
  });
}

function updateWorkspaceDisplay(wsPath) {
  var pathEl = document.getElementById('__ds-fe-current-path');
  if (pathEl) {
    pathEl.textContent = wsPath || '';
  }
}
