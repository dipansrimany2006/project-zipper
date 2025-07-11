import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { GitignoreParser } from './gitignore-parser';
import { FileScanner } from './file-scanner';
import { ZipOptions } from './types';

export class ProjectZipper {
  private projectRoot: string;
  private options: Required<ZipOptions>;
  private gitignoreParser: GitignoreParser;
  private fileScanner: FileScanner;

  constructor(projectRoot: string, options: ZipOptions = {}) {
    this.projectRoot = path.resolve(projectRoot);
    this.options = this.mergeDefaultOptions(options);
    this.gitignoreParser = new GitignoreParser(this.projectRoot);
    this.fileScanner = new FileScanner(this.projectRoot, this.gitignoreParser);
  }

  private mergeDefaultOptions(options: ZipOptions): Required<ZipOptions> {
    return {
      outputPath: options.outputPath || './dist',
      outputName: options.outputName || 'project.zip',
      includeHidden: options.includeHidden || false,
      compressionLevel: options.compressionLevel || 6
    };
  }

  public async createZip(): Promise<string> {
    try {
      console.log('🔍 Scanning project files...');
      const files = await this.fileScanner.scanFiles();
      
      console.log(`📦 Found ${files.length} files to zip`);
      
      // Ensure output directory exists
      await this.ensureOutputDirectory();
      
      const outputFilePath = path.join(this.options.outputPath, this.options.outputName);
      
      console.log(`📁 Creating zip: ${outputFilePath}`);
      
      await this.createArchive(files, outputFilePath);
      
      console.log('✅ Project zip created successfully!');
      return outputFilePath;
    } catch (error) {
      console.error('❌ Error creating zip:', error);
      throw error;
    }
  }

  private async ensureOutputDirectory(): Promise<void> {
    const outputDir = path.resolve(this.options.outputPath);
    
    try {
      await fs.promises.access(outputDir);
    } catch {
      await fs.promises.mkdir(outputDir, { recursive: true });
      console.log(`📁 Created output directory: ${outputDir}`);
    }
  }

  private async createArchive(files: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create a file to stream archive data to
      const output = fs.createWriteStream(outputPath);
      
      // Create archive with specified compression level
      const archive = archiver('zip', {
        zlib: { level: this.options.compressionLevel }
      });

      // Set up event listeners
      output.on('close', () => {
        const totalBytes = archive.pointer();
        console.log(`📊 Archive size: ${this.formatBytes(totalBytes)}`);
        resolve();
      });

      output.on('error', (err) => {
        reject(err);
      });

      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          console.warn('⚠️  Warning:', err.message);
        } else {
          reject(err);
        }
      });

      archive.on('error', (err) => {
        reject(err);
      });

      // Progress tracking
      let processedFiles = 0;
      const totalFiles = files.length;

      archive.on('entry', () => {
        processedFiles++;
        if (processedFiles % 50 === 0 || processedFiles === totalFiles) {
          const percentage = Math.round((processedFiles / totalFiles) * 100);
          console.log(`📈 Progress: ${processedFiles}/${totalFiles} files (${percentage}%)`);
        }
      });

      // Pipe archive data to the file
      archive.pipe(output);

      // Add files to archive
      this.addFilesToArchive(archive, files);

      // Finalize the archive
      archive.finalize();
    });
  }

  private addFilesToArchive(archive: archiver.Archiver, files: string[]): void {
    for (const filePath of files) {
      try {
        const relativePath = path.relative(this.projectRoot, filePath);
        
        // Skip hidden files if not explicitly included
        if (!this.options.includeHidden && this.isHiddenFile(relativePath)) {
          continue;
        }

        // Check if file still exists (it might have been deleted during scanning)
        if (!fs.existsSync(filePath)) {
          console.warn(`⚠️  File no longer exists: ${relativePath}`);
          continue;
        }

        const stats = fs.statSync(filePath);
        
        // Skip if it's a directory (shouldn't happen with our scanner, but safety check)
        if (stats.isDirectory()) {
          continue;
        }

        // Add file to archive with its relative path
        archive.file(filePath, { 
          name: relativePath,
          mode: stats.mode,
          date: stats.mtime
        });

      } catch (error) {
        console.warn(`⚠️  Error processing file ${filePath}:`, error);
      }
    }
  }

  private isHiddenFile(filePath: string): boolean {
    const parts = filePath.split(path.sep);
    return parts.some(part => part.startsWith('.') && part !== '.' && part !== '..');
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Public method to get file list without creating zip (useful for preview)
  public async getFileList(): Promise<string[]> {
    const files = await this.fileScanner.scanFiles();
    return files.map(file => path.relative(this.projectRoot, file));
  }

  // Public method to validate project structure
  public async validateProject(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check if project root exists
    if (!fs.existsSync(this.projectRoot)) {
      issues.push('Project root directory does not exist');
      return { valid: false, issues };
    }

    // Check if project root is a directory
    const stats = await fs.promises.stat(this.projectRoot);
    if (!stats.isDirectory()) {
      issues.push('Project root is not a directory');
      return { valid: false, issues };
    }

    // Check if output directory is writable
    try {
      await this.ensureOutputDirectory();
      const testFile = path.join(this.options.outputPath, '.write-test');
      await fs.promises.writeFile(testFile, 'test');
      await fs.promises.unlink(testFile);
    } catch (error) {
      issues.push(`Output directory is not writable: ${error}`);
    }

    // Check if there are any files to zip
    try {
      const files = await this.fileScanner.scanFiles();
      if (files.length === 0) {
        issues.push('No files found to zip (all files may be ignored by .gitignore)');
      }
    } catch (error) {
      issues.push(`Error scanning files: ${error}`);
    }

    return { valid: issues.length === 0, issues };
  }

  // Public method to get statistics about the project
  public async getProjectStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    fileTypes: Record<string, number>;
    ignoredPatterns: string[];
  }> {
    const files = await this.fileScanner.scanFiles();
    const fileTypes: Record<string, number> = {};
    let totalSize = 0;

    for (const file of files) {
      try {
        const stats = await fs.promises.stat(file);
        totalSize += stats.size;

        const ext = path.extname(file).toLowerCase() || 'no-extension';
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
      } catch (error) {
        console.warn(`Warning: Could not stat file ${file}`);
      }
    }

    return {
      totalFiles: files.length,
      totalSize,
      fileTypes,
      ignoredPatterns: [] // This could be enhanced to show actual ignored patterns
    };
  }
}