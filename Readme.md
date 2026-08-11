# Almoxarifado SENAI — Arquivo Morto

Aplicação web para controle de estoque e gestão de Arquivo Morto / Depósito, com
entrada e saída de materiais via leitura de QR Code pelo celular.

🔗 Deploy: https://almoxarifado-senai.vercel.app/

## Stack

- **Frontend:** HTML5, CSS3 (+ Tailwind via CDN), JavaScript Vanilla (ES Modules), sem frameworks SPA.
- **Backend/Dados:** Supabase (PostgreSQL) — acessado diretamente do frontend via `@supabase/supabase-js`.
- **QR Code:**
  - Geração: [`qrcode`](https://www.npmjs.com/package/qrcode) (via esm.sh).
  - Leitura pela câmera: [`html5-qrcode`](https://github.com/mebjas/html5-qrcode).
- **PWA:** `manifest.json` + `sw.js` (instalável na tela inicial do celular).

> Este projeto é 100% estático (sem servidor Node/Express próprio): o Supabase
> atua como backend (banco de dados + API REST/Realtime), acessado com a chave
> `anon` diretamente do navegador, protegida por Row Level Security.
> Caso seu professor exija uma API Express intermediária, o mesmo client
> Supabase pode ser movido para rotas Express (`/api/products`, `/api/movements`
> etc.) sem alterar a lógica de negócio.

## Regra de negócio: código SKU

Todo produto segue o formato **`FFF.TTT.PPPP`**:

- `FFF`: código da Família (3 dígitos, sequencial)
- `TTT`: código do Tipo (3 dígitos, sequencial dentro da família)
- `PPPP`: código do Produto (4 dígitos, sequencial dentro de família+tipo)

Exemplo: `001.001.0042` → Família 001 (Documentos) · Tipo 001 (Caixas de Arquivo) · Produto 0042.

O código é gerado **automaticamente** ao salvar um novo produto, com base na
próxima sequência disponível para a combinação Família/Tipo escolhida.

## Estrutura de pastas

```
├── index.html        # Shell da aplicação (abas: Estoque, Scanner, Histórico, Famílias/Tipos)
├── styles.css         # Estilos (identidade visual SENAI)
├── app.js             # Toda a lógica (Supabase, QR, scanner, CRUD, histórico)
├── config.js          # Credenciais do Supabase (URL + anon key)
├── manifest.json       # Manifesto PWA
├── sw.js              # Service worker (cache do shell da aplicação)
├── icon.svg           # Ícone do app
└── schema.sql         # Script de criação das tabelas no Supabase
```

## Funcionalidades

### 1. Painel administrativo (aba "Estoque" + "Famílias / Tipos")
- Cadastro de **Famílias** e **Tipos**, com código sequencial automático.
- Cadastro de **Produtos**: escolha de família/tipo, geração automática do
  código `FFF.TTT.PPPP`, nome, descrição, localização, quantidade inicial e
  estoque mínimo.
- Botão **▦** em cada card gera o **QR Code** do produto e permite **imprimir
  a etiqueta** (código + QR), atendendo ao desafio bônus de impressão.
- Itens com quantidade ≤ estoque mínimo são destacados em vermelho
  ("Estoque baixo"), com filtro dedicado e contagem no topo (desafio bônus).

### 2. Fluxo móvel via QR Code (aba "Scanner QR")
- Botão para ativar a câmera do celular (usa `html5-qrcode`) e ler a etiqueta.
- Também é possível digitar o SKU manualmente (fallback sem câmera).
- Ao reconhecer o código, exibe nome, localização e saldo atual do item, com
  abas para **Entrada** (quantidade + responsável) e **Saída** (quantidade,
  motivo, responsável — valida se há saldo suficiente).
- Ao confirmar, o estoque é atualizado instantaneamente no Supabase e um
  registro é gravado na tabela `movements`.

### 3. Histórico (aba "Histórico")
- Tabela com todas as movimentações (entrada/saída), quantidade, responsável,
  motivo, saldo após a movimentação e data/hora.
- Busca por SKU, nome ou responsável, e filtro por tipo de movimentação.

### 4. PWA
- `manifest.json` + `sw.js` permitem instalar o app na tela inicial do
  celular e abrir em modo "standalone".

## Configuração e execução local

1. **Banco de dados (Supabase):**
   - Crie um projeto em https://supabase.com.
   - No SQL editor, execute o script `schema.sql` (cria `families`, `types`,
     `products`, `movements` e políticas de RLS).

2. **Credenciais (`.env` / `config.js`):**
   Como o frontend é estático, as credenciais ficam em `config.js`:
   ```js
   export const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
   export const SUPABASE_ANON_KEY = 'SUA_ANON_KEY';
   ```
   Se preferir usar variáveis de ambiente (ex: ao integrar com um build step
   ou backend Express), crie um `.env`:
   ```
   SUPABASE_URL=https://SEU-PROJETO.supabase.co
   SUPABASE_ANON_KEY=SUA_ANON_KEY
   ```

3. **Rodar localmente:**
   Como não há bundler, basta servir os arquivos estáticos, por exemplo:
   ```bash
   npx serve .
   # ou
   python3 -m http.server 5173
   ```
   Depois acesse `http://localhost:5173` (a leitura de câmera exige HTTPS ou
   `localhost`).

4. **Deploy:**
   Já publicado na Vercel como projeto estático (basta apontar a Vercel para
   a raiz do repositório — não há passo de build).

## Entregáveis

- Código-fonte completo (este repositório).
- `schema.sql` — script de criação/migração do banco.
- Este `README.md` com instruções de instalação, execução e configuração.
