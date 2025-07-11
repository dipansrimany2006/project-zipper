import { Command } from 'commander';
import { ProjectZipper } from './zipper';
import { ZipOptions } from './types';

const program = new Command();

program
  .name('project-zipper')
  .description('Create a zip of your project respecting .gitignore patterns')
  .version('1.0.0')
  .option('-o, --output <path>', 'output directory', './dist')
  .option('-n, --name <name>', 'zip file name', 'project.zip')
  .option('--include-hidden', 'include hidden files', false)
  .option('-c, --compression <level>', 'compression level (0-9)', '6')
  .action(async (options) => {
    const zipOptions: ZipOptions = {
      outputPath: options.output,
      outputName: options.name,
      includeHidden: options.includeHidden,
      compressionLevel: parseInt(options.compression)
    };

    const zipper = new ProjectZipper(process.cwd(), zipOptions);
    await zipper.createZip();
  });

program.parse();