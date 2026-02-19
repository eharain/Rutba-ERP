# MySQL Init Scripts

Place your database dump file(s) here to seed the MySQL container on first startup.

The MySQL Docker image automatically executes files in this directory
**only when the data volume is empty** (i.e. the very first `docker compose up`).

Supported formats:
- `.sql`   — raw SQL
- `.sql.gz` — gzip-compressed SQL
- `.sh`    — shell scripts

Files are executed in **alphabetical order**, so prefix with numbers if
ordering matters (e.g. `01-schema.sql`, `02-seed-data.sql`).

## How to create a dump

```bash
# From a running MySQL instance:
mysqldump -u root -p rutba_pos > docker/mysql/init/01-rutba_pos.sql

# Or compressed:
mysqldump -u root -p rutba_pos | gzip > docker/mysql/init/01-rutba_pos.sql.gz
```

## Re-initializing

To force re-initialization, remove the Docker volume and restart:

```bash
docker compose down -v          # ⚠ destroys all data in mysql_data volume
docker compose up -d --build
```
