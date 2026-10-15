// Name normalisation shared by the browser and the server (keep both in sync).
(function (root) {
  function normAlias(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[.ـ]/g, ' ')
      .replace(/\b(dr|prof|professor|doctor)\b/g, ' ')
      .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }
  if (typeof module !== 'undefined') module.exports = { normAlias };
  else root.normAlias = normAlias;
})(this);
