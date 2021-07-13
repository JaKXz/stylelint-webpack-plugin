import { isAbsolute, join } from 'path';

// @ts-ignore
import globby from 'globby';

import arrify from 'arrify';
import { isMatch } from 'micromatch';

import { getOptions } from './options';
import linter from './linter';
import { parseFiles, parseFoldersToGlobs } from './utils';

/** @typedef {import('webpack').Compiler} Compiler */
/** @typedef {import('webpack').Module} Module */
/** @typedef {import('./options').Options} Options */
/** @typedef {Partial<{timestamp:number} | number>} FileSystemInfoEntry */

const STYLELINT_PLUGIN = 'StylelintWebpackPlugin';
let counter = 0;

class StylelintWebpackPlugin {
  /**
   * @param {Options} options
   */
  constructor(options = {}) {
    this.key = STYLELINT_PLUGIN;
    this.options = getOptions(options);
    this.run = this.run.bind(this);
    this.startTime = Date.now();
    this.prevTimestamps = new Map();
  }

  /**
   * @param {Compiler} compiler
   * @returns {void}
   */
  apply(compiler) {
    // Generate key for each compilation,
    // this differentiates one from the other when being cached.
    this.key = compiler.name || `${this.key}_${(counter += 1)}`;

    // If `lintDirtyModulesOnly` is disabled,
    // execute the linter on the build
    if (!this.options.lintDirtyModulesOnly) {
      compiler.hooks.run.tapPromise(this.key, this.run);
    }

    let isFirstRun = this.options.lintDirtyModulesOnly;
    compiler.hooks.watchRun.tapPromise(this.key, (c) => {
      if (isFirstRun) {
        isFirstRun = false;

        return Promise.resolve();
      }

      return this.run(c);
    });
  }

  /**
   * @param {Compiler} compiler
   */
  async run(compiler) {
    // Do not re-hook
    /* istanbul ignore if */
    if (
      // @ts-ignore
      compiler.hooks.thisCompilation.taps.find(({ name }) => name === this.key)
    ) {
      return;
    }

    const context = this.getContext(compiler);
    const excludeDefault = [
      '**/node_modules/**',
      String(compiler.options.output.path),
    ];

    const options = {
      ...this.options,
      exclude: parseFiles(this.options.exclude || excludeDefault, context),
      extensions: arrify(this.options.extensions),
      files: parseFiles(this.options.files || '', context),
    };

    const wanted = parseFoldersToGlobs(options.files, options.extensions);
    const exclude = parseFoldersToGlobs(options.exclude);

    compiler.hooks.thisCompilation.tap(this.key, (compilation) => {
      /** @type {import('./linter').Linter} */
      let lint;
      /** @type {import('./linter').Reporter} */
      let report;
      /** @type number */
      let threads;

      try {
        ({ lint, report, threads } = linter(this.key, options, compilation));
      } catch (e) {
        compilation.errors.push(e);
        return;
      }

      compilation.hooks.finishModules.tap(this.key, () => {
        const files = compiler.modifiedFiles
          ? Array.from(compiler.modifiedFiles).filter(
              (file) =>
                isMatch(file, wanted, { dot: true }) &&
                !isMatch(file, exclude, { dot: true })
            )
          : globby.sync(wanted, { dot: true, ignore: exclude });

        if (threads > 1) {
          for (const file of files) {
            lint(parseFiles(file, context));
          }
        } else if (files.length > 0) {
          lint(parseFiles(files, context));
        }
      });

      // await and interpret results
      compilation.hooks.additionalAssets.tapPromise(this.key, processResults);

      async function processResults() {
        const { errors, warnings, generateReportAsset } = await report();

        if (warnings && !options.failOnWarning) {
          // @ts-ignore
          compilation.warnings.push(warnings);
        } else if (warnings && options.failOnWarning) {
          // @ts-ignore
          compilation.errors.push(warnings);
        }

        if (errors && options.failOnError) {
          // @ts-ignore
          compilation.errors.push(errors);
        } else if (errors && !options.failOnError) {
          // @ts-ignore
          compilation.warnings.push(errors);
        }

        if (generateReportAsset) {
          await generateReportAsset(compilation);
        }
      }
    });
  }

  /**
   *
   * @param {Compiler} compiler
   * @returns {string}
   */
  getContext(compiler) {
    if (!this.options.context) {
      return String(compiler.options.context);
    }

    if (!isAbsolute(this.options.context)) {
      return join(String(compiler.options.context), this.options.context);
    }

    return this.options.context;
  }
}

export default StylelintWebpackPlugin;
