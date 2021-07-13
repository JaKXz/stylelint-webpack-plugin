import { join } from 'path';

import webpack from 'webpack';

import StylelintWebpackPlugin from '../src';

describe('empty', () => {
  it('no error when no files matching', (done) => {
    const compiler = webpack({
      context: join(__dirname, 'fixtures', 'empty'),
      mode: 'development',
      entry: './index',
      plugins: [new StylelintWebpackPlugin()],
    });

    compiler.run((err, stats) => {
      expect(stats.hasWarnings()).toBe(false);
      expect(stats.hasErrors()).toBe(false);
      done();
    });
  });
});
