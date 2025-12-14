<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1stzlHZ27vsdNLOQK-p9BmoNIpnwMmtxt

## Como testar o aplicativo

### Execução local (PC/Mac/Linux)
**Pré-requisitos:** Node.js 18+ e um navegador moderno.

1. **Clonar o repositório**
   ```bash
   git clone https://github.com/<seu-usuario>/bbrc_digital.git
   cd bbrc_digital
   ```
2. **Instalar dependências**
   ```bash
   npm install
   ```
3. **Configurar a chave do Gemini**
   Crie um arquivo `.env.local` na raiz com:
   ```bash
   GEMINI_API_KEY=SUAS-CHAVE-AQUI
   ```
4. **Executar em modo desenvolvimento**
   ```bash
   npm run dev
   ```
   O Vite exibirá a URL (normalmente `http://localhost:5173`). Abra-a no navegador.

> Dica: para testar reconhecimento de voz, use um navegador com suporte a captura de microfone e, se possível, habilite o site via `https` para evitar bloqueios de permissão em alguns sistemas.

### Execução em nuvem (sem instalar nada localmente)
- **GitHub Codespaces:** abra o repositório no GitHub, clique em **Code → Codespaces → Create codespace**. Ele já cria um ambiente com Node.js; basta rodar `npm install` e `npm run dev`. Use a porta encaminhada para acessar o app no navegador.
- **StackBlitz / Vercel Deploy Preview:** importe o repositório diretamente pela URL e forneça a variável `GEMINI_API_KEY` nas configurações do workspace. O comando padrão continua sendo `npm run dev` (para pré-visualizar) ou o fluxo de deploy do provedor.

### Testes automatizados
O projeto usa Vitest (`npm test`). Caso o provedor de nuvem bloqueie o registro do `vitest`, instale localmente ou use um ambiente que permita acesso ao registry npm.

## Publicar para outras pessoas testarem (GitHub Pages)
Já incluímos um fluxo de CI/CD (`.github/workflows/deploy.yml`) que gera uma versão estática e publica no GitHub Pages sem exigir servidor próprio.

1) **Habilite Pages no repositório**: Settings → Pages → Source: “GitHub Actions”.
2) **Defina a chave do Gemini (opcional)**: em Settings → Secrets → Actions, crie `GEMINI_API_KEY` se quiser que a build já inclua a chave (ela fica embutida no bundle; use apenas chaves de teste).
3) **Faça push na branch `main`** (ou clique em “Run workflow” na aba Actions). O workflow roda `npm ci && npm run build`, empacota `dist/` e publica automaticamente.
4) **Compartilhe a URL** exibida na aba Actions → Deployments (algo como `https://<seu-usuario>.github.io/bbrc_digital/`). O app está configurado com `base: './'`, então funciona em qualquer subcaminho do Pages.

> Para ambientes corporativos que bloqueiam GitHub Pages, você pode usar o mesmo pacote estático em qualquer CDN: rode `npm run build`, envie o conteúdo de `dist/` para o host desejado e sirva os arquivos de forma estática.

### Modo 100% front-end (sem backend)
- O app não depende de banco de dados ou API própria; os cadastros e resultados ficam no **`localStorage`** do navegador.
- A análise automática do desenho do relógio usa o Gemini **apenas se** a variável `GEMINI_API_KEY` estiver configurada. Em páginas estáticas sem chave, o avaliador pode registrar a nota manualmente (0–5) usando o controle na etapa de relógio, mantendo o fluxo completo funcional no GitHub Pages.
