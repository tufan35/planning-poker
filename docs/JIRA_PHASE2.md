# Faz 2 — Jira entegrasyonu

## Hedef

Oda veya ayar ekranından Jira Cloud backlog / sprint sorularını çekip görev listesini (`Task`: `id`, `title`, `jiraKey`, `externalId`) doldurmak.

## Önerilen yaklaşım

1. **Atlassian OAuth 2.0 (3LO)** ile kullanıcı bazlı erişim; kurum politikası izin veriyorsa **API token** ile sınırlı admin/tek kullanıcı senaryosu.
2. Next.js **Route Handler** veya Server Action ile token saklama (şifreli cookie veya sunucu tarafı oturum); asla istemciye ham token verme.
3. Jira REST örnekleri:
   - Board sprint issues: `/rest/agile/1.0/sprint/{id}/issue`
   - JQL arama: `/rest/api/3/search/jql` (veya sürüme göre `/search`)
4. Dönen issue’ları `Task` şemasına map et: `jiraKey` = `key`, `title` = `fields.summary`, `id` = stabil UUID veya `issue.id` ile prefix.
5. PartyKit tarafında `setTasks` mesajı zaten tam liste göndermeyi destekliyor; Jira’dan gelen liste moderatör tarafından tek seferde veya sayfalı olarak gönderilir.

## Güvenlik

- OAuth `state` parametresi ve PKCE.
- Jira webhook veya polling hız limitlerine uyum.
- Görev başlıklarında HTML kaçışı (XSS).

## MVP sonrası

- Board / sprint seçici UI.
- Yenileme düğmesi ve son çekilme zamanı.
