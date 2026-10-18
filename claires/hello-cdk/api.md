# Target List API

A public REST API (Amazon API Gateway) for managing the list of websites the crawler monitors. Each request is handled by the CRUD Lambda (`lib/lambda/crud.js`), which reads and writes the **TargetsTable** in DynamoDB.

The crawler reads this table every time it runs, so any change made through the API is picked up on the next check (within 30 minutes).

## Base URL

The URL is printed after `cdk deploy` as the `SitesApiUrl` output:

```
https://<api-id>.execute-api.ap-southeast-2.amazonaws.com/v1/sites
```

In the examples below, replace `$API` with that URL. For example:

```bash
API=https://<api-id>.execute-api.ap-southeast-2.amazonaws.com/v1/sites
```

## Data format

Each site is stored as:

```json
{
  "id": "3f6c1a2e-8d4b-4c1e-9b7a-2f5e8c9d0a11",
  "url": "https://www.example.com",
  "createdAt": "2026-10-18T02:00:00.000Z",
  "updatedAt": "2026-10-18T03:00:00.000Z"
}
```

- `id`: created automatically when a site is added
- `url`: must start with `http://` or `https://`
- `createdAt`: set when the site is added
- `updatedAt`: only present after the site has been updated

All requests and responses use JSON.

---

## Endpoints

### Add a site

`POST /sites`

Request body:

```json
{ "url": "https://www.example.com" }
```

Example:

```bash
curl -X POST $API -H "Content-Type: application/json" -d '{"url":"https://www.example.com"}'
```

Responses:
- **201 Created:** the new site, including its `id`
- **400 Bad Request:** the URL is missing or invalid, or the body isn't valid JSON
- **409 Conflict:** this URL is already being monitored

### List all sites

`GET /sites`

Example:

```bash
curl $API
```

Responses:
- **200 OK:** an array of every site

### View one site

`GET /sites/{id}`

Example:

```bash
curl $API/3f6c1a2e-8d4b-4c1e-9b7a-2f5e8c9d0a11
```

Responses:
- **200 OK:** the site
- **404 Not Found:** no site has that `id`

### Update a site

`PUT /sites/{id}`

Request body:

```json
{ "url": "https://www.example.com/new-page" }
```

Example:

```bash
curl -X PUT $API/3f6c1a2e-8d4b-4c1e-9b7a-2f5e8c9d0a11 -H "Content-Type: application/json" -d '{"url":"https://www.example.com/new-page"}'
```

Responses:
- **200 OK:** the updated site
- **400 Bad Request:** the URL is missing or invalid
- **404 Not Found:** no site has that `id`

### Remove a site

`DELETE /sites/{id}`

Example:

```bash
curl -X DELETE $API/3f6c1a2e-8d4b-4c1e-9b7a-2f5e8c9d0a11
```

Responses:
- **200 OK:** `{ "message": "Site <id> deleted", "id": "<id>" }`
- **404 Not Found:** no site has that `id`

---

## Error format

Every error returns a JSON body with a `message`:

```json
{ "message": "Body must include a valid \"url\" starting with http:// or https://" }
```

## Security and reliability

- **Input validation:** only real `http://` or `https://` URLs are accepted, so junk can't be added to the crawler
- **No duplicates:** the same URL can't be added twice
- **Throttling:** API Gateway limits requests to 10 per second (burst of 20) to protect against abuse
- **Least privilege:** the CRUD Lambda can only read and write the TargetsTable; the crawler can only read it
- **Safe updates and deletes:** updating or deleting a site that doesn't exist returns 404 instead of creating or failing silently
- **Fallback:** if the crawler can't read the table, it falls back to `sites.json` so monitoring keeps running

## Notes

- On first deploy, the table is filled with the sites from `lib/lambda/sites.json`.
- Sites added through the API are crawled and their metrics appear in CloudWatch. The **"All sites - Availability"** dashboard widget shows them automatically.
- Per-site alarms are still created from `sites.json` at deploy time. Sites added only through the API don't get their own alarms until they are added to `sites.json` and redeployed.