var __plugins = [];

function registerPlugin(name, entry) {
  // 入参验证：名称必填且唯一，入口必须是函数或含 init/cleanup 的对象
  if (!name || typeof name !== 'string') {
    console.warn('[DS Agent] 插件注册失败：缺少有效的插件名称');
    return false;
  }
  if (typeof entry !== 'function' && !(entry && typeof entry.init === 'function')) {
    console.warn('[DS Agent] 插件注册失败：' + name + ' 的入口必须是函数或含 init 的对象');
    return false;
  }
  for (var i = 0; i < __plugins.length; i++) {
    if (__plugins[i].name === name) {
      console.warn('[DS Agent] 插件 "' + name + '" 已注册，跳过重复注册');
      return false;
    }
  }
  __plugins.push({ name: name, entry: entry, loaded: false, error: null });
  return true;
}

function loadPlugins() {
  for (var i = 0; i < __plugins.length; i++) {
    var p = __plugins[i];
    try {
      if (typeof p.entry === 'function') p.entry();
      else if (typeof p.entry.init === 'function') p.entry.init();
      p.loaded = true;
      p.error = null;
    } catch(e) {
      // 失败插件标记状态，避免被误认为加载成功
      p.loaded = false;
      p.error = e;
      console.warn('[DS Agent] 插件加载失败:', p.name, e.message);
    }
  }
}

// 卸载所有插件：优先调用插件暴露的 cleanup 钩子回滚副作用，随后清空注册表
function unloadPlugins() {
  for (var i = __plugins.length - 1; i >= 0; i--) {
    var p = __plugins[i];
    if (!p) continue;
    try {
      var cleanup = typeof p.entry === 'function' ? p.entry.cleanup : (p.entry && p.entry.cleanup);
      if (typeof cleanup === 'function') cleanup();
    } catch(e) {
      console.warn('[DS Agent] 插件卸载失败:', p.name, e.message);
    }
  }
  __plugins.length = 0;
}
