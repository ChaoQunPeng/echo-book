import type Database from "better-sqlite3";
import type { TagLibraryItem } from "../../shared/tags.js";

interface TagRow {
  name: string;
  color: string;
  created_at: number;
}

/**
 * 标签库 repository 只操作 tags 表，不触碰任何日记数据。
 */
export class TagRepository {
  public constructor(private readonly db: Database.Database) {}

  public listTags(): TagLibraryItem[] {
    const rows = this.db
      .prepare(
        `
          SELECT name, color, created_at
          FROM tags
          ORDER BY name COLLATE NOCASE ASC
        `,
      )
      .all() as TagRow[];

    return rows.map(mapTagRow);
  }

  public createTag(name: string, color: string, createdAt = Date.now()): TagLibraryItem {
    this.db
      .prepare(
        `
          INSERT OR IGNORE INTO tags (name, color, created_at)
          VALUES (@name, @color, @createdAt)
        `,
      )
      .run({ name, color, createdAt });

    const tag = this.getTagByName(name);
    if (!tag) {
      throw new Error("Tag was created but could not be read back.");
    }

    return tag;
  }

  public updateTag(oldName: string, name: string, color: string): TagLibraryItem | null {
    const result = this.db
      .prepare(
        `
          UPDATE tags
          SET name = @name,
              color = @color
          WHERE name = @oldName
        `,
      )
      .run({ oldName, name, color });

    return result.changes > 0 ? this.getTagByName(name) : null;
  }

  public deleteTag(name: string): boolean {
    const result = this.db
      .prepare(
        `
          DELETE FROM tags
          WHERE name = @name
        `,
      )
      .run({ name });

    return result.changes > 0;
  }

  public ensureTagsExist(names: string[]): void {
    const insertTag = this.db.prepare(
      `
        INSERT OR IGNORE INTO tags (name, color, created_at)
        VALUES (@name, @color, @createdAt)
      `,
    );
    const createdAt = Date.now();
    const color = "#237804";
    const ensure = this.db.transaction(() => {
      for (const name of names) {
        insertTag.run({ name, color, createdAt });
      }
    });

    ensure();
  }

  private getTagByName(name: string): TagLibraryItem | null {
    const row = this.db
      .prepare(
        `
          SELECT name, color, created_at
          FROM tags
          WHERE name = @name
          LIMIT 1
        `,
      )
      .get({ name }) as TagRow | undefined;

    return row ? mapTagRow(row) : null;
  }
}

function mapTagRow(row: TagRow): TagLibraryItem {
  return {
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}
