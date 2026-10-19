// Roda nas páginas do Azure DevOps: detecta o work item aberto, busca os dados
// pela API REST (usando a sessão já logada do navegador) e copia o texto formatado.
(() => {
  if (globalThis.__copyPasteAzureLoaded) return;
  globalThis.__copyPasteAzureLoaded = true;

  const { formatWorkItem } = globalThis.CopyPasteAzure;

  // URL base da organização (coleção), ex.: https://dev.azure.com/minha-org
  function collectionUrl() {
    const { origin, hostname, pathname } = location;
    if (hostname === "dev.azure.com") {
      const org = pathname.split("/").filter(Boolean)[0];
      return org ? `${origin}/${org}` : null;
    }
    return origin; // https://minha-org.visualstudio.com
  }

  // Descobre o ID do work item aberto (página dedicada ou diálogo sobre um board/backlog/query).
  function detectWorkItemId() {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get("workitem") || params.get("workItemId");
    if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;

    const match = location.pathname.match(/\/_workitems\/edit\/(\d+)/i);
    return match ? match[1] : null;
  }

  async function getJson(url) {
    const response = await fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json", "X-TFS-FedAuthRedirect": "Suppress" }
    });
    if (!response.ok) {
      throw new Error(`Falha ao consultar a API do Azure DevOps (HTTP ${response.status}).`);
    }
    return response.json();
  }

  async function fetchComments(base, project, id) {
    const comments = [];
    let url =
      `${base}/${encodeURIComponent(project)}/_apis/wit/workItems/${id}/comments` +
      `?api-version=7.0-preview.3&order=asc&$top=200`;
    for (let page = 0; url && page < 20; page++) {
      const data = await getJson(url);
      comments.push(...(data.comments || []));
      url = data.nextPage || null;
    }
    return comments
      .filter((c) => !c.isDeleted)
      .sort((a, b) => new Date(a.createdDate) - new Date(b.createdDate));
  }

  async function buildText(id) {
    const base = collectionUrl();
    if (!base) throw new Error("Não foi possível identificar a organização do Azure DevOps nesta página.");

    const item = await getJson(`${base}/_apis/wit/workitems/${id}?api-version=7.0`);
    const fields = item.fields || {};
    let comments = [];
    try {
      comments = await fetchComments(base, fields["System.TeamProject"], id);
    } catch (err) {
      console.warn("[CopyPasteAzure] Não foi possível carregar os comentários:", err);
    }
    return formatWorkItem(id, fields, comments);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err) {
      // Sem foco/gesto do usuário: tenta o método antigo.
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("O navegador bloqueou a cópia para a área de transferência.");
  }

  // ---------- Botão flutuante na página ----------

  let host = null;
  let button = null;

  function ensureButton() {
    if (host) return;
    host = document.createElement("div");
    host.id = "copypasteazure-host";
    host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        button {
          font: 600 13px "Segoe UI", system-ui, sans-serif;
          color: #fff; background: #0078d4; border: 0; border-radius: 4px;
          padding: 9px 14px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.25);
        }
        button:hover { background: #106ebe; }
        button:disabled { opacity: .8; cursor: progress; }
        button.ok { background: #107c10; }
        button.err { background: #a4262c; }
      </style>
      <button type="button" title="Copiar título, descrição, critérios de aceite e comentários"></button>`;
    button = shadow.querySelector("button");
    button.addEventListener("click", onButtonClick);
    document.body.appendChild(host);
  }

  function setButton(label, state = "") {
    button.textContent = label;
    button.className = state;
    button.disabled = state === "busy";
  }

  async function onButtonClick() {
    const id = detectWorkItemId();
    if (!id) return;
    setButton("Copiando…", "busy");
    try {
      await copyToClipboard(await buildText(id));
      setButton("Copiado ✓", "ok");
    } catch (err) {
      console.error("[CopyPasteAzure]", err);
      setButton("Erro ao copiar", "err");
      button.title = err.message;
    }
    setTimeout(refreshButton, 2000);
  }

  function refreshButton() {
    const id = detectWorkItemId();
    if (!id) {
      if (host) host.style.display = "none";
      return;
    }
    ensureButton();
    host.style.display = "";
    if (button.className !== "busy") setButton(`📋 Copiar #${id}`);
  }

  // O Azure DevOps é uma SPA: a URL muda sem recarregar a página.
  let lastKey = "";
  setInterval(() => {
    const key = location.href + "|" + (detectWorkItemId() || "");
    if (key !== lastKey) {
      lastKey = key;
      refreshButton();
    }
  }, 800);

  // ---------- Mensagens do popup ----------

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "copypasteazure:get") {
      const id = message.id || detectWorkItemId();
      if (!id) {
        sendResponse({ ok: false, error: "Nenhum work item aberto nesta página. Informe o ID." });
        return false;
      }
      buildText(id)
        .then((text) => sendResponse({ ok: true, id, text }))
        .catch((err) => sendResponse({ ok: false, id, error: err.message }));
      return true;
    }
    if (message && message.type === "copypasteazure:detect") {
      sendResponse({ id: detectWorkItemId() });
    }
    return false;
  });
})();
