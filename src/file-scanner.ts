import * as fs from 'fs';
import * as path from 'path';
import { GitignoreParser } from './gitignore-parser';

export class FileScanner {
  constructor(
    private projectRoot: string,
    private gitignoreParser: GitignoreParser
  ) {}

  public async scanFiles(): Promise<string[]> {
    const files: string[] = [];
    await this.scanDirectory(this.projectRoot, files);
    return files;
  }

  private async scanDirectory(dir: string, files: string[]): Promise<void> {
    const items = await fs.promises.readdir(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relativePath = path.relative(this.projectRoot, fullPath);
      
      if (this.gitignoreParser.shouldIgnore(relativePath)) {
        continue;
      }

      const stats = await fs.promises.stat(fullPath);
      if (stats.isDirectory()) {
        await this.scanDirectory(fullPath, files);
      } else {
        files.push(fullPath);
      }
    }
  }
}