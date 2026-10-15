// 描述必须与 src/tools/registry.js 的 TOOL_DEFINITIONS、background.js、injected.js 保持一致
registerTool('read_file', null, '读取本地文件的内容');
registerTool('write_file', null, '写入内容到本地文件（不存在则创建，存在则覆盖）');
registerTool('list_dir', null, '列出指定目录下的所有文件和子目录');
registerTool('exec_command', null, '在 Windows 系统上执行一条 cmd 命令并返回输出结果');
registerTool('append_file', null, '追加内容到本地文件末尾');
registerTool('search_files', null, '在指定目录中搜索文件名匹配模式的文件');
registerTool('get_file_info', null, '获取文件的详细信息（大小、修改时间等）');
