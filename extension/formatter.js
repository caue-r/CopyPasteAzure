// Converte o HTML dos campos do Azure DevOps em texto limpo e monta o texto final.
(() => {
  const MENTION_START = "\u0001";
  const MENTION_END = "\u0002";

  const BLOCK_TAGS = new Set([
    "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DD", "DIV", "DL", "DT",
    "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5",
    "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "PRE", "SECTION", "TABLE",
    "TBODY", "TFOOT", "THEAD"
  ]);
  const PARAGRAPH_TAGS = new Set(["P", "UL", "OL", "TABLE", "PRE", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6"]);
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "IMG", "svg", "SVG", "HEAD", "TITLE"]);

  class TextBuilder {
    constructor() {
      this.out = "";
    }
    endsWithNewline() {
      return this.out === "" || this.out.endsWith("\n");
    }
    text(str) {
      if (!str) return;
      if (/^\s+$/.test(str) && (this.endsWithNewline() || this.out.endsWith(" ") || this.out.endsWith("\t"))) return;
      this.out += str;
    }
    // Garante que a próxima saída comece em uma nova linha.
    newline() {
      if (!this.endsWithNewline()) this.out += "\n";
    }
    // Quebra de linha explícita (<br>), pode gerar linha em branco.
    br() {
      this.out += "\n";
    }
    // Garante uma linha em branco antes da próxima saída.
    paragraph() {
      if (this.out === "") return;
      this.newline();
      if (!this.out.endsWith("\n\n")) this.out += "\n";
    }
  }

  function walk(node, b, ctx) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = ctx.pre ? node.nodeValue : node.nodeValue.replace(/[\s ]+/g, " ");
      b.text(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toUpperCase();
    if (SKIP_TAGS.has(tag)) return;

    if (tag === "BR") {
      b.br();
      return;
    }

    if (tag === "TR") {
      b.newline();
      const cells = Array.from(node.children).filter((c) => /^(TD|TH)$/i.test(c.tagName));
      const values = cells.map((cell) => {
        const inner = new TextBuilder();
        Array.from(cell.childNodes).forEach((child) => walk(child, inner, ctx));
        return cleanup(inner.out).replace(/\n+/g, " ");
      });
      b.text(values.join("\t"));
      b.newline();
      return;
    }

    if (tag === "A" && node.hasAttribute("data-vss-mention")) {
      b.text(MENTION_START + node.textContent.trim() + MENTION_END);
      return;
    }

    const isBlock = BLOCK_TAGS.has(tag) || PARAGRAPH_TAGS.has(tag);
    // Listas aninhadas não devem abrir linha em branco no meio da lista.
    const isNestedList = (tag === "UL" || tag === "OL") && node.parentElement && node.parentElement.closest("li");
    const isParagraph = PARAGRAPH_TAGS.has(tag) && !isNestedList;
    if (isBlock) b.newline();

    const childCtx = tag === "PRE" ? { ...ctx, pre: true } : ctx;
    Array.from(node.childNodes).forEach((child) => walk(child, b, childCtx));

    if (isParagraph) b.paragraph();
    else if (isBlock) b.newline();
  }

  function cleanup(text) {
    return text
      .split("\n")
      .map((line) => line.replace(/[  ]+$/g, "").replace(/^[  ]+/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function htmlToText(html, { stripLeadingMentions = false } = {}) {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    const b = new TextBuilder();
    walk(doc.body, b, { pre: false });
    let text = cleanup(b.out);
    if (stripLeadingMentions) {
      const leading = new RegExp(`^(\\s*${MENTION_START}[^${MENTION_END}]*${MENTION_END}[\\s,;:—–-]*)+`);
      text = text.replace(leading, "");
    }
    return text.replace(new RegExp(`[${MENTION_START}${MENTION_END}]`, "g"), "").trim();
  }

  function identityName(value) {
    if (!value) return "";
    if (typeof value === "string") return value.replace(/\s*<[^>]*>\s*$/, "").trim();
    return value.displayName || value.uniqueName || "";
  }

  function identityKey(value) {
    if (!value) return "";
    if (typeof value === "string") return value.toLowerCase().trim();
    return (value.id || value.uniqueName || value.displayName || "").toLowerCase();
  }

  // fields: objeto "fields" da API de work items; comments: lista da API de comentários.
  function formatWorkItem(id, fields, comments) {
    const sections = [`${id} - ${fields["System.Title"] || ""}`.trim()];

    const add = (label, html) => {
      const text = htmlToText(html);
      if (text) sections.push(`${label}:\n${text}`);
    };

    add("Description", fields["System.Description"]);
    add("Repro Steps", fields["Microsoft.VSTS.TCM.ReproSteps"]);
    add("System Info", fields["Microsoft.VSTS.TCM.SystemInfo"]);
    add("Acceptance Criteria", fields["Microsoft.VSTS.Common.AcceptanceCriteria"]);

    const assignedTo = fields["System.AssignedTo"];
    const assignedKeys = new Set([identityKey(assignedTo), identityName(assignedTo).toLowerCase()].filter(Boolean));

    (comments || []).forEach((comment) => {
      const text = htmlToText(comment.text, { stripLeadingMentions: true });
      if (!text) return;
      const author = comment.createdBy || {};
      const isDev =
        assignedKeys.has(identityKey(author)) ||
        assignedKeys.has((author.displayName || "").toLowerCase());
      const label = isDev || !author.displayName ? "Comentario do dev" : `Comentario de ${author.displayName}`;
      sections.push(`${label}:\n${text}`);
    });

    return sections.join("\n\n") + "\n";
  }

  globalThis.CopyPasteAzure = { htmlToText, formatWorkItem };
})();
