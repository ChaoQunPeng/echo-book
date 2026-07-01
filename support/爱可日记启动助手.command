#!/bin/bash

clear

pause_and_exit() {
    echo ""
    read -n 1 -s -r -p "按任意键退出..."
    exit "$1"
}

normalize_app_path() {
    local raw_path="$1"

    # 从 Terminal 拖入文件时，路径里可能带反斜杠转义和首尾空格。
    raw_path="${raw_path#"${raw_path%%[![:space:]]*}"}"
    raw_path="${raw_path%"${raw_path##*[![:space:]]}"}"
    raw_path="${raw_path%\"}"
    raw_path="${raw_path#\"}"
    raw_path="${raw_path%\'}"
    raw_path="${raw_path#\'}"
    printf "%s" "$raw_path" | sed 's/\\\(.\)/\1/g'
}

# 支持两种方式：拖到脚本上，或者双击脚本后把应用拖到窗口里。
if [ $# -eq 0 ]; then
    echo "请把「应用程序」文件夹里的「爱可日记.app」拖到这个窗口里，然后按回车："
    read -r APP_INPUT
    APP="$(normalize_app_path "$APP_INPUT")"
else
    APP="$1"
fi

if [ "$APP" = "" ]; then
    echo "没有读取到应用路径。"
    pause_and_exit 1
fi

if [ ! -d "$APP" ] || [[ "$APP" != *.app ]]; then
    echo "目标不是有效的 .app 应用："
    echo "$APP"
    pause_and_exit 1
fi

# DMG 通常是只读挂载，直接修复里面的 app 不会真正生效。
if [[ "$APP" == /Volumes/* ]]; then
    echo "你拖入的是 DMG 安装包里的应用："
    echo "$APP"
    echo ""
    echo "请先把「爱可日记.app」拖到「应用程序」文件夹，再把应用程序里的「爱可日记.app」拖到这个修复文件上。"
    pause_and_exit 1
fi

echo "正在修复："
echo "$APP"

# 清理 quarantine 等扩展属性，解决未签名应用被 macOS 拦截的问题。
if ! xattr -cr "$APP"; then
    echo ""
    echo "修复失败，请确认应用路径存在，并且当前用户有权限修改它。"
    pause_and_exit 1
fi

# 再检查一次 quarantine 是否还残留，避免用户误以为已经修复成功。
if xattr -lr "$APP" 2>/dev/null | grep -q "com.apple.quarantine"; then
    echo ""
    echo "修复后仍检测到 macOS 隔离标记。"
    echo "请确认拖入的是「应用程序」文件夹里的爱可日记.app，不是 DMG 里的应用。"
    pause_and_exit 1
fi

echo ""
echo "修复完成！"

if ! open "$APP"; then
    echo ""
    echo "已清理隔离标记，但系统仍然没有成功打开应用。"
    echo "可以尝试右键点击「爱可日记.app」，选择「打开」。"
fi

echo ""
read -n 1 -s -r -p "按任意键关闭窗口..."
