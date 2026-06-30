#!/bin/bash

clear

# .command 文件需要从 Finder 拖入应用路径后执行。
if [ $# -eq 0 ]; then
    echo "请将「爱可日记.app」拖到这个文件上。"
    read -n 1 -s -r -p "按任意键退出..."
    exit 1
fi

APP="$1"

if [ ! -d "$APP" ] || [[ "$APP" != *.app ]]; then
    echo "目标不是有效的 .app 应用："
    echo "$APP"
    read -n 1 -s -r -p "按任意键退出..."
    exit 1
fi

echo "正在修复："
echo "$APP"

# 清理 quarantine 等扩展属性，解决未签名应用被 macOS 拦截的问题。
if ! xattr -cr "$APP"; then
    echo ""
    echo "修复失败，请确认应用路径存在，并且当前用户有权限修改它。"
    read -n 1 -s -r -p "按任意键退出..."
    exit 1
fi

echo ""
echo "修复完成！"

open "$APP"

echo ""
read -n 1 -s -r -p "按任意键关闭窗口..."
