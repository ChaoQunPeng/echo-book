function EditorPage() {
  /*
   * 编辑页负责承载日记正文的新增和修改体验。
   * 这里先保持为独立路由页面，后续如果需要区分“新建”和“编辑已有日记”，
   * 可以继续扩展为 `/editor`、`/editor/:diaryId` 这类更细的路由结构。
   */
  return (
    <section className="editor-page">
      <h1>编辑页面</h1>
    </section>
  )
}

export default EditorPage
