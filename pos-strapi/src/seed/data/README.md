# JSON Seed Data

Place one JSON file per entity/content-type in this directory.

## File format

```json
{
  "enabled": true,
  "uid": "api::content-type-name.content-type-name",
  "records": [
    {
      "locate": {
        "by": "slug",
        "value": "my-record-slug"
      },
      "policy": {
        "editable": false,
        "revertOnSeed": true
      },
      "data": {
        "title": "My Seeded Record"
      }
    }
  ]
}
```

## Behavior

- `locate.by`: any unique field used to find existing records (`slug`, `documentId`, `name`, ...)
- `locate.value`: unique value to find an existing draft document
- `policy.editable`:
  - `true`: seeded record can be edited manually
  - `false`: seed owns the record data
- `policy.revertOnSeed`:
  - `true`: updates existing record to match JSON on every seed run
  - `false`: keeps current DB values if the record already exists

Default policy if omitted: `editable=false`, `revertOnSeed=true`.

## Relation linking by slug/documentId

Use `$seedLink` anywhere inside `data`:

```json
{
  "category": {
    "$seedLink": {
      "uid": "api::category.category",
      "by": "slug",
      "value": "beverages",
      "return": "documentRef"
    }
  }
}
```

`return` can be:
- `documentRef` (default) → `{ "documentId": "..." }`
- `documentId` → `"..."`
- `id` → numeric id

If a target cannot be found, the link resolves to `null` and a warning is logged.
