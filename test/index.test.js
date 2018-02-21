'use strict';

const assign = require('object-assign');
const path = require('path');
const td = require('testdouble');

const StyleLintPlugin = require('../');

const pack = require('./helpers/pack');
const webpack = require('./helpers/webpack');
const baseConfig = require('./helpers/base-config');
const configFilePath = getPath('./.stylelintrc');
const errorMessage = require('../lib/constants').errorMessage;

describe('stylelint-webpack-plugin', function () {
  beforeEach(function () {
    td.replace(console, 'warn', td.function());
  });

  afterEach(function () {
    // See https://github.com/JaKXz/stylelint-webpack-plugin/issues/61
    td.verify(console.warn(), { times: 0, ignoreExtraArgs: true });
    td.reset();
  });

  it('works with a simple file', function () {
    return pack(assign({}, baseConfig(), { context: path.resolve('./test/fixtures/lint-free') }))
      .then(function (stats) {
        expect(stats.compilation.errors).to.have.length(0);
        expect(stats.compilation.warnings).to.have.length(0);
      });
  });

  it('sends errors to the errors output only', function () {
    return pack(assign({}, baseConfig(), { context: path.resolve('./test/fixtures/single-error') }))
      .then(function (stats) {
        expect(stats.compilation.errors).to.have.length(1, 'should have one error');
        expect(stats.compilation.warnings).to.have.length(0, 'should have no warnings');
      });
  });

  it('works with multiple source files', function () {
    return pack(assign({}, baseConfig(), { context: path.resolve('./test/fixtures/multiple-sources') }))
      .then(function (stats) {
        expect(stats.compilation.errors).to.have.length(1);
        expect(stats.compilation.errors[0]).to.be.an.instanceof(Error);
        expect(stats.compilation.errors[0].message).to.contain('test/fixtures/multiple-sources/_second.scss');
        expect(stats.compilation.errors[0].message).to.contain('test/fixtures/multiple-sources/test.scss');
      });
  });

  it('sends warnings properly', function () {
    return pack(assign({}, baseConfig(), { context: path.resolve('./test/fixtures/rule-warning') }))
      .then(function (stats) {
        expect(stats.compilation.errors).to.have.length(0);
        expect(stats.compilation.warnings).to.have.length(1);
      });
  });

  it('pushes errors using the webpack formatter', function () {
    const formatter = { formatter: 'webpack' };
    return pack(assign({}, baseConfig(formatter), { context: path.resolve('./test/fixtures/single-error') }))
      .then(function (stats) {
        expect(stats.compilation.errors).to.have.length(1, 'should have one error');
        expect(stats.compilation.warnings).to.have.length(0, 'should have no warnings');

        const error = stats.compilation.errors[0];

        expect(error.message).to.contain('test/fixtures/single-error/test.scss');
        expect(error.message).to.contain('3:1 stylelint: Unexpected missing end-of-source newline (no-missing-end-of-source-newline)');
      });
  });

  it('pushes warnings using the webpack formatter', function () {
    const formatter = { formatter: 'webpack' };
    return pack(assign({}, baseConfig(formatter), { context: path.resolve('./test/fixtures/rule-warning') }))
      .then(function (stats) {
        expect(stats.compilation.errors).to.have.length(0);
        expect(stats.compilation.warnings).to.have.length(1);

        const warning = stats.compilation.warnings[0];

        expect(warning.message).to.contain('test/fixtures/rule-warning/test.scss');
        expect(warning.message).to.contain('2:10 stylelint: Expected "#FFF" to be "#fff" (color-hex-case)');
      });
  });

  it('fails on errors when asked to', function () {
    const config = {
      context: path.resolve('./test/fixtures/single-error'),
      plugins: [
        new StyleLintPlugin({
          configFile: configFilePath,
          failOnError: true
        })
      ]
    };

    return pack(assign({}, baseConfig(), config))
      .then(expect.fail)
      .catch(function (err) {
        expect(err.message).to.equal(errorMessage);
      });
  });

  it('fails when .stylelintrc is not a proper format', function () {
    const config = {
      context: path.resolve('./test/fixtures/single-error'),
      plugins: [
        new StyleLintPlugin({
          configFile: getPath('./.badstylelintrc')
        })
      ]
    };

    return pack(assign({}, baseConfig(), config))
      .then(expect.fail)
      .catch(function (err) {
        expect(err.message).to.contain('Failed to parse').and.contain('as JSON');
      });
  });

  context('without StyleLintPlugin configuration', function () {
    const config = {
      plugins: [
        new StyleLintPlugin()
      ]
    };

    it('works by using stylelint#cosmiconfig under the hood', function () {
      return pack(assign({}, baseConfig(), config, { context: path.resolve('./test/fixtures/lint-free') }))
        .then(function (stats) {
          expect(stats.compilation.errors).to.have.length(0);
          expect(stats.compilation.warnings).to.have.length(0);
        });
    });

    it('finds the right stylelintrc', function () {
      return pack(assign({}, baseConfig(), config, { context: path.resolve('./test/fixtures/rule-warning') }))
        .then(function (stats) {
          expect(stats.compilation.warnings).to.have.length(1);
        });
    });
  });

  context('interop with NoErrorsPlugin', function () {
    it('works when failOnError is false', function () {
      const config = {
        context: path.resolve('./test/fixtures/single-error'),
        plugins: [
          new StyleLintPlugin({
            configFile: configFilePath
          }),
          new webpack.NoErrorsPlugin()
        ]
      };

      return pack(assign({}, baseConfig(), config))
        .then(function (stats) {
          expect(stats.compilation.errors).to.have.length(1);
        });
    });

    context('when failOnError is true', function () {
      const config = {
        plugins: [
          new StyleLintPlugin({
            configFile: configFilePath,
            failOnError: true
          }),
          new webpack.NoErrorsPlugin()
        ]
      };

      it('throws when there is an error', function () {
        return pack(assign({}, baseConfig(), config, { context: path.resolve('./test/fixtures/single-error') }))
          .then(expect.fail)
          .catch(function (err) {
            expect(err).to.be.instanceof(Error);
          });
      });

      it('does not throw when there are only warnings', function () {
        return pack(assign({}, baseConfig(), config, { context: path.resolve('./test/fixtures/rule-warning') }))
          .then(function (stats) {
            expect(stats.compilation.warnings).to.have.length(1);
          });
      });
    });
  });

  context('when `emitErrors` is disabled', function () {
    const config = {
      plugins: [
        new StyleLintPlugin({
          configFile: configFilePath,
          emitErrors: false
        })
      ]
    };

    it('does not print warnings or errors when there are none', function () {
      return pack(assign({}, baseConfig(), config, { context: path.resolve('./test/fixtures/lint-free') }))
        .then(function (stats) {
          expect(stats.compilation.errors).to.have.length(0);
          expect(stats.compilation.warnings).to.have.length(0);
        });
    });

    it('emits errors as warnings when asked to', function () {
      return pack(assign({}, baseConfig(), config, { context: path.resolve('./test/fixtures/single-error') }))
        .then(function (stats) {
          expect(stats.compilation.errors).to.have.length(0);
          expect(stats.compilation.warnings).to.have.length(1);
          expect(stats.compilation.warnings[0]).to.be.an.instanceof(Error);
          expect(stats.compilation.warnings[0].message.length > 0).to.equal(true);
        });
    });

    it('still indicates that warnings are warnings, even when emitting errors as warnings too', function () {
      return pack(assign({}, baseConfig(), config, { context: path.resolve('./test/fixtures/rule-warning') }))
        .then(function (stats) {
          expect(stats.compilation.errors).to.have.length(0);
          expect(stats.compilation.warnings).to.have.length(1);
          expect(stats.compilation.warnings[0]).to.be.an.instanceof(Error);
          expect(stats.compilation.warnings[0].message.length > 0).to.equal(true);
        });
    });
  });

  context('lintDirtyModulesOnly flag is enabled', function () {
    it('skips linting on initial run', function () {
      const config = {
        context: path.resolve('./test/fixtures/single-error'),
        plugins: [
          new StyleLintPlugin({
            configFile: configFilePath,
            lintDirtyModulesOnly: true
          })
        ]
      };

      return pack(assign({}, baseConfig(), config))
        .then(function (stats) {
          expect(stats.compilation.errors).to.have.length(0);
          expect(stats.compilation.warnings).to.have.length(0);
        });
    });

    it('still skips on initial run with `emitErrors` disabled', function () {
      const config = {
        context: path.resolve('./test/fixtures/single-error'),
        plugins: [
          new StyleLintPlugin({
            configFile: configFilePath,
            lintDirtyModulesOnly: true,
            emitErrors: false
          })
        ]
      };

      return pack(assign({}, baseConfig(), config))
        .then(function (stats) {
          expect(stats.compilation.errors).to.have.length(0);
          expect(stats.compilation.warnings).to.have.length(0);
        });
    });
  });
});
