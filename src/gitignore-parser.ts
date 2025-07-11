import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';

export class GitignoreParser {
  private ig: ReturnType<typeof ignore>;

  constructor(projectRoot: string) {
    this.ig = ignore();
    this.loadGitignore(projectRoot);
  }

  private loadGitignore(projectRoot: string): void {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      this.ig.add(gitignoreContent);
    }
  }

  public shouldIgnore(filePath: string): boolean {
    return this.ig.ignores(filePath);
  }
}