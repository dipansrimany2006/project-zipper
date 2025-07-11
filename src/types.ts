export interface ZipOptions {
  outputPath?: string;
  outputName?: string;
  includeHidden?: boolean;
  compressionLevel?: number;
}

export interface GitignoreRule {
  pattern: string;
  negation: boolean;
  directory: boolean;
}