# Matharq Cloud

Painel pessoal de arquivos com Next.js App Router, Supabase Auth/Postgres/Storage, Tailwind CSS e Framer Motion. A interface suporta envio, download, exclusão e visualização privada no navegador de PDF, PPTX, DOCX, XLSX e imagens PNG/JPG/GIF/WebP.

## Arquitetura

```text
src/
  app/
    api/files/[id]/          # URLs assinadas e exclusão autenticada
    dashboard/               # Ações de segurança/MFA
    login/                   # Login, desafio TOTP e ações de autenticação
    globals.css              # Tema responsivo e animações
  components/
    Dashboard.tsx            # Painel pessoal
    FileManager.tsx          # Upload, biblioteca, busca e ações
    FileViewer.tsx           # Leitores de PDF, PPTX, DOCX, XLSX e imagens
    SettingsPanel.tsx        # Nome da saudação e cor de destaque
    LoginForm.tsx            # Login e transição de boas-vindas
    MfaSetup.tsx              # Cadastro e verificação de autenticador TOTP
  lib/
    auth.ts                  # Validação do proprietário e nível MFA
    files.ts                 # Tipos e utilidades de arquivos
    supabase/                 # Clientes SSR/browser e tipos do banco
  proxy.ts                    # Renovação segura dos cookies Supabase
supabase/schema.sql           # Esquema, proprietário, bucket privado e RLS
```

O navegador usa somente a **publishable key** do Supabase. A identidade é validada no servidor pelo UUID único em `SUPABASE_OWNER_ID`, e as políticas RLS repetem essa restrição no banco e no Storage. Não há cadastro público nem chave `service_role` no aplicativo. A sessão usa cookies gerenciados por `@supabase/ssr`; MFA TOTP é compatível e pode ser ativada no painel.

## Configuração local

### 1. Criar e restringir o projeto Supabase

1. Crie um projeto Supabase e escolha a região mais próxima de você.
2. Em **Authentication → Settings**, desative novos cadastros e logins anônimos. Crie manualmente o seu único usuário em **Authentication → Users** e confirme o e-mail.
3. Na conta criada, defina `full_name` nos metadados do usuário (por exemplo, `Matheus`). Copie o UUID exibido na lista de usuários.
4. No **SQL Editor**, abra [`supabase/schema.sql`](./supabase/schema.sql), substitua o UUID de exemplo pelo UUID real da sua conta e execute o script. Ele cria as tabelas, o bucket privado de até 50 MB por arquivo e as políticas RLS.
   - Se o projeto Supabase já estava configurado antes das preferências de tema/nome, execute também [`supabase/migrations/20261113_app_settings.sql`](./supabase/migrations/20261113_app_settings.sql) no SQL Editor.
5. Em **Project Settings → API**, copie a Project URL e a publishable key (`sb_publishable_...`). Nunca use `service_role`/secret key no site.
6. (Recomendado) Em **Authentication → Multi-Factor Authentication**, habilite TOTP. Depois de entrar, use **ATIVAR 2FA** para vincular seu app autenticador; o próximo login pedirá o código.

### 2. Instalar e iniciar

Requer Node.js 20.9 ou superior.

```powershell
npm.cmd install
Copy-Item .env.example .env.local
```

Preencha `.env.local` com os valores do seu projeto:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE
SUPABASE_OWNER_ID=UUID-DA-SUA-CONTA
NEXT_PUBLIC_DISPLAY_NAME=Matheus
```

`NEXT_PUBLIC_` marca somente valores públicos; a chave de serviço nunca é necessária. `.env.local` já está ignorado pelo Git.

```powershell
npm.cmd run dev
```

Abra `http://localhost:3000`. Os arquivos são enviados diretamente do navegador ao Storage privado do Supabase, com limite de 50 MB por arquivo. PDFs podem ser apresentados em tela cheia e paginados; PPTX é renderizado em modo apresentação; DOCX tem prévia somente de texto (não é um editor); XLSX tem prévia de até 500 linhas e 20 colunas por planilha; imagens são exibidas no visualizador integrado. DOCX e XLSX de até 20 MB podem ser pré-visualizados. Formatos antigos (`.ppt`, `.doc`, `.xls`) e OpenDocument não têm renderizador integrado e devem ser baixados ou convertidos para um dos formatos suportados. Recursos avançados de PowerPoint podem variar entre o visualizador web e o PowerPoint original.

Depois do login, a aba **Configurações** permite salvar o nome usado na saudação de entrada, escolher uma cor de destaque personalizada e trocar a senha confirmando a senha atual. As preferências ficam na tabela privada `public.app_settings`, protegida por RLS.

## Banco e segurança

- **Uma conta:** o UUID do proprietário precisa corresponder em configuração e em `public.app_owner`. Contas criadas por engano não passam pela aplicação nem pelas políticas RLS.
- **Postgres:** RLS obrigatório em `public.files`; leitura, inclusão e exclusão exigem o proprietário autenticado.
- **Storage:** bucket privado; políticas exigem a identidade do proprietário e o prefixo do caminho igual ao UUID autenticado.
- **Arquivos privados:** o app emite URLs assinadas de cinco minutos só após verificar sessão, UUID e RLS. Não há URLs públicas.
- **CSRF:** ações usam Server Actions do Next.js; a exclusão também valida a origem da solicitação.
- **XSS/SQL injection:** React escapa conteúdo exibido, nomes são armazenados como dados e as consultas Supabase usam parâmetros tipados.
- **Sessão:** cookies SSR renovados pelo Proxy; páginas e APIs verificam usuário e, se configurado, exigem MFA `aal2`.
- **MFA:** cadastro de TOTP e confirmação de código ficam no servidor; o segredo de configuração só é mostrado à sessão proprietária durante o vínculo inicial.

“Zero vulnerabilidades” não pode ser garantido por código ou fornecedor. Use senha exclusiva, MFA, mantenha dependências atualizadas, restrinja acesso ao projeto Supabase e revise periodicamente as políticas e os logs.

## Deploy gratuito e domínio próprio

1. Publique o projeto em um repositório Git privado seu.
2. Importe-o na [Vercel](https://vercel.com/) e mantenha o preset Next.js. O plano gratuito é voltado a projetos pessoais e pode mudar limites/condições.
3. Em **Project → Settings → Environment Variables**, cadastre as quatro variáveis de `.env.local` nos ambientes de produção e preview. Não cadastre uma chave de serviço.
4. Faça o deploy e adicione seu domínio em **Project → Settings → Domains**. A Vercel mostra os registros DNS específicos que devem ser configurados no registrador do domínio.
5. Depois da propagação DNS, confirme o HTTPS automático da Vercel. Em Supabase **Authentication → URL Configuration**, ajuste o Site URL para `https://seu-dominio` e adicione as URLs de produção/preview necessárias.
6. Faça novo deploy e teste login, MFA, upload, download, exclusão e visualização. Revise **Storage → Policies** e confirme que o bucket continua privado.

A hospedagem pode caber nos planos gratuitos; os limites de armazenamento, banda, tamanho do arquivo e inatividade são definidos pelos fornecedores e podem mudar. A Vercel oferece um endereço gratuito no formato `seu-projeto.vercel.app`, sujeito à disponibilidade do nome e às regras do plano. **Um domínio próprio (por exemplo, `.com` ou `.net`) normalmente exige pagamento e renovação**; não há garantia de um domínio personalizado gratuito, permanente e confiável. Não inclua arquivos sensíveis sem conferir a região, retenção e termos do plano.
