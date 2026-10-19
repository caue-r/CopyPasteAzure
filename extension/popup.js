const idInput = document.getElementById("id");
const statusEl = document.getElementById("status");
const preview = document.getElementById("preview");

function setStatus(message, state = "") {
  statusEl.textContent = message;
  statusEl.className = state;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isAzureUrl(url) {
  return /^https:\/\/(dev\.azure\.com|[^/]+\.visualstudio\.com)\//.test(url || "");
}

// Envia a mensagem ao content script, injetando-o se a aba foi aberta antes da instalação.
async function sendToTab(tab, message) {
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["formatter.js", "content.js"] });
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

async function copy(text) {
  await navigator.clipboard.writeText(text);
}

async function run(id) {
  const tab = await activeTab();
  if (!tab || !isAzureUrl(tab.url)) {
    setStatus("Abra um work item em dev.azure.com para usar a extensão.", "err");
    return;
  }
  setStatus(id ? `Buscando #${id}…` : "Buscando work item…");
  const result = await sendToTab(tab, { type: "copypasteazure:get", id: id || null });
  if (!result || !result.ok) {
    setStatus((result && result.error) || "Não foi possível obter o work item.", "err");
    idInput.focus();
    return;
  }
  idInput.value = result.id;
  preview.value = result.text;
  try {
    await copy(result.text);
    setStatus(`#${result.id} copiado para a área de transferência ✓`, "ok");
  } catch (err) {
    setStatus("Não foi possível copiar automaticamente. Selecione o texto abaixo e copie.", "err");
  }
}

document.getElementById("form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = idInput.value.trim();
  if (id && !/^\d+$/.test(id)) {
    setStatus("Informe um ID numérico.", "err");
    return;
  }
  run(id).catch((err) => setStatus(err.message, "err"));
});

document.getElementById("again").addEventListener("click", () => {
  if (!preview.value) return;
  copy(preview.value)
    .then(() => setStatus("Copiado novamente ✓", "ok"))
    .catch((err) => setStatus(err.message, "err"));
});

run(null).catch((err) => setStatus(err.message, "err"));
