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
5. Publique [firestore.rules](./firestore.rules) em Firestore > Rules e o índice de [firestore.indexes.json](./firestore.indexes.json) em Firestore > Indexes. Com Firebase CLI, execute `firebase deploy --only firestore`.
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
- `/atividades`: prazos, resposta no editor e notas/correções do aluno.
- `/professor`: painel docente independente para publicar, acompanhar e corrigir atividades.

O dashboard cria documentos em `files` no Firestore e envia os bytes ao bucket privado `personal-files` no Supabase. O caminho no Storage começa com o UID do usuário Firebase.

## Contas de aluno e professor

1. Em `/login`, escolha **Criar conta** e selecione **Aluno** ou **Professor**.
2. O aluno informa a série. O professor encontra seu código no dashboard e o compartilha diretamente com seus alunos.
3. O professor deve entrar no painel e salvar suas matérias antes de compartilhar o código. O aluno informa o código em **Vincular**; o vínculo é registrado no Firestore e no Supabase, e o estudante continua dono do perfil.
4. Em **Atividades dos alunos**, o professor navega por série, aluno e matéria. Somente matérias cadastradas pelo professor ficam disponíveis; arquivos sem uma matéria compatível permanecem privados.
5. No `/professor`, o professor publica uma atividade para uma série ou para alunos selecionados; o estudante responde em `/atividades` usando editor de texto ou código. O editor oferece Java, indentação automática ao digitar e formatação de indentação, além de expansão em tela cheia; o professor também pode ampliar a revisão da entrega.
6. A entrega fica em uma coleção protegida por atividade. O professor atribui nota de 0 a 10, feedback, resposta modelo e marcações por trecho; os erros e correções são mostrados ao aluno em vermelho.
7. O Storage valida o vínculo e a matéria em RLS, além das regras de leitura dos metadados no Firestore. Isso também protege downloads por URL assinada, não apenas a interface.
8. Publique as regras e índices do Firestore e execute a migração atualizada do Supabase sempre que essa política mudar.

## Segurança

- Não reutilize a API key do Firebase como chave do Gemini.
- Mantenha o Google Cloud / Firebase no plano gratuito sem habilitar billing para recursos não planejados.
- A chave Gemini BYOK deve ficar somente no `localStorage` do usuário.
- Firestore Rules e políticas RLS devem ser testadas no Firebase Emulator Suite e no Supabase antes do lançamento.
- Arquivos privados devem ser abertos pelo leitor autenticado com URL assinada de curta duração; não exponha o bucket nem use `<iframe>` sem autenticação.

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
