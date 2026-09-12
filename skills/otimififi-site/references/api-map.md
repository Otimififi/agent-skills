# REST API map (Bearer auth)

All requests: `Authorization: Bearer <OTIMIFIFI_ACCESS_TOKEN>`

| Action | Method | Path |
|--------|--------|------|
| Profile | GET | `/api/v1/profile` |
| Issue token | POST | `/api/v1/access-token` |
| Draft preview token | GET | `/api/v1/pages/:id/preview-token` |
| List sites | GET | `/api/v1/websites` |
| Create site | POST | `/api/v1/websites` |
| Get/update site | GET/PUT | `/api/v1/websites/:id` |
| Head assets | GET/PUT | `/api/v1/websites/:id/head-assets` |
| List/create pages | GET/POST | `/api/v1/websites/:id/pages` |
| Page detail | GET/PUT | `/api/v1/pages/:id` |
| Drafts | GET/POST | `/api/v1/pages/:id/drafts` |
| Update draft | PUT | `/api/v1/pages/:id/drafts/:version` |
| Commit draft | POST | `/api/v1/pages/:id/drafts/:version/commit` |
| Set live version | PUT | `/api/v1/pages/:id/change-version` |
| Prepare upload | POST | `/api/v1/media/prepare` |
| List media | GET | `/api/v1/media/list?site=:id` |
| Confirm upload | POST | `/api/v1/media/:asset_id` |

Draft version: `0` or negative integers. Positive versions are immutable releases.
