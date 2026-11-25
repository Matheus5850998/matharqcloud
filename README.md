# Viana Cloud

Aplicação SaaS pessoal e educacional construída com Next.js, Firebase e Supabase.

## Arquitetura

- Firebase Authentication: e-mail/senha, Google OAuth e recuperação de senha.
- Cloud Firestore: perfis, matérias, pastas, páginas, arquivos, tarefas e vínculos.
- Supabase Storage: armazenamento privado de até 50 MB por arquivo.
- Third-Party Auth: o Supabase valida o Firebase ID Token para aplicar RLS.
- Next.js App Router, Tailwind CSS, Framer Motion e Lucide.

## Configuração do Firebase

1. Acesse o [Firebase Console](https://console.firebase.google.com/) e crie um projeto.
2. Ative Authentication > Sign-in method > E-mail/senha e Google.
3. Adicione `localhost` e `vianacloud.vercel.app` em Authentication > Settings > Authorized domains.
4. Crie um banco Firestore em modo de produção.
5. Publique [firestore.rules](./firestore.rules) em Firestore > Rules.
6. Em Project Settings > General > Your apps, registre um app Web.
7. Copie os valores do Firebase SDK para `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

## Configuração do Supabase

1. Crie um projeto Supabase.
2. Em Authentication > Providers, adicione Third-Party Auth.
3. Selecione Firebase e informe o Project ID do Firebase.
4. Copie a Project URL e a publishable key em Project Settings > API.
5. Execute [supabase/migrations/20261124_firebase_third_party.sql](./supabase/migrations/20261124_firebase_third_party.sql) no SQL Editor.

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Nunca coloque `service_role` ou a senha do banco em variáveis públicas.

## Instalação local

Requer Node.js 20.9 ou superior.

```powershell
Copy-Item .env.example .env.local
npm.cmd install
npm.cmd run dev
```

Abra `http://localhost:3000`.

## Rotas principais

- `/login`: entrar, criar conta, Google e recuperação de senha.
- `/dashboard`: biblioteca pessoal, envio e monitoramento de armazenamento.

O dashboard cria documentos em `files` no Firestore e envia os bytes ao bucket privado `personal-files` no Supabase. O caminho no Storage começa com o UID do usuário Firebase.

## Contas de aluno e professor

1. Em `/login`, escolha **Criar conta** e selecione **Aluno** ou **Professor**.
2. O aluno informa a série. O professor encontra seu código no dashboard e o compartilha diretamente com seus alunos.
3. O aluno informa o código em **Vincular**. O vínculo fica em `teacherLinks`; o estudante continua dono do perfil.
4. O professor pode ler arquivos associados a matérias do aluno após o vínculo. Itens pessoais sem matéria permanecem privados.
5. Publique as regras atualizadas de [firestore.rules](./firestore.rules) no Firebase sempre que essa política mudar.

## Segurança

- Não reutilize a API key do Firebase como chave do Gemini.
- Mantenha o Google Cloud / Firebase no plano gratuito sem habilitar billing para recursos não planejados.
- A chave Gemini BYOK deve ficar somente no `localStorage` do usuário.
- Firestore Rules e políticas RLS devem ser testadas no Firebase Emulator Suite e no Supabase antes do lançamento.
- Os PDFs e documentos exigem renderizadores dedicados ainda não incluídos em todas as telas; não habilite `<iframe>` não autenticado para arquivos privados.

## Deploy gratuito

1. Faça o build local:

```powershell
npm.cmd run typecheck
npm.cmd run build
```

2. Publique o repositório no GitHub.
3. Importe o projeto na Vercel como Next.js.
4. Cadastre todas as variáveis `NEXT_PUBLIC_*` nos ambientes Production e Preview.
5. Em Project Settings > Domains, adicione/associe `vianacloud.vercel.app` ao projeto e confirme o DNS/ownership solicitado pela Vercel.
6. Adicione `vianacloud.vercel.app` como Authorized Domain no Firebase.
7. Mantenha o domínio da Vercel também configurado no Firebase e no Supabase Third-Party Auth.
