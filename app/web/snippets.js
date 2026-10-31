/*
 * FormulaSnip — LaTeX-suite style snippet pack + expansion engine.
 * Runs as a classic script (no modules) so it works from file:// in WKWebView.
 */
(function () {
  'use strict';

  const GREEK_LONG = [
    'varepsilon', 'vartheta', 'varphi', 'varsigma', 'varrho', 'varpi',
    'Upsilon', 'epsilon', 'omicron', 'Lambda', 'lambda', 'Omega', 'Gamma',
    'Delta', 'Theta', 'alpha', 'gamma', 'delta', 'theta', 'kappa', 'sigma',
    'Sigma', 'omega', 'zeta', 'beta', 'eta', 'iota', 'mu', 'nu', 'xi', 'Xi',
    'pi', 'Pi', 'rho', 'tau', 'phi', 'Phi', 'chi', 'psi', 'Psi'
  ];

  const SNIPPETS = [];

  function add(trigger, rep, cat, desc, opts) {
    SNIPPETS.push(Object.assign({ trigger, rep, cat, desc, priority: 0, regex: false }, opts || {}));
  }
  function addRe(trigger, rep, cat, desc, opts) {
    SNIPPETS.push(Object.assign({ trigger, rep, cat, desc, priority: 0, regex: true }, opts || {}));
  }

  /* ---------------------------------------------------------------- 环境 */
  add('beg', '\\begin{$0}\n\n\\end{$0}', '环境', 'begin/end 环境', { priority: -2 });
  addRe('([pbBvV]mat)', '\\begin{[[0]]rix}\n$0\n\\end{[[0]]rix}', '环境', '矩阵（pmat → pmatrix）', { priority: 20 });
  addRe('(matrix|cases|array)', '\\begin{[[0]]}\n$0\n\\end{[[0]]}', '环境', 'matrix / cases / array', { priority: 12 });
  addRe('align', '\\begin{aligned}\n$0\n\\end{aligned}', '环境', '多行对齐 aligned', { priority: 8 });
  add('text', '\\text{$0}$1', '环境', '公式里的文字', { priority: 1 });

  /* ------------------------------------------------------------ 希腊字母 */
  add('@a', '\\alpha', '希腊字母', 'α');
  add('@b', '\\beta', '希腊字母', 'β');
  add('@g', '\\gamma', '希腊字母', 'γ');
  add('@G', '\\Gamma', '希腊字母', 'Γ');
  add('@d', '\\delta', '希腊字母', 'δ');
  add('@D', '\\Delta', '希腊字母', 'Δ');
  add('@e', '\\epsilon', '希腊字母', 'ε');
  add(':e', '\\varepsilon', '希腊字母', 'ε');
  add('@z', '\\zeta', '希腊字母', 'ζ');
  add('@t', '\\theta', '希腊字母', 'θ');
  add('@T', '\\Theta', '希腊字母', 'Θ');
  add(':t', '\\vartheta', '希腊字母', 'ϑ');
  add('@i', '\\iota', '希腊字母', 'ι');
  add('@k', '\\kappa', '希腊字母', 'κ');
  add('@l', '\\lambda', '希腊字母', 'λ');
  add('@L', '\\Lambda', '希腊字母', 'Λ');
  add('@m', '\\mu', '希腊字母', 'μ');
  add('@n', '\\nu', '希腊字母', 'ν');
  add('@x', '\\xi', '希腊字母', 'ξ');
  add('@X', '\\Xi', '希腊字母', 'Ξ');
  add('@p', '\\pi', '希腊字母', 'π');
  add('@P', '\\Pi', '希腊字母', 'Π');
  add('@r', '\\rho', '希腊字母', 'ρ');
  add('@s', '\\sigma', '希腊字母', 'σ');
  add('@S', '\\Sigma', '希腊字母', 'Σ');
  add('@u', '\\upsilon', '希腊字母', 'υ');
  add('@U', '\\Upsilon', '希腊字母', 'Υ');
  add('@o', '\\omega', '希腊字母', 'ω');
  add('@O', '\\Omega', '希腊字母', 'Ω');
  add('ome', '\\omega', '希腊字母', 'ω');
  add('Ome', '\\Omega', '希腊字母', 'Ω');
  addRe('([^\\\\])(' + GREEK_LONG.join('|') + ')', '[[0]]\\[[1]]', '希腊字母', '希腊字母名自动加反斜杠', { priority: 5 });

  /* ------------------------------------------------------------ 常用运算 */
  add('sr', '^{2}', '常用运算', '平方');
  add('cb', '^{3}', '常用运算', '立方');
  add('rd', '^{$0}$1', '常用运算', '上标');
  add('_', '_{$0}$1', '常用运算', '下标');
  add('sts', '_\\text{$0}', '常用运算', '文字下标');
  add('sq', '\\sqrt{ $0 }$1', '常用运算', '根号');
  add('//', '\\frac{$0}{$1}$2', '常用运算', '分式');
  add('invs', '^{-1}', '常用运算', '逆');
  add('conj', '^{*}', '常用运算', '共轭');
  add('Re', '\\mathrm{Re}', '常用运算', '实部');
  add('Im', '\\mathrm{Im}', '常用运算', '虚部');
  add('bf', '\\mathbf{$0}', '常用运算', '粗体');
  add('rm', '\\mathrm{$0}$1', '常用运算', '直立体');
  add('cal', '\\mathcal{$0}$1', '常用运算', '花体');
  add('bb', '\\mathbb{$0}$1', '常用运算', '黑板体');
  add('fr', '\\mathfrak{$0}$1', '常用运算', '哥特体');
  add('hat', '\\hat{$0}$1', '常用运算', '帽子');
  add('bar', '\\bar{$0}$1', '常用运算', '上横线');
  add('dot', '\\dot{$0}$1', '常用运算', '点');
  add('ddot', '\\ddot{$0}$1', '常用运算', '双点');
  add('tilde', '\\tilde{$0}$1', '常用运算', '波浪线');
  add('und', '\\underline{$0}$1', '常用运算', '下划线');
  add('vec', '\\vec{$0}$1', '常用运算', '向量');
  add('cdot', '\\cdot', '常用运算', '点乘');
  add('pmod', '\\pmod{${0:n}}$1', '常用运算', '模');
  add('xnn', 'x_{n}', '常用运算', 'x_n');
  add('xii', 'x_{i}', '常用运算', 'x_i');
  add('xjj', 'x_{j}', '常用运算', 'x_j');
  add('xp1', 'x_{n+1}', '常用运算', 'x_{n+1}');
  add('ynn', 'y_{n}', '常用运算', 'y_n');
  add('yii', 'y_{i}', '常用运算', 'y_i');
  add('yjj', 'y_{j}', '常用运算', 'y_j');
  addRe('([A-Za-z])(hat|bar|dot|ddot|tilde|und|vec)', '\\[[1]]{[[0]]}$0', '常用运算', '字母直接加帽/线', { priority: 30 });
  addRe('([A-Za-z])([0-9])', '[[0]]_{[[1]]}$0', '常用运算', '变量后的数字变下标', { priority: -5 });

  /* ---------------------------------------------------------------- 微积分 */
  add('sum', '\\sum', '微积分', '求和');
  add('prod', '\\prod', '微积分', '连乘');
  add('\\sum', '\\sum_{${0:i}=${1:1}}^{${2:N}} $3', '微积分', '求和上下限', { priority: 2 });
  add('\\prod', '\\prod_{${0:i}=${1:1}}^{${2:N}} $3', '微积分', '连乘上下限', { priority: 2 });
  add('lim', '\\lim_{ ${0:n} \\to ${1:\\infty} } $2', '微积分', '极限');
  add('int', '\\int $0 \\, d${1:x} $2', '微积分', '不定积分');
  add('dint', '\\int_{${0:0}}^{${1:1}} $2 \\, d${3:x} $4', '微积分', '定积分');
  add('oint', '\\oint', '微积分', '环路积分');
  add('iint', '\\iint', '微积分', '二重积分');
  add('iiint', '\\iiint', '微积分', '三重积分');
  add('oinf', '\\int_{0}^{\\infty} $0 \\, d${1:x} $2', '微积分', '0 到无穷积分');
  add('infi', '\\int_{-\\infty}^{\\infty} $0 \\, d${1:x} $2', '微积分', '全区间积分');
  add('par', '\\frac{ \\partial ${0:y} }{ \\partial ${1:x} } $2', '微积分', '偏导');
  add('parn', '\\frac{ \\partial^{${0:n}} ${1:y} }{ \\partial ${2:x}^{${0:n}} } $2', '微积分', 'n 阶偏导');
  add('ddt', '\\frac{d}{dt} ', '微积分', '对时间求导');
  addRe('([^\\\\])int', '[[0]]\\int', '微积分', 'int 前自动补反斜杠', { priority: -1 });
  add('tayl', '${0:f}(${1:x} + ${2:h}) = ${0:f}(${1:x}) + ${0:f}\'(${1:x})${2:h} + ${0:f}\'\'(${1:x}) \\frac{${2:h}^{2}}{2!} + \\dots$3', '微积分', '泰勒展开');

  /* ------------------------------------------------------------ 符号关系 */
  add('ooo', '\\infty', '符号关系', '∞');
  add('+-', '\\pm', '符号关系', '±');
  add('-+', '\\mp', '符号关系', '∓');
  add('...', '\\dots', '符号关系', '…');
  add('nabl', '\\nabla', '符号关系', '∇');
  add('xx', '\\times', '符号关系', '×');
  add('**', '\\cdot', '符号关系', '·');
  add('para', '\\parallel', '符号关系', '∥');
  add('deg', '^{\\circ}', '符号关系', '度');
  add('===', '\\equiv', '符号关系', '≡');
  add('!=', '\\neq', '符号关系', '≠');
  add('>=', '\\geq', '符号关系', '≥');
  add('<=', '\\leq', '符号关系', '≤');
  add('>>', '\\gg', '符号关系', '≫');
  add('<<', '\\ll', '符号关系', '≪');
  add('simm', '\\sim', '符号关系', '∼');
  add('sim=', '\\simeq', '符号关系', '≃');
  add('prop', '\\propto', '符号关系', '∝');
  add('<->', '\\leftrightarrow ', '符号关系', '↔');
  add('->', '\\to', '符号关系', '→');
  add('!>', '\\mapsto', '符号关系', '↦');
  add('=>', '\\implies', '符号关系', '⟹');
  add('=<', '\\impliedby', '符号关系', '⟸');
  add('and', '\\cap', '符号关系', '∩');
  add('orr', '\\cup', '符号关系', '∪');
  add('inn', '\\in', '符号关系', '∈');
  add('notin', '\\not\\in', '符号关系', '∉');
  add('\\\\\\', '\\setminus', '符号关系', '∖');
  add('sub=', '\\subseteq', '符号关系', '⊆');
  add('sup=', '\\supseteq', '符号关系', '⊇');
  add('eset', '\\emptyset', '符号关系', '∅');
  add('set', '\\{ $0 \\}$1', '符号关系', '集合花括号');
  add('LL', '\\mathcal{L}', '符号关系', '𝓛');
  add('HH', '\\mathcal{H}', '符号关系', '𝓗');
  add('CC', '\\mathbb{C}', '符号关系', 'ℂ');
  add('RR', '\\mathbb{R}', '符号关系', 'ℝ');
  add('ZZ', '\\mathbb{Z}', '符号关系', 'ℤ');
  add('NN', '\\mathbb{N}', '符号关系', 'ℕ');
  add('QQ', '\\mathbb{Q}', '符号关系', 'ℚ');

  /* ------------------------------------------------------------ 三角函数 */
  add('sin', '\\sin ', '三角函数', 'sin');
  add('cos', '\\cos ', '三角函数', 'cos');
  add('tan', '\\tan ', '三角函数', 'tan');
  add('cot', '\\cot ', '三角函数', 'cot');
  add('sec', '\\sec ', '三角函数', 'sec');
  add('csc', '\\csc ', '三角函数', 'csc');
  add('arcsin', '\\arcsin ', '三角函数', 'arcsin');
  add('arccos', '\\arccos ', '三角函数', 'arccos');
  add('arctan', '\\arctan ', '三角函数', 'arctan');
  add('sinh', '\\sinh ', '三角函数', 'sinh');
  add('cosh', '\\cosh ', '三角函数', 'cosh');
  add('tanh', '\\tanh ', '三角函数', 'tanh');
  add('ln', '\\ln ', '三角函数', 'ln');
  add('log', '\\log ', '三角函数', 'log');
  add('exp', '\\exp ', '三角函数', 'exp');
  addRe('([^\\\\])(arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|csc|sec|cot|exp|log|ln|det)', '[[0]]\\[[1]]', '三角函数', '函数名自动补反斜杠', { priority: 10 });

  /* ---------------------------------------------------------------- 括号 */
  add('lr(', '\\left( $0 \\right) $1', '括号', '自动大小圆括号');
  add('lr{', '\\left\\{ $0 \\right\\} $1', '括号', '自动大小花括号');
  add('lr[', '\\left[ $0 \\right] $1', '括号', '自动大小方括号');
  add('lr|', '\\left| $0 \\right| $1', '括号', '自动大小竖线');
  add('lra', '\\left< $0 \\right> $1', '括号', '自动大小尖括号');
  add('avg', '\\langle $0 \\rangle $1', '括号', '平均/内积');
  add('norm', '\\lvert $0 \\rvert $1', '括号', '范数');
  add('Norm', '\\lVert $0 \\rVert $1', '括号', '范数');
  add('ceil', '\\lceil $0 \\rceil $1', '括号', '向上取整');
  add('floor', '\\lfloor $0 \\rfloor $1', '括号', '向下取整');
  add('mod', '|$0|$1', '括号', '绝对值');

  /* ------------------------------------------------------------ 物理量子 */
  add('kbt', 'k_{B}T', '物理', 'k_B T');
  add('msun', 'M_{\\odot}', '物理', '太阳质量');
  add('dag', '^{\\dagger}', '物理', '†');
  add('o+', '\\oplus ', '物理', '⊕');
  add('ox', '\\otimes ', '物理', '⊗');
  add('bra', '\\bra{$0}$1', '物理', '左矢');
  add('ket', '\\ket{$0}$1', '物理', '右矢');
  add('brk', '\\braket{$0}{$1}$2', '物理', 'bra-ket');
  add('outer', '\\ket{${0:\\psi}} \\bra{${0:\\psi}} $1', '物理', '外积');
  add('he4', '{}^{4}_{2}He ', '物理', '⁴He');
  add('he3', '{}^{3}_{2}He ', '物理', '³He');
  add('iso', '{}^{${0:4}}_{${1:2}}${2:He}', '物理', '同位素');

  const CATEGORIES = ['环境', '希腊字母', '常用运算', '微积分', '符号关系', '三角函数', '括号', '物理'];

  /* ------------------------------------------------------------- 引擎 */

  function insideText(text, caret) {
    // Ignore snippet triggers inside an unbalanced \text{...} group.
    const before = text.slice(0, caret);
    const idx = before.lastIndexOf('\\text{');
    if (idx < 0) return false;
    let depth = 1;
    for (let i = idx + 6; i < before.length; i++) {
      const c = before[i];
      if (c === '\\') { i++; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      if (depth === 0) return false;
    }
    return true;
  }

  function literalAllowed(before, snippet) {
    const t = snippet.trigger;
    const idx = before.length - t.length;
    const prev = idx > 0 ? before[idx - 1] : '';
    if (prev === '\\') return false;
    if (/^[A-Za-z]+$/.test(t)) {
      if (prev && /[A-Za-z0-9]/.test(prev)) return false;
    }
    return true;
  }

  function matchSnippet(before) {
    let best = null;
    for (const s of SNIPPETS) {
      let matched = null;
      let captures = [];
      if (s.regex) {
        const re = new RegExp(s.trigger + '$');
        const m = re.exec(before);
        if (m) {
          matched = m[0];
          captures = m.slice(1);
        }
      } else {
        if (before.endsWith(s.trigger) && literalAllowed(before, s)) {
          matched = s.trigger;
        }
      }
      if (!matched) continue;
      const score = (s.priority || 0) * 1000 + matched.length;
      if (!best || score > best.score) best = { snippet: s, matched, captures, score };
    }
    return best;
  }

  function buildExpansion(rep, captures) {
    const src = rep.replace(/\[\[(\d+)\]\]/g, function (_, i) {
      return captures[Number(i)] != null ? captures[Number(i)] : '';
    });
    const out = [];
    const stops = [];
    let pos = 0;
    let last = 0;
    let m;
    const re = /\$\{(\d+):([^}]*)\}|\$(\d+)/g;
    while ((m = re.exec(src))) {
      const literal = src.slice(last, m.index);
      if (literal) { out.push(literal); pos += literal.length; }
      const idx = m[1] !== undefined ? Number(m[1]) : Number(m[3]);
      const def = m[2] !== undefined ? m[2] : '';
      stops.push({ idx, start: pos, end: pos + def.length });
      if (def) { out.push(def); pos += def.length; }
      last = re.lastIndex;
    }
    if (last < src.length) out.push(src.slice(last));
    return { text: out.join(''), stops };
  }

  function expandAt(text, caret) {
    if (insideText(text, caret)) return null;
    const before = text.slice(0, caret);
    const match = matchSnippet(before);
    if (!match) return null;
    const built = buildExpansion(match.snippet.rep, match.captures);
    const start = caret - match.matched.length;
    const stops = built.stops.map(function (s) {
      return { idx: s.idx, start: start + s.start, end: start + s.end };
    });
    const newText = text.slice(0, start) + built.text + text.slice(caret);
    return {
      text: newText,
      caret: caret - match.matched.length + built.text.length,
      stops: stops,
      snippet: match.snippet,
      matched: match.matched
    };
  }

  window.FormulaSnip = {
    snippets: SNIPPETS,
    categories: CATEGORIES,
    expandAt: expandAt,
    matchSnippet: matchSnippet,
    buildExpansion: buildExpansion,
    insideText: insideText
  };
})();
