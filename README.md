# CopyPasteAzure

Extensão para Chrome/Edge que copia um work item do Azure DevOps (`dev.azure.com` / `*.visualstudio.com`) como texto limpo, no formato:

```
1800 - Encerrar sessão manualmente (logout)

Description:
Escopo: ...

Acceptance Criteria:
Usuário autenticado encontra uma ação explícita de "Sair" na interface.
...

Comentario do dev:
a feature está pronta para teste em homologação. ...
Ação	Esperado
Abrir o menu da conta (nome no canto superior direito)	Opção "Sair" disponível
```

## Instalação

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta `extension/` deste repositório.

## Uso

Com um work item aberto (página `/_workitems/edit/<id>` ou o diálogo aberto a partir de um board/backlog, `?workitem=<id>`), há três formas de copiar:

- o botão azul **📋 Copiar #ID** no canto inferior direito da página;
- o ícone da extensão na barra do navegador (mostra também uma prévia do texto e permite informar outro ID);
- o atalho **Alt+Shift+C**.

## Como funciona

A extensão não lê a tela: ela chama a API REST do Azure DevOps com a sessão já logada no navegador
(`_apis/wit/workitems/{id}` e `_apis/wit/workItems/{id}/comments`), então nada precisa ser expandido ou rolado na página
e não é necessário configurar token.

- Campos copiados (quando preenchidos): Title, Description, Repro Steps, System Info, Acceptance Criteria e os comentários, do mais antigo para o mais recente.
- O HTML vira texto: listas viram uma linha por item, tabelas viram linhas separadas por tabulação (coladas em Excel/Sheets voltam a ser tabela), negrito/itálico/links viram texto simples.
- Comentários do responsável pelo item (Assigned To) saem como `Comentario do dev:`; os demais como `Comentario de <Nome>:`.
- Menções no início do comentário (`@Fulano —`) são removidas.
