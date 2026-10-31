/* FormulaSnip hidden renderer: turns TeX into a standalone SVG string. */
(function () {
  'use strict';

  function describeError(e) {
    if (!e) return '未知错误';
    var msg = e.message || e.toString();
    if (msg === 'MathJax retry' || /retry/i.test(msg)) {
      return '公式渲染失败（字体数据加载中，请重试）';
    }
    return msg;
  }

  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type !== 'render') return;

    var started = performance.now();
    var id = data.id;
    var tex = typeof data.tex === 'string' ? data.tex : '';

    function reply(payload) {
      payload.id = id;
      payload.type = 'rendered';
      parent.postMessage(payload, '*');
    }

    if (!tex.trim()) {
      reply({ ok: false, error: '公式为空', ms: 0 });
      return;
    }

    MathJax.tex2svgPromise(tex, { display: !!data.display }).then(function (node) {
      try {
        var svg = node.querySelector('svg');
        if (!svg) throw new Error('MathJax 未返回 SVG');
        var merror = node.querySelector('merror');
        if (merror) {
          var m = (merror.textContent || '').trim();
          throw new Error(m || '公式有语法错误');
        }
        reply({
          ok: true,
          svg: svg.outerHTML,
          viewBox: svg.getAttribute('viewBox') || '',
          ms: performance.now() - started
        });
      } catch (err) {
        reply({ ok: false, error: describeError(err), ms: performance.now() - started });
      }
    }).catch(function (err) {
      reply({ ok: false, error: describeError(err), ms: performance.now() - started });
    });
  });
})();
