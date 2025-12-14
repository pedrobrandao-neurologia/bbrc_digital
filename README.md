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
